import pytest
from pathlib import Path
from unittest.mock import AsyncMock

from backend.memory.models import MemoryRecord
from backend.memory.lance_store import LanceStore


def _fake_vector(seed: float = 0.1) -> list[float]:
    return [seed] * 768


def _record(id="r1", session="s1", role="user", content="hello", pinned=False, source="shadow") -> MemoryRecord:
    return MemoryRecord(
        id=id,
        session_id=session,
        role=role,
        content=content,
        embedding=_fake_vector(),
        created_at="2024-01-01T00:00:00",
        pinned=pinned,
        source=source,
    )


@pytest.fixture
async def store(tmp_path):
    embedder = AsyncMock()
    embedder.embed.return_value = _fake_vector()
    s = LanceStore(db_path=tmp_path / "lancedb", embedder=embedder)
    await s.initialize()
    return s


@pytest.mark.asyncio
async def test_write_then_get_recent_returns_record(store):
    await store.write(_record(id="r1", session="s1"))
    results = await store.get_recent(session_id="s1", limit=10)
    assert len(results) == 1
    assert results[0].id == "r1"
    assert results[0].content == "hello"


@pytest.mark.asyncio
async def test_get_recent_filters_by_session(store):
    await store.write(_record(id="r1", session="s1"))
    await store.write(_record(id="r2", session="s2"))
    results = await store.get_recent(session_id="s1", limit=10)
    assert len(results) == 1
    assert results[0].id == "r1"


@pytest.mark.asyncio
async def test_search_returns_results(store):
    await store.write(_record(id="r1", content="python database"))
    results = await store.search("python database", limit=5)
    assert len(results) >= 1


@pytest.mark.asyncio
async def test_search_returns_empty_when_store_empty(store):
    results = await store.search("anything", limit=5)
    assert results == []


@pytest.mark.asyncio
async def test_pin_marks_record_pinned(store):
    await store.write(_record(id="r1", pinned=False))
    await store.pin("r1")
    results = await store.get_recent(session_id="s1", limit=10)
    assert results[0].pinned is True


@pytest.mark.asyncio
async def test_delete_removes_record(store):
    await store.write(_record(id="r1"))
    await store.delete("r1")
    results = await store.get_recent(session_id="s1", limit=10)
    assert len(results) == 0


@pytest.mark.asyncio
async def test_get_all_returns_paginated_results(store):
    for i in range(5):
        await store.write(_record(id=f"r{i}", session=f"s{i}"))
    records, total = await store.get_all(page=1, page_size=3)
    assert len(records) == 3
    assert total == 5


@pytest.mark.asyncio
async def test_pinned_records_surface_first_in_search(store):
    await store.write(_record(id="r1", content="regular record", pinned=False))
    await store.write(_record(id="r2", content="pinned record", pinned=True))
    results = await store.search("record", limit=5)
    assert results[0].pinned is True
