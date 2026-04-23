import logging
from datetime import datetime, timezone
from uuid import uuid4

logger = logging.getLogger(__name__)

PM_SYSTEM_PROMPT = """You are a senior technical project manager and architect collaborating
with a developer to plan a software project. Your job is NOT to say yes to everything.

Your responsibilities:
- Ask clarifying questions about requirements that are vague or ambiguous
- Challenge assumptions that could lead to overengineered or underengineered solutions
- Surface technical risks, dependencies, and edge cases the developer may not have considered
- Propose architecture approaches and get alignment before proceeding
- Ensure every major decision is explicit and documented
- When you feel the plan is solid and complete, say so explicitly

When the developer says the plan is ready, output a structured plan document in this format:

## Project: [Name]
## Summary
[2-3 sentence description]

## Goals
- [concrete, measurable goal]
...

## Architecture
[key technical decisions, stack choices, patterns]

## Components
[list of major components to build]

## Out of Scope
[what is explicitly NOT being built]

## Open Questions
[anything still unresolved — EM will flag these]

Do not output this document until the developer explicitly says the plan is ready.
Until then, keep asking questions and challenging the plan."""


class ProjectPlanner:
    """
    Manages the interactive planning session between the user and Claude PM agent.
    The PM session uses the existing chat WebSocket infrastructure with a special
    system prompt injected as context.
    """

    def __init__(self, pool, memory_manager=None) -> None:
        self._pool = pool
        self._memory_manager = memory_manager

    async def create_project(self, name: str, description: str, db) -> str:
        """Creates a project row. Returns project_id."""
        project_id = str(uuid4())[:12]
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "INSERT INTO projects (id, name, description, status, created_at, updated_at) "
            "VALUES (?, ?, ?, 'planning', ?, ?)",
            (project_id, name, description or "", now, now),
        )
        await db.commit()
        logger.info("Project created: %s (%s)", project_id, name)
        return project_id

    def build_pm_context(self, project_name: str, prior_context: str = "") -> str:
        """Returns enriched system context to prepend to the first PM message."""
        ctx = PM_SYSTEM_PROMPT
        if prior_context:
            ctx += f"\n\n--- Prior context from memory ---\n{prior_context}\n---"
        ctx += f"\n\nProject name: {project_name}"
        return ctx

    def extract_plan_document(self, messages: list[dict]) -> str | None:
        """
        Looks for the structured plan document in assistant messages.
        Returns the plan text if found, None if not yet finalized.
        """
        for msg in reversed(messages):
            if msg.get("role") == "assistant" and "## Project:" in msg.get("content", ""):
                return msg["content"]
        return None

    async def finalize_plan(self, project_id: str, plan_document: str, db) -> None:
        """Stores the finalized plan and transitions project to 'decomposing'."""
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "UPDATE projects SET plan_document = ?, status = 'decomposing', updated_at = ? "
            "WHERE id = ?",
            (plan_document, now, project_id),
        )
        await db.commit()
        logger.info("Project %s plan finalized (%d chars)", project_id, len(plan_document))

    async def create_run(self, project_id: str, db) -> str:
        """Creates a project_run row. Returns run_id."""
        run_id = str(uuid4())[:12]
        now = datetime.now(timezone.utc).isoformat()
        await db.execute(
            "INSERT INTO project_runs (id, project_id, status, started_at) VALUES (?, ?, 'running', ?)",
            (run_id, project_id, now),
        )
        await db.execute(
            "UPDATE projects SET status = 'decomposing', updated_at = ? WHERE id = ?",
            (now, project_id),
        )
        await db.commit()
        return run_id
