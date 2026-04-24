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

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'planning'
        CHECK(status IN ('planning','decomposing','em_review','executing',
                         'paused','complete','error')),
    plan_document TEXT,
    plan_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS project_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    status TEXT DEFAULT 'running'
        CHECK(status IN ('running','paused','complete','error')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    total_tasks INTEGER DEFAULT 0,
    succeeded INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS em_review_log (
    id TEXT PRIMARY KEY,
    project_run_id TEXT NOT NULL,
    action TEXT NOT NULL
        CHECK(action IN ('approved','split','kicked_back','modified')),
    task_id TEXT,
    new_task_ids TEXT,
    reason TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_injections (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    project_run_id TEXT NOT NULL,
    content TEXT NOT NULL,
    injected_at TEXT NOT NULL,
    acknowledged_at TEXT
);
"""

_PROJECT_MIGRATIONS = [
    "ALTER TABLE projects ADD COLUMN archived_at TEXT",
]

_BUILD_TASKS_MIGRATIONS = [
    "ALTER TABLE build_tasks ADD COLUMN decomposer_error TEXT",
    "ALTER TABLE build_sessions ADD COLUMN decomposer_error TEXT",
    "ALTER TABLE build_tasks ADD COLUMN executor_tier TEXT",
    "ALTER TABLE build_tasks ADD COLUMN project_id TEXT",
    "ALTER TABLE build_tasks ADD COLUMN project_run_id TEXT",
    "ALTER TABLE build_tasks ADD COLUMN kanban_column TEXT DEFAULT 'backlog'",
    "ALTER TABLE build_tasks ADD COLUMN acceptance_criteria TEXT",
    "ALTER TABLE build_tasks ADD COLUMN em_notes TEXT",
]


async def open_db(path: Path) -> aiosqlite.Connection:
    db = await aiosqlite.connect(str(path))
    db.row_factory = aiosqlite.Row
    await db.executescript(SCHEMA_SQL)
    for migration in _PROJECT_MIGRATIONS + _BUILD_TASKS_MIGRATIONS:
        try:
            await db.execute(migration)
        except Exception:
            pass  # column already exists
    await db.commit()
    return db
