from fastapi import APIRouter, Request

from backend.pool.agent_pool import SlotStatus

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=list[SlotStatus])
async def list_agents(request: Request) -> list[SlotStatus]:
    pool = getattr(request.app.state, "agent_pool", None)
    if pool is None:
        return []
    return pool.status()
