import shutil

from fastapi import APIRouter, Request

from backend.pool.agent_pool import SlotStatus
from backend.agents.registry import VALID_PROVIDERS

router = APIRouter(prefix="/api/agents", tags=["agents"])

_PROVIDER_BINARIES = {
    "claude": "claude",
    "codex":  "codex",
    "gemini": "gemini",
    "ollama": "ollama",
}


@router.get("", response_model=list[SlotStatus])
async def list_agents(request: Request) -> list[SlotStatus]:
    pool = getattr(request.app.state, "agent_pool", None)
    if pool is None:
        return []
    return pool.status()


@router.get("/providers")
async def list_providers():
    availability = {
        p: shutil.which(binary) is not None
        for p, binary in _PROVIDER_BINARIES.items()
    }
    return {"providers": VALID_PROVIDERS, "available": availability}
