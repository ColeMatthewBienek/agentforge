import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

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
from backend.api import inbox as inbox_module
from backend.agents.ollama_agent import OllamaAgent
from backend.pool.agent_pool import AgentPool, run_health_monitor
from backend.pool.workdir import WorkdirManager
from backend.orchestrator.executor import TaskExecutor, TaskGraphExecutor
from backend.orchestrator.decomposer import Decomposer
from backend.orchestrator.project_planner import ProjectPlanner
from backend.orchestrator.engineering_manager import EngineeringManager
from backend.orchestrator.intellirouter import IntelliRouter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


class _SuppressPollingRoutes(logging.Filter):
    """Drop noisy 200 OK access-log lines for high-frequency polling endpoints."""
    _MUTED = ("/api/inbox/drain", "/api/health")

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(
            path in msg and "200" in msg
            for path in self._MUTED
        )


logging.getLogger("uvicorn.access").addFilter(_SuppressPollingRoutes())


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AgentForge backend starting up")

    # 1. SQLite DB
    db = await open_db(DB_PATH)
    app.state.db = db
    ws._db = db
    inbox_module._db = db

    # Mark any sessions/tasks left running from a previous server instance
    _now_iso = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE build_sessions SET status='error', completed_at=? WHERE status='running'",
        (_now_iso,),
    )
    await db.execute(
        "UPDATE build_tasks SET status='error', error='Server restarted', completed_at=? "
        "WHERE status IN ('running','pending')",
        (_now_iso,),
    )
    await db.execute(
        "UPDATE projects SET status='error', updated_at=? WHERE status IN ('executing','decomposing','em_review')",
        (_now_iso,),
    )
    await db.execute(
        "UPDATE project_runs SET status='error', completed_at=? WHERE status='running'",
        (_now_iso,),
    )
    await db.commit()

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

    # 5. Memory manager
    memory_manager = MemoryManager(store=store, shadow_agent=shadow_agent)
    app.state.memory_manager = memory_manager
    ws._memory_manager = memory_manager

    # 6. Curator stub
    curator = MemoryCurator(store=store, broadcaster=broadcaster)
    app.state.curator = curator

    # 7. Agent pool
    agent_pool = AgentPool(
        agent_factory=lambda slot_id, workdir: ClaudeAgent(slot_id, workdir),
        workdir=SHARED_WORKSPACE,
        broadcaster=broadcaster,
        idle_timeout=AGENT_IDLE_TIMEOUT_SECONDS,
    )
    app.state.agent_pool = agent_pool
    ws._agent_pool = agent_pool

    # 8. WorkdirManager + executors
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

    # 9. OllamaAgent (project decomposition with Qwen)
    ollama_agent = OllamaAgent(model="qwen3.6:27b")
    if not await ollama_agent.health_check():
        logger.warning(
            "OllamaAgent: qwen3.6:27b not available — project decomposition disabled. "
            "Run: ollama pull qwen3.6:27b"
        )
    app.state.ollama_agent = ollama_agent
    decomposer._ollama = ollama_agent  # inject into decomposer for project decomposition

    # 10. Project orchestration subsystems
    app.state.project_planner = ProjectPlanner(pool=agent_pool, memory_manager=memory_manager)
    app.state.engineering_manager = EngineeringManager(pool=agent_pool, memory_manager=memory_manager)
    app.state.intellirouter = IntelliRouter()

    # 11. Health monitor background task
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
    await ollama_agent.close()
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
from backend.api.projects import router as projects_router

app.include_router(ws.router)
app.include_router(inbox_module.router)
app.include_router(agents.router)
app.include_router(memory_router.router)
app.include_router(tasks_router)
app.include_router(projects_router)


@app.post("/api/shutdown")
async def shutdown():
    import os, signal
    os.kill(os.getpid(), signal.SIGTERM)
    return {"status": "shutting down"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/ping")
async def ping():
    return {"status": "pong", "ts": int(time.time())}
