import aiosqlite
from pathlib import Path

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('chat', 'plan', 'task')),
    parent_id TEXT,
    plan_session_id TEXT,
    label TEXT NOT NULL,
    agent_slot TEXT,
    worktree_path TEXT,
    status TEXT DEFAULT 'running' CHECK(status IN ('running','complete','error','cancelled')),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    message_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS build_sessions (
    id TEXT PRIMARY KEY,
    chat_session_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    workdir TEXT NOT NULL,
    task_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'running' CHECK(status IN ('running','complete','error','cancelled')),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    decomposer_error TEXT
);

CREATE TABLE IF NOT EXISTS build_tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES build_sessions(id),
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    dependencies TEXT DEFAULT '[]',
    complexity TEXT DEFAULT 'medium' CHECK(complexity IN ('low','medium','high')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','complete','error','cancelled')),
    slot_id TEXT,
    worktree_path TEXT,
    output TEXT DEFAULT '',
    error TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (session_id) REFERENCES build_sessions(id)
);
"""


async def open_db(path: Path) -> aiosqlite.Connection:
    db = await aiosqlite.connect(str(path))
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA_SQL)
    # Migration: add decomposer_error if the table predates this column
    try:
        await db.execute("ALTER TABLE build_sessions ADD COLUMN decomposer_error TEXT")
    except Exception:
        pass  # column already exists
    await db.commit()
    return db
