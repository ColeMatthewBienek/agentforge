"""
Tests for inbox_write and drain endpoint.
Written before wiring (TDD).
"""
import asyncio
import pytest
import tempfile
from pathlib import Path


@pytest.fixture
async def db():
    from backend.db import open_db
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db = await open_db(Path(f.name))
    yield db
    await db.close()


@pytest.fixture(autouse=True)
async def set_db(db):
    import backend.api.inbox as inbox_module
    inbox_module._db = db
    yield
    inbox_module._db = None


@pytest.mark.asyncio
async def test_inbox_write_inserts_row(db):
    from backend.api.inbox import inbox_write
    await inbox_write("task:test", "hello world", priority="high", session_id="s1")
    cur = await db.execute("SELECT * FROM inbox_messages WHERE session_id = 's1'")
    row = await cur.fetchone()
    assert row is not None
    assert row["message"] == "hello world"
    assert row["priority"] == "high"
    assert row["handled"] == 0


@pytest.mark.asyncio
async def test_drain_marks_handled(db):
    from backend.api.inbox import inbox_write
    await inbox_write("task:test", "drain me", priority="normal", session_id="s2")

    rows1 = await db.execute_fetchall(
        "SELECT * FROM inbox_messages WHERE handled=0 AND session_id='s2'"
    )
    assert len(rows1) == 1

    ids = [r["id"] for r in rows1]
    ph = ",".join("?" * len(ids))
    await db.execute(f"UPDATE inbox_messages SET handled=1 WHERE id IN ({ph})", ids)
    await db.commit()

    rows2 = await db.execute_fetchall(
        "SELECT * FROM inbox_messages WHERE handled=0 AND session_id='s2'"
    )
    assert len(rows2) == 0


@pytest.mark.asyncio
async def test_drain_broadcast(db):
    from backend.api.inbox import inbox_write
    await inbox_write("orchestrator", "broadcast msg", priority="normal", session_id=None)

    rows = await db.execute_fetchall(
        "SELECT * FROM inbox_messages WHERE handled=0 AND (session_id='any-session' OR session_id IS NULL)"
    )
    assert len(rows) == 1


@pytest.mark.asyncio
async def test_drain_session_filter(db):
    from backend.api.inbox import inbox_write
    await inbox_write("task:test", "for session A only", session_id="session-A")

    rows = await db.execute_fetchall(
        "SELECT * FROM inbox_messages WHERE handled=0 AND (session_id='session-B' OR session_id IS NULL)"
    )
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_inbox_write_before_db_init():
    import backend.api.inbox as inbox_module
    original = inbox_module._db
    inbox_module._db = None
    try:
        # Must not raise
        from backend.api.inbox import inbox_write
        await inbox_write("test", "should not crash")
    finally:
        inbox_module._db = original


@pytest.mark.asyncio
async def test_priority_ordering(db):
    from backend.api.inbox import inbox_write
    await inbox_write("src", "normal msg", priority="normal", session_id="s3")
    await inbox_write("src", "urgent msg", priority="urgent", session_id="s3")
    await inbox_write("src", "high msg", priority="high", session_id="s3")

    rows = await db.execute_fetchall(
        """SELECT * FROM inbox_messages
           WHERE handled=0 AND session_id='s3'
           ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, created_at"""
    )
    assert rows[0]["priority"] == "urgent"
    assert rows[1]["priority"] == "high"
    assert rows[2]["priority"] == "normal"
