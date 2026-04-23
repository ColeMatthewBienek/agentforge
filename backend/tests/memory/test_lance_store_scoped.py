"""
Tests for LanceStore.search_scoped().
Written before implementation (TDD).
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

from backend.memory.models import MemoryRecord


def _make_row(session_id: str, content: str, pinned: bool = False, distance: float = 0.1) -> dict:
    return {
        "id": f"r-{content[:8]}",
        "session_id": session_id,
        "role": "user",
        "content": content,
        "embedding": [0.1] * 768,
        "created_at": "2024-01-01T00:00:00",
        "pinned": pinned,
        "source": "chat",
        "_distance": distance,
    }


@pytest.fixture
def store(tmp_path):
    from backend.memory.lance_store import LanceStore
    from backend.memory.embedder import Embedder

    embedder = MagicMock(spec=Embedder)
    embedder.embed = AsyncMock(return_value=[0.1] * 768)
    s = LanceStore(db_path=tmp_path / "lancedb", embedder=embedder)

    # Mock the internal table
    table = MagicMock()
    table.count_rows.return_value = 3
    rows = [
        _make_row("session-A", "alpha content"),
        _make_row("session-B", "beta content"),
        _make_row("session-A", "another alpha"),
    ]
    table.search.return_value.limit.return_value.to_list.return_value = rows
    s._table = table
    return s


@pytest.mark.asyncio
async def test_search_scoped_filters_by_session_id(store):
    results = await store.search_scoped("query", session_ids=["session-A"], limit=10)
    assert all(r.session_id == "session-A" for r in results)
    assert len(results) == 2


@pytest.mark.asyncio
async def test_search_scoped_none_returns_all(store):
    results = await store.search_scoped("query", session_ids=None, limit=10)
    assert len(results) == 3


@pytest.mark.asyncio
async def test_search_scoped_empty_list_returns_nothing(store):
    results = await store.search_scoped("query", session_ids=[], limit=10)
    assert results == []


@pytest.mark.asyncio
async def test_search_scoped_pinned_surfaces_first(store):
    from backend.memory.lance_store import LanceStore

    table = MagicMock()
    table.count_rows.return_value = 2
    table.search.return_value.limit.return_value.to_list.return_value = [
        _make_row("s1", "unpinned", pinned=False, distance=0.05),
        _make_row("s1", "pinned", pinned=True, distance=0.9),
    ]
    store._table = table

    results = await store.search_scoped("query", session_ids=["s1"], limit=10)
    assert results[0].pinned is True


@pytest.mark.asyncio
async def test_search_scoped_returns_empty_on_error(store):
    store._table.search.side_effect = RuntimeError("lancedb exploded")
    results = await store.search_scoped("query", session_ids=None, limit=10)
    assert results == []
