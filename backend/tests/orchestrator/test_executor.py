"""
Tests for TaskExecutor.
Written before implementation (TDD).
"""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest


def make_mock_pool(chunks: list[str] | None = None, raise_on_stream: Exception | None = None):
    """Build a pool mock whose slot streams the given chunks."""
    agent = MagicMock()
    agent.workdir = Path("/tmp")
    agent.send = AsyncMock()

    async def _stream(idle_timeout=None):
        if raise_on_stream:
            raise raise_on_stream
        for c in (chunks or []):
            yield c

    agent.stream_output = _stream

    slot = MagicMock()
    slot.slot_id = "slot-0"
    slot.agent = agent

    pool = MagicMock()
    pool.acquire = AsyncMock(return_value=slot)
    pool.release = AsyncMock()
    return pool, slot, agent


def make_mock_workdir_mgr(worktree_path: Path | None = None, is_git: bool = True):
    mgr = MagicMock()
    resolved = worktree_path or Path("/tmp/worktrees/task-1")

    async def _resolve(task_id, base_dir, parallel):
        return resolved if parallel else Path(base_dir)

    async def _cleanup(task_id, base_dir):
        pass

    mgr.resolve = _resolve
    mgr.cleanup = AsyncMock(side_effect=_cleanup)
    return mgr


@pytest.mark.asyncio
async def test_run_streams_chunks_to_callback():
    """on_chunk is called once per chunk in order."""
    pool, _, _ = make_mock_pool(chunks=["hello ", "world"])
    mgr = make_mock_workdir_mgr()

    from backend.orchestrator.executor import TaskExecutor

    executor = TaskExecutor(pool=pool, workdir_manager=mgr)
    received: list[str] = []
    await executor.run(
        task_id="task-1",
        prompt="do something",
        base_dir="/tmp/repo",
        on_chunk=lambda c: received.append(c),
        parallel=True,
    )
    assert received == ["hello ", "world"]


@pytest.mark.asyncio
async def test_run_sets_agent_workdir_to_resolved_path():
    """The pool agent's workdir is set to the resolved worktree path."""
    worktree = Path("/tmp/worktrees/task-2")
    pool, slot, agent = make_mock_pool(chunks=[])
    mgr = make_mock_workdir_mgr(worktree_path=worktree)

    from backend.orchestrator.executor import TaskExecutor

    executor = TaskExecutor(pool=pool, workdir_manager=mgr)
    await executor.run(
        task_id="task-2",
        prompt="build it",
        base_dir="/tmp/repo",
        on_chunk=lambda _: None,
        parallel=True,
    )
    assert agent.workdir == worktree


@pytest.mark.asyncio
async def test_cleanup_called_on_task_error():
    """cleanup() is always called even when the agent stream raises."""
    pool, _, _ = make_mock_pool(raise_on_stream=RuntimeError("agent exploded"))
    mgr = make_mock_workdir_mgr()

    from backend.orchestrator.executor import TaskExecutor

    executor = TaskExecutor(pool=pool, workdir_manager=mgr)
    with pytest.raises(RuntimeError, match="agent exploded"):
        await executor.run(
            task_id="task-3",
            prompt="crash",
            base_dir="/tmp/repo",
            on_chunk=lambda _: None,
            parallel=True,
        )

    mgr.cleanup.assert_awaited_once_with("task-3", "/tmp/repo")
    pool.release.assert_awaited_once()


@pytest.mark.asyncio
async def test_cleanup_not_called_when_not_parallel():
    """cleanup() is skipped when parallel=False (no worktree was created)."""
    pool, _, _ = make_mock_pool(chunks=[])
    mgr = make_mock_workdir_mgr()

    from backend.orchestrator.executor import TaskExecutor

    executor = TaskExecutor(pool=pool, workdir_manager=mgr)
    await executor.run(
        task_id="task-4",
        prompt="serial task",
        base_dir="/tmp/repo",
        on_chunk=lambda _: None,
        parallel=False,
    )

    mgr.cleanup.assert_not_awaited()


@pytest.mark.asyncio
async def test_pool_slot_always_released():
    """pool.release is called even when stream raises."""
    pool, slot, _ = make_mock_pool(raise_on_stream=ValueError("oops"))
    mgr = make_mock_workdir_mgr()

    from backend.orchestrator.executor import TaskExecutor

    executor = TaskExecutor(pool=pool, workdir_manager=mgr)
    with pytest.raises(ValueError):
        await executor.run(
            task_id="task-5",
            prompt="x",
            base_dir="/tmp",
            on_chunk=lambda _: None,
            parallel=True,
        )
    pool.release.assert_awaited_once_with(slot)
