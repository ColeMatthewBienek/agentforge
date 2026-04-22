import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from backend.memory.shadow_agent import ShadowAgent
from backend.memory.models import MemoryChunk


def make_chunk(session_id: str = "s1", content: str = "hello") -> MemoryChunk:
    return MemoryChunk(role="user", content=content, session_id=session_id, timestamp="2026-01-01T00:00:00Z")


def make_agent() -> ShadowAgent:
    store = MagicMock()
    store.write = AsyncMock()
    embedder = MagicMock()
    embedder.embed = AsyncMock(return_value=[0.0] * 768)
    broadcaster = MagicMock()
    broadcaster.emit = AsyncMock()
    return ShadowAgent(store=store, embedder=embedder, broadcaster=broadcaster)


# ── Fix 1: queue cap ──────────────────────────────────────────────────────────

def test_queue_maxsize_is_100():
    agent = make_agent()
    assert agent._queue.maxsize == 100


@pytest.mark.asyncio
async def test_process_drops_when_queue_full():
    agent = make_agent()
    # Fill the queue to capacity without a running worker
    for i in range(100):
        await agent.process(make_chunk(content=f"msg {i}"))
    assert agent._queue.qsize() == 100

    # 101st item must be dropped, not block or raise
    await agent.process(make_chunk(content="overflow"))
    assert agent._queue.qsize() == 100  # still 100


@pytest.mark.asyncio
async def test_process_logs_warning_on_full(caplog):
    import logging
    agent = make_agent()
    for _ in range(100):
        await agent.process(make_chunk())

    with caplog.at_level(logging.WARNING, logger="backend.memory.shadow_agent"):
        await agent.process(make_chunk(session_id="overflow-session"))

    assert any("overflow-session" in r.message for r in caplog.records)


# ── Fix 2: cancel_session ─────────────────────────────────────────────────────

def test_register_and_cancel_session():
    agent = make_agent()
    agent.register_session("s1")
    assert "s1" in agent._active_sessions
    agent.cancel_session("s1")
    assert "s1" not in agent._active_sessions


@pytest.mark.asyncio
async def test_cancel_session_drains_matching_items():
    agent = make_agent()
    agent.register_session("s1")
    agent.register_session("s2")

    await agent.process(make_chunk(session_id="s1", content="keep-out"))
    await agent.process(make_chunk(session_id="s2", content="keep-in"))
    await agent.process(make_chunk(session_id="s1", content="keep-out-2"))

    assert agent._queue.qsize() == 3

    agent.cancel_session("s1")

    assert agent._queue.qsize() == 1
    item = agent._queue.get_nowait()
    assert item.session_id == "s2"


@pytest.mark.asyncio
async def test_cancel_session_task_done_stays_balanced():
    """join() must not hang after cancel_session drains items."""
    agent = make_agent()
    agent.register_session("s1")

    await agent.process(make_chunk(session_id="s1"))
    await agent.process(make_chunk(session_id="s1"))

    agent.cancel_session("s1")

    # Drain the now-empty queue — join() should return immediately
    await asyncio.wait_for(agent._queue.join(), timeout=1.0)


@pytest.mark.asyncio
async def test_worker_skips_stale_session():
    agent = make_agent()
    agent.register_session("s1")

    await agent.process(make_chunk(session_id="s1"))

    # Cancel before worker runs
    agent.cancel_session("s1")

    await agent.start()
    # Give the worker one loop iteration to consume the item
    await asyncio.sleep(0.05)

    # embed should never have been called for a stale session
    agent._embedder.embed.assert_not_called()

    agent._worker_task.cancel()
    try:
        await agent._worker_task
    except asyncio.CancelledError:
        pass


@pytest.mark.asyncio
async def test_worker_processes_active_session():
    agent = make_agent()
    agent.register_session("s1")

    await agent.process(make_chunk(session_id="s1", content="process me"))

    await agent.start()
    await asyncio.sleep(0.1)

    agent._embedder.embed.assert_called_once()

    agent._worker_task.cancel()
    try:
        await agent._worker_task
    except asyncio.CancelledError:
        pass
