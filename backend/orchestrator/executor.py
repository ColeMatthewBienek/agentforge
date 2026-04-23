import asyncio
import inspect
import logging
from datetime import datetime, timezone
from typing import Callable, Awaitable

from backend.pool.agent_pool import AgentPool
from backend.pool.workdir import WorkdirManager

logger = logging.getLogger(__name__)

OnChunk = Callable[[str], None | Awaitable[None]]


class TaskExecutor:
    def __init__(self, pool: AgentPool, workdir_manager: WorkdirManager) -> None:
        self._pool = pool
        self._workdir_manager = workdir_manager

    async def run(
        self,
        task_id: str,
        prompt: str,
        base_dir: str,
        on_chunk: OnChunk,
        parallel: bool = True,
    ) -> None:
        workdir = await self._workdir_manager.resolve(task_id, base_dir, parallel)
        slot = await self._pool.acquire(task_id=task_id, task_title=prompt[:60])
        try:
            slot.agent.workdir = workdir
            await slot.agent.send(prompt)
            async for chunk in slot.agent.stream_output(idle_timeout=120.0):
                result = on_chunk(chunk)
                if inspect.isawaitable(result):
                    await result
        finally:
            await self._pool.release(slot)
            if parallel:
                await self._workdir_manager.cleanup(task_id, base_dir)


class TaskGraphExecutor:
    """
    Dependency-aware parallel task executor for /plan sessions.
    Distinct from TaskExecutor (single-task /build worktree runner).
    """

    def __init__(
        self,
        pool: AgentPool,
        workdir_manager: WorkdirManager,
        memory_manager=None,
    ) -> None:
        self._pool = pool
        self._workdir_manager = workdir_manager
        self._memory_manager = memory_manager
        # task_id → claude session_id captured after each task run, enabling follow-up replies
        self._task_sessions: dict[str, str | None] = {}

    def get_task_session_id(self, task_id: str) -> str | None:
        return self._task_sessions.get(task_id)

    async def execute(
        self,
        tasks: list,
        plan_session_id: str,
        chat_session_id: str,
        workdir: str,
        websocket,
        db,
    ) -> None:
        from backend.orchestrator.decomposer import TaskSpec

        await websocket.send_json({
            "type": "task_graph",
            "session_id": plan_session_id,
            "tasks": [self._task_dict(t) for t in tasks],
        })

        task_map = {t.id: t for t in tasks}
        completed: set[str] = set()
        failed: set[str] = set()
        running_futures: dict[str, asyncio.Task] = {}

        async def _run_one(task) -> None:
            await self._run_task(task, plan_session_id, chat_session_id, workdir, websocket, db)

        while True:
            ready = [
                t for t in tasks
                if t.status == "pending"
                and all(dep in completed for dep in t.dependencies)
                and t.id not in running_futures
            ]

            for task in ready:
                task.status = "running"
                await self._persist_task(db, task)
                await self._emit_task_update(websocket, task)
                running_futures[task.id] = asyncio.create_task(_run_one(task))

            all_terminal = all(t.status in ("complete", "error", "cancelled") for t in tasks)
            if all_terminal:
                break

            pending_tasks = [t for t in tasks if t.status == "pending"]
            if not running_futures and pending_tasks:
                logger.error("Deadlock: %d tasks pending but none can run", len(pending_tasks))
                for t in pending_tasks:
                    t.status = "error"
                    t.error = "Deadlock: dependency could not be satisfied"
                    await self._persist_task(db, t)
                    await self._emit_task_update(websocket, t)
                break

            if not running_futures:
                break

            done, _ = await asyncio.wait(
                running_futures.values(),
                return_when=asyncio.FIRST_COMPLETED,
            )

            for fut in done:
                task_id = next(tid for tid, f in running_futures.items() if f is fut)
                del running_futures[task_id]
                task = task_map[task_id]

                if fut.exception():
                    failed.add(task_id)
                else:
                    completed.add(task_id)

        succeeded = sum(1 for t in tasks if t.status == "complete")
        total = len(tasks)
        await websocket.send_json({
            "type": "build_complete",
            "session_id": plan_session_id,
            "total": total,
            "succeeded": succeeded,
            "failed": total - succeeded,
        })

        final_status = "complete" if succeeded == total else "error"
        now = datetime.now(timezone.utc).isoformat()
        try:
            await db.execute(
                "UPDATE build_sessions SET status = ?, completed_at = ? WHERE id = ?",
                (final_status, now, plan_session_id),
            )
            await db.execute(
                "UPDATE sessions SET status = ?, completed_at = ? WHERE id = ?",
                (final_status, now, plan_session_id),
            )
            await db.commit()
        except Exception as e:
            logger.error("Failed to update plan session status: %s", e)

    async def _run_task(self, task, plan_session_id, chat_session_id, workdir, websocket, db) -> None:
        slot = None
        worktree_path = None

        def _now() -> str:
            return datetime.now(timezone.utc).isoformat()

        prompt = task.prompt
        if self._memory_manager:
            try:
                plan_ctx = await self._memory_manager._store.search_scoped(
                    task.prompt, session_ids=[plan_session_id], limit=3
                )
                chat_ctx = await self._memory_manager._store.search_scoped(
                    task.prompt, session_ids=[chat_session_id], limit=3
                )
                all_ctx = list({r.id: r for r in plan_ctx + chat_ctx}.values())
                if all_ctx:
                    ctx_block = "\n".join(
                        f"- {'[PINNED] ' if r.pinned else ''}[{r.role}]: {r.content[:250]}"
                        for r in all_ctx
                    )
                    prompt = f"--- Relevant context ---\n{ctx_block}\n--- End context ---\n\n{task.prompt}"
            except Exception as e:
                logger.warning("Task context injection failed for %s: %s", task.id, e)

        try:
            worktree = await self._workdir_manager.create(task.id, workdir)
            worktree_path = str(worktree)
            task.worktree_path = worktree_path

            try:
                await db.execute(
                    "INSERT OR IGNORE INTO sessions "
                    "(id, type, parent_id, plan_session_id, label, worktree_path, status, created_at) "
                    "VALUES (?, 'task', ?, ?, ?, ?, 'running', ?)",
                    (task.id, plan_session_id, plan_session_id, task.title, worktree_path, _now()),
                )
                await db.commit()
            except Exception as e:
                logger.warning("Failed to register task session %s: %s", task.id, e)

            if self._memory_manager:
                try:
                    self._memory_manager.on_session_connect(task.id)
                except Exception:
                    pass

            slot = await self._pool.acquire(task_id=task.id, task_title=task.title)
            task.slot_id = slot.slot_id
            slot.agent.workdir = worktree

            try:
                await db.execute(
                    "UPDATE build_tasks SET slot_id = ?, worktree_path = ? WHERE id = ?",
                    (slot.slot_id, worktree_path, task.id),
                )
                await db.commit()
            except Exception as e:
                logger.warning("Failed to update task slot info %s: %s", task.id, e)

            await slot.agent.send(prompt)
            accumulated: list[str] = []

            async for chunk in slot.agent.stream_output(idle_timeout=120.0):
                accumulated.append(chunk)
                await websocket.send_json({
                    "type": "task_chunk",
                    "task_id": task.id,
                    "slot_id": slot.slot_id,
                    "content": chunk,
                })

            full_output = "".join(accumulated)
            task.output = full_output
            task.status = "complete"
            task.completed_at = _now()

            # Capture session ID so follow-up replies can --resume this conversation
            self._task_sessions[task.id] = getattr(slot.agent, "_claude_session_id", None)

            if self._memory_manager and full_output:
                try:
                    await self._memory_manager.on_message(
                        role="assistant",
                        content=f"[Task: {task.title}]\n{full_output}",
                        session_id=task.id,
                    )
                    await self._memory_manager.on_message(
                        role="assistant",
                        content=f"[Plan task complete: {task.title}] Output stored in session {task.id}.",
                        session_id=plan_session_id,
                    )
                except Exception as e:
                    logger.warning("Memory embed failed for task %s: %s", task.id, e)

        except Exception as e:
            task.status = "error"
            task.error = str(e)
            task.completed_at = _now()
            logger.error("Task %s failed: %s", task.id, e)
            raise
        finally:
            if slot:
                await self._pool.release(slot)
            if worktree_path:
                await self._workdir_manager.cleanup(task.id, workdir)
            if self._memory_manager:
                try:
                    self._memory_manager.cancel_session(task.id)
                except Exception:
                    pass

            await self._persist_task(db, task)
            await self._emit_task_update(websocket, task)

            try:
                await db.execute(
                    "UPDATE sessions SET status = ?, completed_at = ?, agent_slot = ? WHERE id = ?",
                    (task.status, task.completed_at, task.slot_id, task.id),
                )
                await db.commit()
            except Exception as e:
                logger.warning("Failed to update session for task %s: %s", task.id, e)

    async def _persist_task(self, db, task) -> None:
        try:
            await db.execute(
                """UPDATE build_tasks
                   SET status = ?, slot_id = ?, worktree_path = ?, output = ?,
                       error = ?, completed_at = ?
                   WHERE id = ?""",
                (task.status, task.slot_id, task.worktree_path,
                 (task.output or "")[:50000], task.error, task.completed_at, task.id),
            )
            await db.commit()
        except Exception as e:
            logger.warning("_persist_task failed for %s: %s", task.id, e)

    async def _emit_task_update(self, websocket, task) -> None:
        try:
            await websocket.send_json({"type": "task_update", "task": self._task_dict(task)})
        except Exception:
            pass

    def _task_dict(self, task) -> dict:
        return {
            "id": task.id,
            "session_id": task.session_id,
            "title": task.title,
            "prompt": task.prompt,
            "status": task.status,
            "complexity": task.complexity,
            "dependencies": task.dependencies,
            "slot_id": task.slot_id,
            "worktree_path": task.worktree_path,
            "error": task.error,
            "created_at": task.created_at,
            "completed_at": task.completed_at,
        }
