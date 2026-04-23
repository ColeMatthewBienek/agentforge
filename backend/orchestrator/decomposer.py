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


class Decomposer:
    def __init__(self, pool: AgentPool, memory_manager=None) -> None:
        self._pool = pool
        self._memory_manager = memory_manager

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
