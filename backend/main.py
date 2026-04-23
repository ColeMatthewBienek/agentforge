import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import agents, ws
from backend.api import memory as memory_router
from backend.api.broadcast import broadcaster
from backend.config import (
    DB_PATH,
    LANCEDB_DIR,
    SHARED_WORKSPACE,
    AGENT_IDLE_TIMEOUT_SECONDS,
    HEALTH_CHECK_INTERVAL_SECONDS,
)
from backend.db import open_db
from backend.memory.embedder import Embedder
from backend.memory.lance_store import LanceStore
from backend.memory.shadow_agent import ShadowAgent
from backend.memory.memory_manager import MemoryManager
from backend.memory.curator import MemoryCurator
from backend.agents.claude_agent import ClaudeAgent
from backend.pool.agent_pool import AgentPool, run_health_monitor
from backend.pool.workdir import WorkdirManager
from backend.orchestrator.executor import TaskExecutor, TaskGraphExecutor
from backend.orchestrator.decomposer import Decomposer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AgentForge backend starting up")

    # 1. SQLite DB
    db = await open_db(DB_PATH)
    app.state.db = db
    ws._db = db

    # 2. LanceDB store
    embedder = Embedder()
    store = LanceStore(db_path=LANCEDB_DIR / "memories", embedder=embedder)
    await store.initialize()

    # 3. Embedder health check
    if not await embedder.health_check():
        logger.error(
            "Ollama is not running or nomic-embed-text is not pulled. "
            "Run: ollama pull nomic-embed-text && ollama serve  "
            "Memory system will be disabled until Ollama is available."
        )

    # 4. Shadow agent
    shadow_agent = ShadowAgent(store=store, embedder=embedder, broadcaster=broadcaster)
    await shadow_agent.start()

    # 5. Memory manager — inject into app state and ws module
    memory_manager = MemoryManager(store=store, shadow_agent=shadow_agent)
    app.state.memory_manager = memory_manager
    ws._memory_manager = memory_manager

    # 6. Curator stub
    curator = MemoryCurator(store=store, broadcaster=broadcaster)
    app.state.curator = curator

    # 7. Agent pool — inject into app state and ws module
    agent_pool = AgentPool(
        agent_factory=lambda slot_id, workdir: ClaudeAgent(slot_id, workdir),
        workdir=SHARED_WORKSPACE,
        broadcaster=broadcaster,
        idle_timeout=AGENT_IDLE_TIMEOUT_SECONDS,
    )
    app.state.agent_pool = agent_pool
    ws._agent_pool = agent_pool

    # 8. WorkdirManager + TaskExecutor (single-task /build) + TaskGraphExecutor (/plan)
    workdir_manager = WorkdirManager()
    app.state.workdir_manager = workdir_manager

    executor = TaskExecutor(pool=agent_pool, workdir_manager=workdir_manager)
    ws._executor = executor

    decomposer = Decomposer(pool=agent_pool, memory_manager=memory_manager)
    app.state.decomposer = decomposer
    ws._decomposer = decomposer

    task_graph_executor = TaskGraphExecutor(
        pool=agent_pool,
        workdir_manager=workdir_manager,
        memory_manager=memory_manager,
    )
    app.state.task_graph_executor = task_graph_executor
    ws._task_graph_executor = task_graph_executor

    # 9. Health monitor background task
    health_task = asyncio.create_task(
        run_health_monitor(agent_pool, interval=HEALTH_CHECK_INTERVAL_SECONDS)
    )

    yield

    logger.info("AgentForge backend shutting down")
    health_task.cancel()
    try:
        await health_task
    except asyncio.CancelledError:
        pass
    await agent_pool.shutdown_all()
    await shadow_agent.shutdown()
    await embedder.shutdown()
    if ws._agent is not None:
        await ws._agent.kill()
    await db.close()


app = FastAPI(title="AgentForge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.api.tasks import router as tasks_router

app.include_router(ws.router)
app.include_router(agents.router)
app.include_router(memory_router.router)
app.include_router(tasks_router)


@app.post("/api/shutdown")
async def shutdown():
    import os, signal
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting down"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
