from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


async def _fetchone(db, sql: str, params: tuple = ()):
    cur = await db.execute(sql, params)
    return await cur.fetchone()


@router.get("/sessions")
async def list_sessions(request: Request, parent_id: str | None = None):
    db = request.app.state.db
    if parent_id:
        rows = await db.execute_fetchall(
            "SELECT * FROM build_sessions WHERE chat_session_id = ? ORDER BY created_at DESC",
            (parent_id,),
        )
    else:
        rows = await db.execute_fetchall(
            "SELECT * FROM build_sessions ORDER BY created_at DESC LIMIT 50"
        )
    return {"sessions": [dict(r) for r in rows]}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    db = request.app.state.db
    session = await _fetchone(db, "SELECT * FROM build_sessions WHERE id = ?", (session_id,))
    if not session:
        raise HTTPException(404, "Session not found")
    tasks = await db.execute_fetchall(
        "SELECT * FROM build_tasks WHERE session_id = ? ORDER BY created_at", (session_id,)
    )
    s = dict(session)
    s["tasks"] = [dict(t) for t in tasks]
    return s


@router.get("")
async def list_tasks(request: Request, session_id: str | None = None):
    db = request.app.state.db
    if session_id:
        rows = await db.execute_fetchall(
            "SELECT * FROM build_tasks WHERE session_id = ? ORDER BY created_at", (session_id,)
        )
    else:
        rows = await db.execute_fetchall(
            "SELECT * FROM build_tasks ORDER BY created_at DESC LIMIT 100"
        )
    return {"tasks": [dict(r) for r in rows]}


@router.get("/{task_id}")
async def get_task(task_id: str, request: Request):
    db = request.app.state.db
    row = await _fetchone(db, "SELECT * FROM build_tasks WHERE id = ?", (task_id,))
    if not row:
        raise HTTPException(404, "Task not found")
    return dict(row)


@router.delete("/{task_id}")
async def cancel_task(task_id: str, request: Request):
    db = request.app.state.db
    row = await _fetchone(db, "SELECT * FROM build_tasks WHERE id = ?", (task_id,))
    if not row:
        raise HTTPException(404, "Task not found")
    if row["status"] not in ("pending", "running"):
        raise HTTPException(400, f"Task is already {row['status']}")

    pool = request.app.state.agent_pool
    if row["slot_id"]:
        slot = next((s for s in pool._slots.values() if s.slot_id == row["slot_id"]), None)
        if slot:
            await slot.agent.interrupt()

    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE build_tasks SET status = 'cancelled', completed_at = ? WHERE id = ?",
        (now, task_id),
    )
    await db.commit()
    return {"status": "cancelled"}
