import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])


async def _fetchone(db, sql: str, params: tuple = ()):
    cur = await db.execute(sql, params)
    return await cur.fetchone()


@router.get("")
async def list_projects(request: Request):
    db = request.app.state.db
    rows = await db.execute_fetchall(
        "SELECT * FROM projects ORDER BY updated_at DESC LIMIT 50"
    )
    return {"projects": [dict(r) for r in rows]}


@router.post("")
async def create_project(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    description = body.get("description", "") or ""
    db = request.app.state.db
    planner = request.app.state.project_planner
    project_id = await planner.create_project(name, description, db)
    return {"project_id": project_id, "status": "planning"}


@router.get("/{project_id}")
async def get_project(project_id: str, request: Request):
    db = request.app.state.db
    project = await _fetchone(db, "SELECT * FROM projects WHERE id = ?", (project_id,))
    if not project:
        raise HTTPException(404, "Project not found")

    runs = await db.execute_fetchall(
        "SELECT * FROM project_runs WHERE project_id = ? ORDER BY started_at DESC",
        (project_id,),
    )
    p = dict(project)
    p["runs"] = [dict(r) for r in runs]

    if runs:
        latest_run_id = runs[0]["id"]
        tasks = await db.execute_fetchall(
            "SELECT * FROM build_tasks WHERE project_run_id = ? ORDER BY created_at",
            (latest_run_id,),
        )
        p["tasks"] = [dict(t) for t in tasks]
    else:
        p["tasks"] = []

    return p


@router.post("/{project_id}/submit-plan")
async def submit_plan(project_id: str, request: Request):
    """
    Finalize plan → Decompose (Ollama) → EM review (Claude) → route → execute.
    Non-blocking: returns immediately, streams progress via WebSocket.
    """
    body = await request.json()
    plan_document = body.get("plan_document", "").strip()
    workdir = body.get("workdir", "").strip()
    websocket_session_id = body.get("session_id", "")

    if not plan_document:
        raise HTTPException(400, "plan_document is required")

    db = request.app.state.db
    project = await _fetchone(db, "SELECT * FROM projects WHERE id = ?", (project_id,))
    if not project:
        raise HTTPException(404, "Project not found")

    planner = request.app.state.project_planner
    decomposer = request.app.state.decomposer
    em = request.app.state.engineering_manager
    intellirouter = request.app.state.intellirouter
    task_graph_executor = request.app.state.task_graph_executor

    # Finalize plan + create run
    await planner.finalize_plan(project_id, plan_document, db)
    run_id = await planner.create_run(project_id, db)

    async def _orchestrate():
        from backend.api.broadcast import broadcaster
        ws_proxy = _BroadcastProxy(broadcaster)

        try:
            await ws_proxy.send_json({"type": "decompose_started", "project_id": project_id})

            tasks, decompose_error = await decomposer.decompose_project(
                project_id=project_id,
                project_run_id=run_id,
                plan_document=plan_document,
                workdir=workdir or str(request.app.state.workdir_manager._workspace_root),
                db=db,
            )

            await ws_proxy.send_json({
                "type": "decompose_complete",
                "project_id": project_id,
                "task_count": len(tasks),
                "error": decompose_error,
            })

            if not tasks:
                await db.execute(
                    "UPDATE projects SET status='error', updated_at=? WHERE id=?",
                    (datetime.now(timezone.utc).isoformat(), project_id),
                )
                await db.commit()
                return

            # EM review
            approved_tasks, kick_backs = await em.review(
                tasks=tasks,
                project_id=project_id,
                project_run_id=run_id,
                plan_document=plan_document,
                db=db,
                websocket=ws_proxy,
            )

            if kick_backs:
                await ws_proxy.send_json({
                    "type": "em_kick_backs",
                    "project_id": project_id,
                    "questions": kick_backs,
                })

            if not approved_tasks:
                logger.warning("EM approved 0 tasks for project %s — aborting", project_id)
                return

            # Route all tasks
            routing = intellirouter.route_all(approved_tasks)
            for task_id, decision in routing.items():
                await ws_proxy.send_json({
                    "type": "task_routed",
                    "task_id": task_id,
                    "tier": decision.tier.value,
                    "model": decision.model_name,
                    "reason": decision.reason,
                })
                # Store executor_tier decision back on the task
                for t in approved_tasks:
                    if t.id == task_id:
                        t.executor_tier = decision.tier.value
                        break

            await db.execute(
                "UPDATE projects SET status='executing', updated_at=? WHERE id=?",
                (datetime.now(timezone.utc).isoformat(), project_id),
            )
            await db.commit()

            await ws_proxy.send_json({
                "type": "execution_started",
                "project_id": project_id,
                "run_id": run_id,
            })

            await task_graph_executor.execute(
                tasks=approved_tasks,
                plan_session_id=run_id,
                chat_session_id=websocket_session_id or run_id,
                workdir=workdir,
                websocket=ws_proxy,
                db=db,
            )

        except Exception as e:
            logger.error("Project orchestration failed for %s: %s", project_id, e)
            await ws_proxy.send_json({
                "type": "project_error",
                "project_id": project_id,
                "error": str(e),
            })

    asyncio.create_task(_orchestrate())
    return {"run_id": run_id, "status": "orchestrating"}


@router.post("/{project_id}/runs/{run_id}/pause")
async def pause_run(project_id: str, run_id: str, request: Request):
    db = request.app.state.db
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE project_runs SET status='paused' WHERE id=? AND project_id=?",
        (run_id, project_id),
    )
    await db.execute(
        "UPDATE projects SET status='paused', updated_at=? WHERE id=?",
        (now, project_id),
    )
    await db.commit()
    return {"status": "paused"}


@router.post("/{project_id}/runs/{run_id}/resume")
async def resume_run(project_id: str, run_id: str, request: Request):
    db = request.app.state.db
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "UPDATE project_runs SET status='running' WHERE id=? AND project_id=?",
        (run_id, project_id),
    )
    await db.execute(
        "UPDATE projects SET status='executing', updated_at=? WHERE id=?",
        (now, project_id),
    )
    await db.commit()
    return {"status": "resumed"}


@router.get("/{project_id}/runs/{run_id}/kanban")
async def get_kanban(project_id: str, run_id: str, request: Request):
    db = request.app.state.db
    rows = await db.execute_fetchall(
        "SELECT * FROM build_tasks WHERE project_run_id = ? ORDER BY created_at",
        (run_id,),
    )
    columns: dict[str, list] = {
        "backlog": [], "assigned": [], "in_progress": [],
        "review": [], "done": [], "blocked": [],
    }
    for row in rows:
        col = row["kanban_column"] or "backlog"
        if col in columns:
            columns[col].append(dict(row))
        else:
            columns["backlog"].append(dict(row))
    return columns


@router.post("/runs/{run_id}/tasks/{task_id}/inject")
async def inject_context(run_id: str, task_id: str, request: Request):
    body = await request.json()
    content = body.get("content", "").strip()
    if not content:
        raise HTTPException(400, "content is required")

    db = request.app.state.db
    now = datetime.now(timezone.utc).isoformat()
    injection_id = str(uuid4())

    await db.execute(
        "INSERT INTO task_injections (id, task_id, project_run_id, content, injected_at) "
        "VALUES (?,?,?,?,?)",
        (injection_id, task_id, run_id, content, now),
    )
    await db.commit()

    from backend.api.broadcast import broadcaster
    await broadcaster.emit("task_injection", {
        "task_id": task_id,
        "injection_id": injection_id,
        "content": content,
    })

    return {"injection_id": injection_id, "status": "queued"}


@router.get("/runs/{run_id}/em-log")
async def get_em_log(run_id: str, request: Request):
    db = request.app.state.db
    rows = await db.execute_fetchall(
        "SELECT * FROM em_review_log WHERE project_run_id = ? ORDER BY created_at",
        (run_id,),
    )
    return {"log": [dict(r) for r in rows]}


@router.post("/pm-chat")
async def pm_chat(request: Request):
    """
    Single-turn PM chat endpoint. Uses a pool slot + run_oneshot with PM system prompt.
    Stateless — caller maintains conversation history and sends it each turn.
    """
    body = await request.json()
    messages: list[dict] = body.get("messages", [])
    project_name: str = body.get("project_name", "")

    from backend.orchestrator.project_planner import PM_SYSTEM_PROMPT

    # Build the prompt: system context + conversation history
    history_text = "\n\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
        for m in messages[:-1]  # all but the last (which is the new user message)
    )
    last_user = messages[-1]["content"] if messages else ""

    prompt = (
        f"{PM_SYSTEM_PROMPT}\n\n"
        f"Project name: {project_name}\n\n"
        + (f"--- Conversation history ---\n{history_text}\n---\n\n" if history_text else "")
        + f"User: {last_user}\n\nAssistant:"
    )

    pool = request.app.state.agent_pool
    slot = await pool.acquire(task_id="pm-chat", task_title="PM planning")
    try:
        reply = await slot.agent.run_oneshot(prompt, timeout=60)
    finally:
        await pool.release(slot)

    return {"reply": reply.strip()}


class _BroadcastProxy:
    """Wraps broadcaster so orchestration can emit events to all connected clients."""

    def __init__(self, broadcaster) -> None:
        self._broadcaster = broadcaster

    async def send_json(self, data: dict) -> None:
        try:
            event_type = data.get("type", "event")
            await self._broadcaster.emit(event_type, data)
        except Exception as e:
            logger.warning("BroadcastProxy send_json failed: %s", e)
