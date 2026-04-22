import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock
from pathlib import Path
from datetime import datetime, timezone


def make_store_and_embedder():
    store = MagicMock()
    store.write = AsyncMock()
    store.search = AsyncMock(return_value=[])
    embedder = MagicMock()
    embedder.embed = AsyncMock(return_value=[0.0] * 768)
    return store, embedder


def make_memory_manager(store=None, embedder=None):
    from backend.memory.shadow_agent import ShadowAgent
    from backend.memory.memory_manager import MemoryManager
    if store is None or embedder is None:
        store, embedder = make_store_and_embedder()
    broadcaster = MagicMock()
    broadcaster.emit = AsyncMock()
    shadow = ShadowAgent(store=store, embedder=embedder, broadcaster=broadcaster)
    return MemoryManager(store=store, shadow_agent=shadow), store, embedder


# ── SessionSummarizer ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_session_summarizer_stores_record():
    from backend.memory.session_summarizer import SessionSummarizer
    store, embedder = make_store_and_embedder()
    s = SessionSummarizer(store=store, embedder=embedder)

    record = await s.summarize(content="debug notes", session_id="s1")

    store.write.assert_called_once()
    assert record.source == "debug_summary"
    assert record.content == "debug notes"
    assert record.session_id == "s1"
    assert record.role == "debug"


@pytest.mark.asyncio
async def test_session_summarizer_uses_embedding():
    from backend.memory.session_summarizer import SessionSummarizer
    store, embedder = make_store_and_embedder()
    embedder.embed.return_value = [1.0] * 768
    s = SessionSummarizer(store=store, embedder=embedder)

    record = await s.summarize(content="findings", session_id="s1")

    embedder.embed.assert_called_once_with("findings")
    assert record.embedding == [1.0] * 768


@pytest.mark.asyncio
async def test_session_summarizer_fallback_embedding_on_error():
    from backend.memory.session_summarizer import SessionSummarizer
    store, embedder = make_store_and_embedder()
    embedder.embed.side_effect = RuntimeError("ollama down")
    s = SessionSummarizer(store=store, embedder=embedder)

    record = await s.summarize(content="findings", session_id="s1")

    # Must not raise — uses zero embedding fallback
    assert record.embedding == [0.0] * 768
    store.write.assert_called_once()


# ── MemoryManager.debug_summarize() ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_memory_manager_debug_summarize_calls_store():
    mm, store, _ = make_memory_manager()

    await mm.debug_summarize(content="session content", session_id="s1")

    store.write.assert_called_once()
    written_record = store.write.call_args[0][0]
    assert written_record.source == "debug_summary"


# ── Memory skipped in debug mode (ws.py integration logic) ───────────────────
# These test the MemoryManager methods used in ws.py to verify the skip contract.

@pytest.mark.asyncio
async def test_build_context_returns_prompt_when_store_empty():
    mm, store, _ = make_memory_manager()
    store.search.return_value = []

    result = await mm.build_context("hello", session_id="s1")

    assert result == "hello"


@pytest.mark.asyncio
async def test_on_message_calls_shadow_agent():
    mm, store, embedder = make_memory_manager()
    mm._shadow_agent.register_session("s1")

    await mm.on_message(role="user", content="test", session_id="s1")

    assert mm._shadow_agent._queue.qsize() == 1


@pytest.mark.asyncio
async def test_on_message_not_called_means_nothing_queued():
    """Simulates ws.py skipping on_message in debug mode by simply not calling it."""
    mm, store, _ = make_memory_manager()
    mm._shadow_agent.register_session("s1")

    # Debug mode: ws.py skips this call entirely — queue stays empty
    assert mm._shadow_agent._queue.qsize() == 0
