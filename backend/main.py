import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import agents, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AgentForge backend starting up")
    yield
    logger.info("AgentForge backend shutting down")
    if ws._agent is not None:
        await ws._agent.kill()


app = FastAPI(title="AgentForge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws.router)
app.include_router(agents.router)


@app.post("/api/shutdown")
async def shutdown():
    import os, signal
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting down"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
