import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

logger = logging.getLogger(__name__)

EM_SYSTEM_PROMPT = """You are a senior Engineering Manager reviewing a task list before
execution by AI agents. Ensure every task is:

1. ATOMIC — completable by one agent in 15-60 minutes. If larger, split it.
2. SPECIFIED — has clear acceptance criteria. If unclear, kick back to PM.
3. CORRECTLY ROUTED — executor_tier matches actual complexity.
4. DEPENDENCY-CORRECT — dependencies necessary and sufficient.

Actions per task:
- "approve" — task is good as-is
- "split" — too large; provide replacement_tasks array
- "modify" — needs clarification; provide updated prompt/criteria
- "kick_back" — too unclear; provide specific questions for PM

Be decisive. Approve what is clear. Split what is large. Kick back only genuine ambiguity.

Respond ONLY with a valid JSON array of review actions.

[
  {"action": "approve", "task_id": "task-1"},
  {
    "action": "split",
    "task_id": "task-2",
    "reason": "Covers both schema and API layer",
    "replacement_tasks": [
      {"id": "task-2a", "title": "Create schema", "prompt": "...", "dependencies": ["task-1"], "complexity": "low", "executor_tier": "qwen", "acceptance_criteria": "..."},
      {"id": "task-2b", "title": "Implement API", "prompt": "...", "dependencies": ["task-2a"], "complexity": "medium", "executor_tier": "haiku", "acceptance_criteria": "..."}
    ]
  },
  {"action": "kick_back", "task_id": "task-5", "reason": "Which auth library? JWT, sessions, or OAuth?"}
]"""


class EngineeringManager:
    def __init__(self, pool, memory_manager=None) -> None:
        self._pool = pool
        self._memory_manager = memory_manager

    async def review(
        self,
        tasks: list,
        project_id: str,
        project_run_id: str,
        plan_document: str,
        db,
        websocket=None,
    ) -> tuple[list, list[str]]:
        """
        Reviews the task list.
        Returns (approved_tasks, kick_back_questions).
        On EM parse failure: approves all tasks as-is (never blocks execution).
        """
        if websocket:
            await websocket.send_json({
                "type": "em_review_started",
                "project_id": project_id,
                "task_count": len(tasks),
            })

        prompt = self._build_prompt(tasks, plan_document)
        slot = await self._pool.acquire(task_id=project_run_id, task_title="EM review")
        try:
            raw = await slot.agent.run_oneshot(prompt, timeout=120)
        finally:
            await self._pool.release(slot)

        actions, parse_error = self._parse_actions(raw)
        if parse_error:
            logger.error("EM parse failed: %s\nRaw:\n%s", parse_error, raw[:2000])
            return tasks, []

        return await self._apply_actions(actions, tasks, project_id, project_run_id, db, websocket)

    def _build_prompt(self, tasks: list, plan_document: str) -> str:
        task_json = json.dumps([{
            "id": t.id,
            "title": t.title,
            "prompt": t.prompt,
            "dependencies": t.dependencies,
            "complexity": t.complexity,
            "executor_tier": getattr(t, "executor_tier", "sonnet"),
            "acceptance_criteria": getattr(t, "acceptance_criteria", ""),
        } for t in tasks], indent=2)

        return (
            f"{EM_SYSTEM_PROMPT}\n\n"
            f"--- Project Plan (context) ---\n{plan_document[:3000]}\n---\n\n"
            f"--- Task List ---\n{task_json}\n---"
        )

    def _parse_actions(self, raw: str) -> tuple[list[dict], str | None]:
        from backend.orchestrator.decomposer import Decomposer
        candidate = Decomposer._extract_json(raw)
        if candidate is None:
            return [], f"No JSON array found in EM output"
        try:
            parsed = json.loads(candidate)
            if not isinstance(parsed, list):
                return [], "Expected JSON array from EM"
            return parsed, None
        except json.JSONDecodeError as e:
            return [], f"EM JSON parse error: {e}"

    async def _apply_actions(self, actions, tasks, project_id, project_run_id, db, websocket):
        from backend.orchestrator.decomposer import TaskSpec

        task_map = {t.id: t for t in tasks}
        final_tasks: list = []
        kick_backs: list[str] = []
        now = datetime.now(timezone.utc).isoformat()

        for action in actions:
            act = action.get("action")
            task_id = action.get("task_id")
            reason = action.get("reason", "")

            if act == "approve":
                task = task_map.get(task_id)
                if task:
                    final_tasks.append(task)
                await self._log(db, project_run_id, "approved", task_id, None, reason, now)

            elif act == "split":
                replacements = action.get("replacement_tasks", [])
                for r in replacements:
                    new_task = TaskSpec(
                        id=str(r.get("id", str(uuid4())[:8])),
                        title=str(r.get("title", "Untitled")),
                        prompt=str(r.get("prompt", "")),
                        dependencies=[str(d) for d in r.get("dependencies", [])],
                        complexity=str(r.get("complexity", "medium")),
                    )
                    new_task.executor_tier = str(r.get("executor_tier", "sonnet"))
                    new_task.acceptance_criteria = str(r.get("acceptance_criteria", ""))
                    new_task.session_id = project_run_id
                    new_task.project_id = project_id
                    new_task.project_run_id = project_run_id
                    final_tasks.append(new_task)
                    try:
                        await db.execute(
                            "INSERT INTO build_tasks "
                            "(id, session_id, title, prompt, dependencies, complexity, "
                            " status, kanban_column, acceptance_criteria, executor_tier, "
                            " project_id, project_run_id, created_at) "
                            "VALUES (?,?,?,?,?,?,'pending','backlog',?,?,?,?,?)",
                            (new_task.id, project_run_id, new_task.title, new_task.prompt,
                             json.dumps(new_task.dependencies), new_task.complexity,
                             new_task.acceptance_criteria, new_task.executor_tier,
                             project_id, project_run_id, now),
                        )
                    except Exception as e:
                        logger.warning("Failed to insert split task %s: %s", new_task.id, e)

                new_ids = [r.get("id") for r in replacements]
                await self._log(db, project_run_id, "split", task_id, json.dumps(new_ids), reason, now)
                if websocket:
                    try:
                        await websocket.send_json({
                            "type": "em_action",
                            "action": "split",
                            "original_task_id": task_id,
                            "new_task_ids": new_ids,
                            "reason": reason,
                        })
                    except Exception:
                        pass

            elif act == "modify":
                task = task_map.get(task_id)
                if task:
                    task.prompt = action.get("prompt", task.prompt)
                    task.acceptance_criteria = action.get(
                        "acceptance_criteria", getattr(task, "acceptance_criteria", "")
                    )
                    task.executor_tier = action.get(
                        "executor_tier", getattr(task, "executor_tier", "sonnet")
                    )
                    final_tasks.append(task)
                await self._log(db, project_run_id, "modified", task_id, None, reason, now)

            elif act == "kick_back":
                kick_backs.append(f"**{task_id}**: {reason}")
                try:
                    await db.execute(
                        "UPDATE build_tasks SET kanban_column = 'blocked', em_notes = ? WHERE id = ?",
                        (reason, task_id),
                    )
                except Exception:
                    pass
                await self._log(db, project_run_id, "kicked_back", task_id, None, reason, now)
                if websocket:
                    try:
                        await websocket.send_json({
                            "type": "em_action",
                            "action": "kick_back",
                            "task_id": task_id,
                            "reason": reason,
                        })
                    except Exception:
                        pass

        try:
            await db.commit()
        except Exception as e:
            logger.warning("EM apply_actions db commit failed: %s", e)

        if websocket:
            try:
                await websocket.send_json({
                    "type": "em_review_complete",
                    "project_id": project_id,
                    "approved": len(final_tasks),
                    "kicked_back": len(kick_backs),
                })
            except Exception:
                pass

        return final_tasks, kick_backs

    async def _log(self, db, run_id, action, task_id, new_ids, reason, now):
        try:
            await db.execute(
                "INSERT INTO em_review_log (id, project_run_id, action, task_id, "
                "new_task_ids, reason, created_at) VALUES (?,?,?,?,?,?,?)",
                (str(uuid4()), run_id, action, task_id, new_ids, reason, now),
            )
        except Exception as e:
            logger.warning("EM log failed: %s", e)
