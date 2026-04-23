"""
Tests for TaskGraphExecutor.
Written before implementation (TDD).
"""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

import pytest

from backend.orchestrator.decomposer import TaskSpec


def _spec(id: str, deps: list[str] = None, complexity: str = "low") -> TaskSpec:
    return TaskSpec(
        id=id,
        title=f"Task {id}",
        prompt=f"Do {id}",
        dependencies=deps or [],
        complexity=complexity,
        session_id="plan-1",
    )


def _make_pool(chunks: list[str] = None, raise_on_stream: Exception | None = None):
    agent = MagicMock()
    agent.workdir = Path("/tmp")
    agent.send = AsyncMock()
    agent.interrupt = AsyncMock()

    async def _stream(idle_timeout=None):
        if raise_on_stream:
            raise raise_on_stream
        for c in (chunks or ["output chunk"]):
            yield c

    agent.stream_output = _stream

    slot = MagicMock()
    slot.slot_id = "claude-0"
    slot.agent = agent

    pool = MagicMock()
    pool.acquire = AsyncMock(return_value=slot)
    pool.release = AsyncMock()
    return pool, slot, agent


def _make_workdir():
    mgr = MagicMock()
    mgr.create = AsyncMock(return_value=Path("/tmp/worktree"))
    mgr.cleanup = AsyncMock()
    return mgr


def _make_db():
    db = MagicMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    return db


def _make_ws():
    ws = MagicMock()
    ws.send_json = AsyncMock()
    return ws


@pytest.mark.asyncio
async def test_independent_tasks_run_in_parallel():
    """Tasks with no dependencies all dispatch before any completes."""
    started = []

    pool, slot, agent = _make_pool()
    original_acquire = pool.acquire

    async def slow_acquire(**kwargs):
        started.append(kwargs.get("task_id"))
        return slot

    pool.acquire = AsyncMock(side_effect=slow_acquire)

    mgr = _make_workdir()
    db = _make_db()
    ws = _make_ws()

    tasks = [_spec("t1"), _spec("t2"), _spec("t3")]

    from backend.orchestrator.executor import TaskGraphExecutor
    executor = TaskGraphExecutor(pool=pool, workdir_manager=mgr)
    await executor.execute(tasks, "plan-1", "chat-1", "/tmp/repo", ws, db)

    assert set(started) == {"t1", "t2", "t3"}


@pytest.mark.asyncio
async def test_dependent_task_waits_for_dependency():
    """task-2 must not start before task-1 completes."""
    order = []

    pool, slot, agent = _make_pool()

    async def tracked_send(prompt):
        pass

    agent.send = AsyncMock(side_effect=tracked_send)

    acquire_calls = []
    original_acquire = pool.acquire.side_effect

    async def tracking_acquire(**kwargs):
        acquire_calls.append(kwargs.get("task_id"))
        return slot

    pool.acquire = AsyncMock(side_effect=tracking_acquire)

    mgr = _make_workdir()
    db = _make_db()
    ws = _make_ws()

    t1 = _spec("t1")
    t2 = _spec("t2", deps=["t1"])

    from backend.orchestrator.executor import TaskGraphExecutor
    executor = TaskGraphExecutor(pool=pool, workdir_manager=mgr)
    await executor.execute([t1, t2], "plan-1", "chat-1", "/tmp/repo", ws, db)

    # t1 must appear before t2 in acquire order
    assert acquire_calls.index("t1") < acquire_calls.index("t2")


@pytest.mark.asyncio
async def test_task_cleanup_on_error():
    """On stream error: slot is released and worktree is cleaned up."""
    pool, slot, agent = _make_pool(raise_on_stream=RuntimeError("agent crashed"))
    mgr = _make_workdir()
    db = _make_db()
    ws = _make_ws()

    tasks = [_spec("t1")]

    from backend.orchestrator.executor import TaskGraphExecutor
    executor = TaskGraphExecutor(pool=pool, workdir_manager=mgr)
    await executor.execute(tasks, "plan-1", "chat-1", "/tmp", ws, db)

    pool.release.assert_awaited()
    mgr.cleanup.assert_awaited()
    assert tasks[0].status == "error"


@pytest.mark.asyncio
async def test_deadlock_detection_aborts_with_error_status():
    """If task-2 depends on task-99 which doesn't exist, deadlock → error status."""
    pool, slot, _ = _make_pool()
    mgr = _make_workdir()
    db = _make_db()
    ws = _make_ws()

    t1 = _spec("t1")
    t2 = _spec("t2", deps=["t99"])  # t99 doesn't exist — can never complete

    t1.status = "complete"  # pre-complete t1 to isolate the deadlock on t2

    from backend.orchestrator.executor import TaskGraphExecutor
    executor = TaskGraphExecutor(pool=pool, workdir_manager=mgr)
    await executor.execute([t1, t2], "plan-1", "chat-1", "/tmp", ws, db)

    assert t2.status == "error"
    assert "Deadlock" in (t2.error or "")


@pytest.mark.asyncio
async def test_task_output_embedded_into_memory():
    """After a task completes, on_message is called for the task output."""
    pool, slot, _ = _make_pool(chunks=["result text"])
    mgr = _make_workdir()
    db = _make_db()
    ws = _make_ws()
    memory = MagicMock()
    memory.on_message = AsyncMock()
    memory.on_session_connect = MagicMock()
    memory.cancel_session = MagicMock()
    memory._store = MagicMock()
    memory._store.search_scoped = AsyncMock(return_value=[])

    tasks = [_spec("t1")]

    from backend.orchestrator.executor import TaskGraphExecutor
    executor = TaskGraphExecutor(pool=pool, workdir_manager=mgr, memory_manager=memory)
    await executor.execute(tasks, "plan-1", "chat-1", "/tmp", ws, db)

    assert memory.on_message.await_count >= 1
    calls = [c.kwargs["content"] for c in memory.on_message.call_args_list]
    assert any("result text" in c for c in calls)
