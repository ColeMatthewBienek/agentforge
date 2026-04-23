import logging
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/memory", tags=["memory"])


def _get_manager(request: Request):
    mgr = getattr(request.app.state, "memory_manager", None)
    if mgr is None:
        raise HTTPException(503, "Memory system not initialized")
    return mgr


def _get_store(request: Request):
    return _get_manager(request)._store


@router.get("")
async def list_memories(request: Request, page: int = 1, page_size: int = 20):
    store = _get_store(request)
    records, total = await store.get_all(page=page, page_size=page_size)
    return {
        "records": [_serialize(r) for r in records],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/search")
async def search_memories(request: Request, q: str, limit: int = 20):
    store = _get_store(request)
    records = await store.search(q, limit=limit)
    return {"records": [_serialize(r) for r in records]}


@router.get("/search_scoped")
async def search_memories_scoped(
    request: Request,
    q: str,
    session_ids: str = "",
    limit: int = 20,
):
    """
    Semantic search filtered to specific session IDs.
    session_ids: comma-separated list. Empty string = search all.
    """
    store = _get_store(request)
    sid_list: list[str] | None = None
    if session_ids.strip():
        sid_list = [s.strip() for s in session_ids.split(",") if s.strip()]
    records = await store.search_scoped(q, session_ids=sid_list, limit=limit)
    return {"records": [_serialize(r) for r in records]}


@router.get("/session/{session_id}")
async def session_memories(request: Request, session_id: str, limit: int = 50):
    store = _get_store(request)
    records = await store.get_recent(session_id=session_id, limit=limit)
    return {"records": [_serialize(r) for r in records]}


@router.post("/pin/{record_id}")
async def pin_memory(record_id: str, request: Request):
    await _get_store(request).pin(record_id)
    return {"status": "pinned"}


@router.post("/unpin/{record_id}")
async def unpin_memory(record_id: str, request: Request):
    await _get_store(request).unpin(record_id)
    return {"status": "unpinned"}


@router.delete("/{record_id}")
async def delete_memory(record_id: str, request: Request):
    await _get_store(request).delete(record_id)
    return {"status": "deleted"}


@router.post("/curate")
async def trigger_curation(request: Request):
    """Manual trigger for the memory curator (scheduler stub)."""
    curator = getattr(request.app.state, "curator", None)
    if curator is None:
        raise HTTPException(503, "Curator not initialized")
    try:
        report = await curator.run()
        return report
    except NotImplementedError:
        raise HTTPException(501, "Curator not yet implemented")


def _serialize(record) -> dict:
    return {
        "id": record.id,
        "session_id": record.session_id,
        "role": record.role,
        "content": record.content,
        "created_at": record.created_at,
        "pinned": record.pinned,
        "source": record.source,
    }
