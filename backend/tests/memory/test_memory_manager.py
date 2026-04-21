import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.memory.models import MemoryRecord
from backend.memory.memory_manager import MemoryManager


def _record(id="r1", role="user", content="postgres not mysql", pinned=False):
    return MemoryRecord(
        id=id, session_id="s1", role=role, content=content,
        embedding=[0.1] * 768, created_at="2024-01-01T00:00:00",
        pinned=pinned, source="shadow",
    )


@pytest.fixture
def manager():
    store = AsyncMock()
    shadow = AsyncMock()
    return MemoryManager(store=store, shadow_agent=shadow)


@pytest.mark.asyncio
async def test_build_context_prepends_block_when_results_found(manager):
    manager._store.search.return_value = [_record(content="we use postgres")]
    result = await manager.build_context("fix the db", session_id="s1")
    assert "--- Relevant memory context ---" in result
    assert "we use postgres" in result
    assert result.endswith("fix the db")


@pytest.mark.asyncio
async def test_build_context_returns_prompt_unchanged_when_no_results(manager):
    manager._store.search.return_value = []
    result = await manager.build_context("fix the db", session_id="s1")
    assert result == "fix the db"


@pytest.mark.asyncio
async def test_build_context_marks_pinned_records(manager):
    manager._store.search.return_value = [_record(content="important fact", pinned=True)]
    result = await manager.build_context("do something", session_id="s1")
    assert "[PINNED]" in result


@pytest.mark.asyncio
async def test_on_message_routes_to_shadow_agent(manager):
    await manager.on_message(role="user", content="hello", session_id="s1")
    manager._shadow_agent.process.assert_awaited_once()
    chunk = manager._shadow_agent.process.call_args[0][0]
    assert chunk.role == "user"
    assert chunk.content == "hello"
    assert chunk.session_id == "s1"


@pytest.mark.asyncio
async def test_remember_writes_pinned_manual_record(manager):
    manager._store.write = AsyncMock()
    await manager.remember(content="use postgres", session_id="s1")
    manager._store.write.assert_awaited_once()
    record = manager._store.write.call_args[0][0]
    assert record.pinned is True
    assert record.source == "manual"
    assert record.content == "use postgres"
