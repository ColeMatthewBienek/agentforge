import json
import logging
from typing import Optional

from fastapi import APIRouter, Request

logger = logging.getLogger(__name__)

# Set by main.py after db is initialized — same pattern as ws._db
_db = None

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


async def inbox_write(
    from_source: str,
    message: str,
    priority: str = "normal",
    session_id: Optional[str] = None,
    data: Optional[dict] = None,
) -> None:
    """
    Write a message to the inbox. Safe to call from any background coroutine.
    Never raises — logs and swallows on failure.

    Args:
        from_source: Convention: "task:<id>", "orchestrator", "em_review",
                     "decomposer", "health"
        message:     Human-readable message shown in the chat UI
        priority:    "urgent" (persistent red toast) | "high" (yellow, 8s) |
                     "normal" (quiet system line)
        session_id:  Target session. None = broadcast to active session.
        data:        Optional JSON-serializable dict for future use
    """
    if _db is None:
        logger.warning("inbox_write called before db initialized — dropped: %s", message)
        return
    try:
        await _db.execute(
            """INSERT INTO inbox_messages (from_source, priority, message, data, session_id)
               VALUES (?, ?, ?, ?, ?)""",
            (
                from_source,
                priority,
                message,
                json.dumps(data) if data else None,
                session_id,
            ),
        )
        await _db.commit()
    except Exception as exc:
        logger.error("inbox_write failed: %s — message: %s", exc, message)


@router.get("/drain")
async def drain_inbox(request: Request, session_id: str | None = None):
    """
    Atomically return all unhandled inbox messages for the given session
    (plus broadcasts) and mark them handled. Called by frontend every 5s.
    """
    db = request.app.state.db

    rows = await db.execute_fetchall(
        """SELECT * FROM inbox_messages
           WHERE handled = 0
             AND (session_id = ? OR session_id IS NULL)
           ORDER BY
             CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
             created_at""",
        (session_id,),
    )

    if rows:
        ids = [r["id"] for r in rows]
        placeholders = ",".join("?" * len(ids))
        await db.execute(
            f"UPDATE inbox_messages SET handled=1 WHERE id IN ({placeholders})",
            ids,
        )
        await db.commit()

    return {"messages": [dict(r) for r in rows]}


@router.post("")
async def write_inbox(request: Request):
    """
    HTTP endpoint for writing inbox messages.
    Normal backend usage should call inbox_write() directly.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    await inbox_write(
        from_source=body.get("from_source", "external"),
        message=body.get("message", ""),
        priority=body.get("priority", "normal"),
        session_id=body.get("session_id"),
        data=body.get("data"),
    )
    return {"ok": True}
