import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.memory.models import MemoryChunk
from backend.memory.shadow_agent import ShadowAgent


def _chunk(content="hello"):
    return MemoryChunk(role="user", content=content, session_id="s1", timestamp="2024-01-01T00:00:00")


@pytest.fixture
async def agent():
    store = AsyncMock()
    embedder = AsyncMock()
    embedder.embed.return_value = [0.1] * 768
    broadcaster = AsyncMock()
    sa = ShadowAgent(store=store, embedder=embedder, broadcaster=broadcaster)
    sa.register_session("s1")  # _chunk() uses session_id="s1"
    await sa.start()
    yield sa
    await sa.shutdown()


@pytest.mark.asyncio
async def test_process_returns_immediately_without_waiting_for_embed(agent):
    """process() must be non-blocking — just enqueues."""
    agent._embedder.embed = AsyncMock(side_effect=lambda t: asyncio.sleep(10))
    # Should return instantly, not wait for slow embed
    await asyncio.wait_for(agent.process(_chunk()), timeout=0.1)


@pytest.mark.asyncio
async def test_worker_calls_embed_and_store(agent):
    chunk = _chunk("test content")
    await agent.process(chunk)
    await agent._queue.join()  # wait for worker to process

    agent._embedder.embed.assert_awaited_once_with("test content")
    agent._store.write.assert_awaited_once()


@pytest.mark.asyncio
async def test_worker_emits_memory_stored_event(agent):
    await agent.process(_chunk("broadcast me"))
    await agent._queue.join()

    agent._broadcaster.emit.assert_awaited_once()
    call_args = agent._broadcaster.emit.call_args
    assert call_args[0][0] == "MEMORY_STORED"
    assert "record_id" in call_args[0][1]


@pytest.mark.asyncio
async def test_worker_swallows_embed_errors(agent):
    """Errors must never propagate — shadow agent never affects primary stream."""
    agent._embedder.embed.side_effect = Exception("ollama down")
    await agent.process(_chunk())
    await agent._queue.join()  # must complete without raising
    agent._store.write.assert_not_awaited()


@pytest.mark.asyncio
async def test_worker_swallows_store_errors(agent):
    agent._store.write.side_effect = Exception("lancedb error")
    await agent.process(_chunk())
    await agent._queue.join()  # must complete without raising


@pytest.mark.asyncio
async def test_multiple_messages_processed_in_order(agent):
    processed = []
    original_embed = agent._embedder.embed

    async def track_embed(text):
        processed.append(text)
        return await original_embed(text)

    agent._embedder.embed = track_embed

    await agent.process(_chunk("first"))
    await agent.process(_chunk("second"))
    await agent.process(_chunk("third"))
    await agent._queue.join()

    assert processed == ["first", "second", "third"]
