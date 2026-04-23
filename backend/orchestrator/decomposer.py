import asyncio
import json
import logging
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

from backend.pool.agent_pool import AgentPool

logger = logging.getLogger(__name__)


@dataclass
class TaskSpec:
    id: str
    title: str
    prompt: str
    dependencies: list[str]
    complexity: str  # low | medium | high
    status: str = "pending"
    session_id: str = ""
    slot_id: str | None = None
    worktree_path: str | None = None
    output: str = ""
    error: str | None = None
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    completed_at: str | None = None
    # Project orchestration fields
    acceptance_criteria: str = ""
    executor_tier: str | None = None  # qwen | haiku | sonnet | opus; None = use complexity default
    project_id: str | None = None
    project_run_id: str | None = None
    kanban_column: str = "backlog"
    em_notes: str = ""


class Decomposer:
    def __init__(self, pool: AgentPool, memory_manager=None) -> None:
        self._pool = pool
        self._memory_manager = memory_manager
        self._ollama = None  # set by main.py to OllamaAgent instance

    async def decompose(
        self,
        direction: str,
        workdir: str,
        plan_session_id: str,
        chat_session_id: str | None = None,
    ) -> tuple[list[TaskSpec], str | None]:
        """
        Returns (tasks, decomposer_error).
        Success: (task_list, None)
        Failure: ([fallback_single_task], error_message)
        Never raises.
        """
        decomposer_error: str | None = None

        enriched_direction = direction
        if self._memory_manager and chat_session_id:
            try:
                enriched_direction = await self._memory_manager.build_context(
                    direction, session_id=chat_session_id
                )
            except Exception as e:
                logger.warning("Decomposer context injection failed: %s", e)

        slot = await self._pool.acquire(task_id=plan_session_id, task_title="decomposing...")
        try:
            prompt = self._build_prompt(enriched_direction, workdir)
            raw_output = await slot.agent.run_oneshot(prompt, timeout=90)
            tasks, parse_error = self._parse(raw_output, direction)

            if parse_error:
                decomposer_error = (
                    f"Decomposer parse error: {parse_error}\n"
                    f"Raw output ({len(raw_output)} chars):\n{raw_output[:2000]}"
                )
                logger.error(
                    "Decomposer parse failed for '%s': %s\nRaw:\n%s",
                    direction[:80], parse_error, raw_output[:2000],
                )
            else:
                logger.info("Decomposed '%s' into %d tasks", direction[:60], len(tasks))
                if self._memory_manager and tasks:
                    summary = "\n".join(
                        f"- [{t.complexity}] {t.title}: {t.prompt[:150]}" for t in tasks
                    )
                    await self._memory_manager.on_message(
                        role="assistant",
                        content=f"[Plan decomposed: {direction[:100]}]\n{summary}",
                        session_id=plan_session_id,
                    )

            return tasks, decomposer_error

        except asyncio.TimeoutError:
            decomposer_error = (
                f"Decomposer timed out after 90s — Claude did not respond.\n"
                f"Direction: {direction[:200]}\nFalling back to single-task execution."
            )
            logger.error("Decomposer timeout for '%s'", direction[:80])
            return self._fallback(direction), decomposer_error

        except Exception as e:
            tb = traceback.format_exc()
            decomposer_error = (
                f"Decomposer error: {type(e).__name__}: {e}\n"
                f"Direction: {direction[:200]}\n"
                f"Falling back to single-task execution.\nFull traceback in backend.log."
            )
            logger.error("Decomposer exception for '%s':\n%s", direction[:80], tb)
            return self._fallback(direction), decomposer_error

        finally:
            await self._pool.release(slot)

    def _build_prompt(self, direction: str, workdir: str) -> str:
        return f"""You are a software task decomposer for an AI agent system.
Break down the following development direction into discrete, executable tasks.

Project directory: {workdir}

Rules:
- Each task must be atomic and completable by one agent independently
- Size each task for 5-30 minutes of focused work
- Maximize parallel execution: tasks with no dependencies run simultaneously
- Dependencies: list the task IDs that must complete before this one starts
- Each task prompt must be fully self-contained — the agent only receives that prompt
- Include file paths, acceptance criteria, and expected behavior in every prompt
- Maximum 8 tasks total; combine related work if needed

Respond ONLY with a valid JSON array. No preamble, no markdown fences, no other text.

[
  {{
    "id": "task-1",
    "title": "Short title",
    "prompt": "Complete self-contained prompt with file paths, expected behavior, and acceptance criteria.",
    "dependencies": [],
    "complexity": "low"
  }}
]

Direction to decompose:
{direction}"""

    def _parse(self, raw_output: str, direction: str) -> tuple[list[TaskSpec], str | None]:
        clean = raw_output.strip()
        if not clean:
            return self._fallback(direction), "Claude returned an empty response"

        # Extract JSON from wherever it appears — Claude sometimes adds preamble text
        # before the code fence. Try strategies in order of specificity.
        candidate = self._extract_json(clean)
        if candidate is None:
            return self._fallback(direction), f"No JSON array found in Claude output (first 200 chars): {clean[:200]!r}"

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as e:
            return self._fallback(direction), f"Invalid JSON from Claude: {e}"

        if not isinstance(parsed, list):
            return self._fallback(direction), f"Expected JSON array, got {type(parsed).__name__}"
        if len(parsed) == 0:
            return self._fallback(direction), "Claude returned an empty task list"

        tasks = []
        for i, item in enumerate(parsed[:8]):
            if not isinstance(item, dict):
                return self._fallback(direction), f"Task {i} is not a JSON object: {item!r}"
            tasks.append(TaskSpec(
                id=str(item.get("id", str(uuid4())[:8])),
                title=str(item.get("title", "Untitled task")),
                prompt=str(item.get("prompt", direction)),
                dependencies=[str(d) for d in item.get("dependencies", [])],
                complexity=str(item.get("complexity", "medium")),
            ))
        return tasks, None

    @staticmethod
    def _extract_json(text: str) -> str | None:
        """Pull a JSON array out of text that may contain prose or code fences."""
        import re

        # 1. Fenced block anywhere: ```json [...] ``` or ``` [...] ```
        fence = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
        if fence:
            return fence.group(1).strip()

        # 2. Bare array at start (original behavior)
        stripped = text.strip()
        if stripped.startswith("["):
            return stripped

        # 3. First '[' to matching ']' — handles preamble before bare array
        start = text.find("[")
        if start != -1:
            # Walk forward to find the balanced closing bracket
            depth = 0
            for i, ch in enumerate(text[start:], start):
                if ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
                    if depth == 0:
                        return text[start : i + 1]

        return None

    def _fallback(self, direction: str) -> list[TaskSpec]:
        return [TaskSpec(
            id="task-1",
            title="Execute direction",
            prompt=direction,
            dependencies=[],
            complexity="medium",
        )]

    # ── Project-level decomposition (uses OllamaAgent) ────────────────────────

    async def decompose_project(
        self,
        project_id: str,
        project_run_id: str,
        plan_document: str,
        workdir: str,
        db,
        plan_session_id: str | None = None,
    ) -> tuple[list[TaskSpec], str | None]:
        """
        Project-level decomposition. Uses OllamaAgent (Qwen) instead of Claude.
        Returns (tasks, error_or_None). Never raises.
        """
        if self._ollama is None:
            return [], "OllamaAgent not configured — call main.py to inject it"

        decomposer_error: str | None = None
        try:
            if not await self._ollama.health_check():
                raise RuntimeError(
                    f"Ollama not running or model '{self._ollama.model}' not pulled. "
                    f"Run: ollama pull {self._ollama.model}"
                )

            prompt = self._build_project_prompt(plan_document, workdir)
            raw_output = await self._ollama.run_oneshot(prompt, timeout=120)
            tasks, parse_error = self._parse_project(raw_output, plan_document)

            if parse_error:
                decomposer_error = (
                    f"Project decomposer parse error: {parse_error}\n"
                    f"Raw output ({len(raw_output)} chars):\n{raw_output[:2000]}"
                )
                logger.error("Project decomposer parse failed: %s\nRaw:\n%s",
                             parse_error, raw_output[:2000])
                return [], decomposer_error

            logger.info("Project %s decomposed into %d tasks", project_id, len(tasks))
            now = datetime.utcnow().isoformat()
            for task in tasks:
                task.session_id = project_run_id
                task.project_id = project_id
                task.project_run_id = project_run_id
                try:
                    await db.execute(
                        "INSERT INTO build_tasks "
                        "(id, session_id, title, prompt, dependencies, complexity, "
                        " status, kanban_column, acceptance_criteria, executor_tier, "
                        " project_id, project_run_id, created_at) "
                        "VALUES (?,?,?,?,?,?,'pending','backlog',?,?,?,?,?)",
                        (task.id, project_run_id, task.title, task.prompt,
                         json.dumps(task.dependencies), task.complexity,
                         task.acceptance_criteria, task.executor_tier,
                         project_id, project_run_id, now),
                    )
                except Exception as e:
                    logger.warning("Failed to insert task %s: %s", task.id, e)
            try:
                await db.execute(
                    "UPDATE project_runs SET total_tasks = ? WHERE id = ?",
                    (len(tasks), project_run_id),
                )
                await db.execute(
                    "UPDATE projects SET status = 'em_review', updated_at = ? WHERE id = ?",
                    (now, project_id),
                )
                await db.commit()
            except Exception as e:
                logger.warning("Failed to update project status after decompose: %s", e)

            return tasks, None

        except Exception as e:
            import traceback as tb
            decomposer_error = (
                f"Project decomposer error: {type(e).__name__}: {e}\n"
                f"Full traceback logged to backend.log."
            )
            logger.error("Project decomposer exception:\n%s", tb.format_exc())
            return [], decomposer_error

    def _build_project_prompt(self, plan_document: str, workdir: str) -> str:
        return f"""You are a software task decomposer. Receive a finalized project plan and break it into discrete, executable development tasks.

Project directory: {workdir}

Rules:
- Each task must be atomic: completable by one agent in 15-60 minutes
- Maximize parallelism — only add dependencies when strictly required
- Each task prompt must be fully self-contained with file paths and acceptance criteria
- Suggest executor_tier:
    "qwen"   — boilerplate, simple CRUD, config changes
    "haiku"  — standard feature implementation, moderate logic
    "sonnet" — complex logic, architecture, multi-file refactors
    "opus"   — security-critical, novel design, hardest problems
- Maximum 20 tasks total

Respond ONLY with a valid JSON array. No preamble, no markdown fences.

[
  {{
    "id": "task-1",
    "title": "Short descriptive title",
    "prompt": "Fully self-contained prompt with file paths, expected behavior, and acceptance criteria.",
    "dependencies": [],
    "complexity": "low",
    "executor_tier": "qwen",
    "acceptance_criteria": "What done looks like — specific and testable."
  }}
]

Project Plan:
{plan_document}"""

    def _parse_project(self, raw_output: str, plan_document: str) -> tuple[list[TaskSpec], str | None]:
        candidate = self._extract_json(raw_output)
        if candidate is None:
            return [], f"No JSON array found in output (first 200 chars): {raw_output[:200]!r}"

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as e:
            return [], f"Invalid JSON from Ollama: {e}"

        if not isinstance(parsed, list) or len(parsed) == 0:
            return [], "Ollama returned an empty task list"

        tasks = []
        for i, item in enumerate(parsed[:20]):
            if not isinstance(item, dict):
                return [], f"Task {i} is not a JSON object"
            task = TaskSpec(
                id=str(item.get("id", str(uuid4())[:8])),
                title=str(item.get("title", "Untitled")),
                prompt=str(item.get("prompt", "")),
                dependencies=[str(d) for d in item.get("dependencies", [])],
                complexity=str(item.get("complexity", "medium")),
            )
            task.acceptance_criteria = str(item.get("acceptance_criteria", ""))
            task.executor_tier = str(item.get("executor_tier", "sonnet"))
            tasks.append(task)

        return tasks, None
