"""
Tests for handle_parallel_dispatch in ws.py.
Written before implementation (TDD).
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def make_mock_slot(slot_id: str = "claude-0"):
    agent = MagicMock()
    agent.send = AsyncMock()
    agent.workdir = None

    slot = MagicMock()
    slot.slot_id = slot_id
    slot.agent = agent
    return slot


def make_mock_pool(slot: MagicMock):
    pool = MagicMock()
    pool.acquire = AsyncMock(return_value=slot)
    pool.release = AsyncMock()
    return pool


def make_mock_ws():
    ws = MagicMock()
    ws.send_json = AsyncMock()
    return ws


async def _agen(*items):
    """Helper: async generator yielding items."""
    for item in items:
        yield item


# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_acquires_slot_per_task():
    from backend.api.ws import handle_parallel_dispatch

    slot = make_mock_slot("claude-0")
    pool = make_mock_pool(slot)
    ws = make_mock_ws()
    slot.agent.stream_output = MagicMock(return_value=_agen())

    await handle_parallel_dispatch(
        [{"prompt": "hello", "title": "t1"}], ws, pool
    )

    pool.acquire.assert_called_once_with(task_id=None, task_title="t1")


@pytest.mark.asyncio
async def test_releases_slot_after_completion():
    from backend.api.ws import handle_parallel_dispatch

    slot = make_mock_slot()
    pool = make_mock_pool(slot)
    ws = make_mock_ws()
    slot.agent.stream_output = MagicMock(return_value=_agen("hi"))

    await handle_parallel_dispatch([{"prompt": "hi"}], ws, pool)

    pool.release.assert_called_once_with(slot)


@pytest.mark.asyncio
async def test_releases_slot_on_agent_send_error():
    from backend.api.ws import handle_parallel_dispatch

    slot = make_mock_slot()
    pool = make_mock_pool(slot)
    ws = make_mock_ws()
    slot.agent.send = AsyncMock(side_effect=RuntimeError("agent busy"))

    await handle_parallel_dispatch([{"prompt": "hi"}], ws, pool)

    pool.release.assert_called_once_with(slot)


@pytest.mark.asyncio
async def test_sends_chunks_with_slot_id_and_title():
    from backend.api.ws import handle_parallel_dispatch

    slot = make_mock_slot("claude-0")
    pool = make_mock_pool(slot)
    ws = make_mock_ws()
    slot.agent.stream_output = MagicMock(return_value=_agen("hello", " world"))

    await handle_parallel_dispatch(
        [{"prompt": "hi", "title": "My Task"}], ws, pool
    )

    sent = [c.args[0] for c in ws.send_json.call_args_list]
    chunk_calls = [s for s in sent if s.get("type") == "chunk"]
    assert len(chunk_calls) == 2
    assert chunk_calls[0] == {
        "type": "chunk",
        "slot_id": "claude-0",
        "task_title": "My Task",
        "content": "hello",
    }
    assert chunk_calls[1]["content"] == " world"


@pytest.mark.asyncio
async def test_sends_dispatch_done_after_all_tasks():
    from backend.api.ws import handle_parallel_dispatch

    slot = make_mock_slot()
    pool = make_mock_pool(slot)
    ws = make_mock_ws()
    slot.agent.stream_output = MagicMock(return_value=_agen())

    await handle_parallel_dispatch([{"prompt": "a"}, {"prompt": "b"}], ws, pool)

    sent_types = [c.args[0]["type"] for c in ws.send_json.call_args_list]
    assert sent_types[-1] == "dispatch_done"


@pytest.mark.asyncio
async def test_empty_task_list_sends_dispatch_done():
    from backend.api.ws import handle_parallel_dispatch

    pool = MagicMock()
    ws = make_mock_ws()

    await handle_parallel_dispatch([], ws, pool)

    pool.acquire.assert_not_called()
    ws.send_json.assert_called_once_with({"type": "dispatch_done"})


@pytest.mark.asyncio
async def test_multiple_tasks_each_get_own_slot():
    from backend.api.ws import handle_parallel_dispatch

    slot_a = make_mock_slot("claude-0")
    slot_b = make_mock_slot("claude-1")
    slot_a.agent.stream_output = MagicMock(return_value=_agen("a"))
    slot_b.agent.stream_output = MagicMock(return_value=_agen("b"))

    pool = MagicMock()
    pool.acquire = AsyncMock(side_effect=[slot_a, slot_b])
    pool.release = AsyncMock()
    ws = make_mock_ws()

    await handle_parallel_dispatch(
        [{"prompt": "task a"}, {"prompt": "task b"}], ws, pool
    )

    assert pool.acquire.call_count == 2
    assert pool.release.call_count == 2


@pytest.mark.asyncio
async def test_sets_workdir_on_slot_when_provided(tmp_path):
    from backend.api.ws import handle_parallel_dispatch

    slot = make_mock_slot()
    pool = make_mock_pool(slot)
    ws = make_mock_ws()
    slot.agent.stream_output = MagicMock(return_value=_agen())

    await handle_parallel_dispatch(
        [{"prompt": "hi", "workdir": str(tmp_path)}], ws, pool
    )

    from pathlib import Path
    assert slot.agent.workdir == Path(str(tmp_path)).expanduser()


@pytest.mark.asyncio
async def test_ignores_invalid_workdir():
    from backend.api.ws import handle_parallel_dispatch

    slot = make_mock_slot()
    original_workdir = slot.agent.workdir
    pool = make_mock_pool(slot)
    ws = make_mock_ws()
    slot.agent.stream_output = MagicMock(return_value=_agen())

    await handle_parallel_dispatch(
        [{"prompt": "hi", "workdir": "/nonexistent/path/xyz"}], ws, pool
    )

    assert slot.agent.workdir == original_workdir
