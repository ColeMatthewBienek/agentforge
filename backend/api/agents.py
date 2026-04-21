from fastapi import APIRouter

from backend.api.ws import _agent

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("")
async def list_agents():
    if _agent is None:
        return {"agents": []}
    return {
        "agents": [
            {
                "slot_id": _agent.slot_id,
                "name": _agent.name,
                "status": _agent.status,
            }
        ]
    }
