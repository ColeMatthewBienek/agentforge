import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.agents.claude_agent import ClaudeAgent
from backend.api.broadcast import broadcaster
from backend.config import SHARED_WORKSPACE

logger = logging.getLogger(__name__)
router = APIRouter()


async def handle_parallel_dispatch(
    tasks: list[dict],
    websocket: WebSocket,
    pool: object,
) -> None:
    """Acquire one pool slot per task, run them concurrently, stream labelled chunks."""

    async def run_one(task: dict) -> None:
        title = task.get("title", "")
        slot = await pool.acquire(task_id=task.get("task_id"), task_title=title)
        try:
            workdir_str = task.get("workdir")
            if workdir_str:
                p = Path(workdir_str).expanduser()
                if p.is_dir():
                    slot.agent.workdir = p

            await slot.agent.send(task.get("prompt", ""))

            async for chunk in slot.agent.stream_output(idle_timeout=120.0):
                await websocket.send_json({
                    "type": "chunk",
                    "slot_id": slot.slot_id,
                    "task_title": title,
                    "content": chunk,
                })
        except Exception as exc:
            logger.error("Dispatch slot %s error: %s", slot.slot_id, exc)
        finally:
            await pool.release(slot)

    await asyncio.gather(*[run_one(t) for t in tasks])
    await websocket.send_json({"type": "dispatch_done"})


# Phase 1: single global agent
_agent: ClaudeAgent | None = None
_agent_lock = asyncio.Lock()

# Set by main.py lifespan after subsystems initialize
_memory_manager = None
_agent_pool = None
_executor = None


async def get_or_start_agent() -> ClaudeAgent:
    global _agent
    async with _agent_lock:
        if _agent is None or _agent.status in ("stopped", "error"):
            if _agent is not None:
                await _agent.kill()
            _agent = ClaudeAgent(slot_id=0, workdir=SHARED_WORKSPACE)
            logger.info("Starting claude agent...")
            await _agent.start()
            logger.info("Claude agent ready.")
    return _agent


@router.websocket("/ws/stream/{session_id}")
async def stream_endpoint(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    await broadcaster.connect(websocket)
    logger.info("WebSocket connected: session=%s", session_id)
    if _memory_manager:
        _memory_manager.on_session_connect(session_id)

    try:
        agent = await get_or_start_agent()
        await websocket.send_json({"type": "status", "agent": agent.name, "status": agent.status})
    except Exception as exc:
        logger.exception("Failed to start agent")
        await websocket.send_json({"type": "error", "message": f"Agent failed to start: {exc}"})
        await broadcaster.disconnect(websocket)
        await websocket.close()
        return

    debug_mode = False
    current_stream_task: asyncio.Task | None = None

    async def _do_stream(prompt: str, is_debug: bool) -> None:
        """Runs as a background task so the receive loop stays live for interrupt."""
        full_response: list[str] = []
        sent_any = False
        try:
            await agent.send(prompt)
        except RuntimeError as exc:
            await websocket.send_json({"type": "error", "message": str(exc)})
            return
        try:
            async for chunk in agent.stream_output(idle_timeout=120.0):
                await websocket.send_json({"type": "chunk", "content": chunk})
                full_response.append(chunk)
                sent_any = True
        except asyncio.CancelledError:
            return  # interrupted — frontend gets "interrupted" from the interrupt handler
        except Exception as exc:
            logger.error("Error during stream: %s", exc)
            await websocket.send_json({"type": "error", "message": str(exc)})
            return

        if not sent_any:
            await websocket.send_json({"type": "error", "message": "Agent returned an empty response."})
            return

        await websocket.send_json({"type": "done"})

        if _memory_manager and full_response and not is_debug:
            await _memory_manager.on_message(
                role="assistant",
                content="".join(full_response),
                session_id=session_id,
            )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = msg.get("type")

            # ── Interrupt ──────────────────────────────────────────────────────
            if msg_type == "interrupt":
                if current_stream_task and not current_stream_task.done():
                    current_stream_task.cancel()
                    try:
                        await current_stream_task
                    except asyncio.CancelledError:
                        pass
                    current_stream_task = None
                await agent.interrupt()
                await websocket.send_json({"type": "interrupted"})
                continue

            # ── Commands ───────────────────────────────────────────────────────
            if msg_type == "command":
                name = str(msg.get("name", "")).strip()
                args = str(msg.get("args", "")).strip()

                if name == "set_workdir":
                    path = Path(args).expanduser()
                    if not path.is_dir():
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Directory not found: {args}",
                        })
                    else:
                        agent.workdir = path
                        await websocket.send_json({"type": "chunk", "content": f"Working directory set to: {path}"})
                        await websocket.send_json({"type": "done"})

                elif name == "remember":
                    if _memory_manager:
                        await _memory_manager.remember(content=args, session_id=session_id)
                    await websocket.send_json({"type": "chunk", "content": "Remembered."})
                    await websocket.send_json({"type": "done"})

                elif name == "recall":
                    query = args.strip()
                    if not query:
                        await websocket.send_json({"type": "chunk", "content": "Usage: /recall <query>"})
                        await websocket.send_json({"type": "done"})
                    elif not _memory_manager:
                        await websocket.send_json({"type": "chunk", "content": "Memory system not available."})
                        await websocket.send_json({"type": "done"})
                    else:
                        results = await _memory_manager._store.search(query, limit=10)
                        await websocket.send_json({
                            "type": "recall_results",
                            "query": query,
                            "results": [
                                {
                                    "id": r.id,
                                    "role": r.role,
                                    "content": r.content,
                                    "created_at": r.created_at,
                                    "pinned": r.pinned,
                                    "source": r.source,
                                }
                                for r in results
                            ],
                        })

                elif name == "new_session":
                    agent.reset_session()
                    await websocket.send_json({"type": "session_reset"})

                elif name == "set_debug":
                    debug_mode = args.strip().lower() == "true"
                    await websocket.send_json({"type": "debug_toggled", "enabled": debug_mode})

                elif name == "debug_summarize":
                    if args and _memory_manager:
                        await _memory_manager.debug_summarize(content=args, session_id=session_id)
                    await websocket.send_json({"type": "chunk", "content": "Debug session saved to memory."})
                    await websocket.send_json({"type": "done"})

                continue

            # ── Dispatch ───────────────────────────────────────────────────────
            if msg_type == "dispatch":
                if _agent_pool is None:
                    await websocket.send_json({"type": "error", "message": "Agent pool not available"})
                else:
                    tasks = [t for t in msg.get("tasks", []) if isinstance(t, dict)]
                    await handle_parallel_dispatch(tasks, websocket, _agent_pool)
                continue

            # ── Build (worktree-isolated, same agent thread + memory) ──────────
            if msg_type == "build":
                if _executor is None:
                    await websocket.send_json({"type": "error", "message": "Executor not available"})
                    continue
                raw_build_prompt = str(msg.get("prompt", "")).strip()
                base_dir = str(msg.get("base_dir", str(agent.workdir))).strip()
                task_id = str(msg.get("task_id", session_id)).strip()
                if not raw_build_prompt:
                    await websocket.send_json({"type": "error", "message": "build requires a prompt"})
                    continue
                if current_stream_task and not current_stream_task.done():
                    await websocket.send_json({"type": "error", "message": "Agent is busy"})
                    continue

                # Memory / context — same path as regular prompts
                build_prompt = raw_build_prompt
                if _memory_manager and not debug_mode:
                    build_prompt = await _memory_manager.build_context(raw_build_prompt, session_id=session_id)
                if _memory_manager and not debug_mode:
                    await _memory_manager.on_message(role="user", content=raw_build_prompt, session_id=session_id)

                orig_workdir = agent.workdir

                async def _do_build_stream(
                    prompt=build_prompt,
                    raw=raw_build_prompt,
                    base_dir=base_dir,
                    task_id=task_id,
                    orig_wd=orig_workdir,
                    is_debug=debug_mode,
                ):
                    workdir = Path(base_dir)
                    try:
                        workdir = await _executor._workdir_manager.create(task_id, base_dir)
                        agent.workdir = workdir
                        if workdir != Path(base_dir):
                            await websocket.send_json({
                                "type": "chunk",
                                "content": f"[worktree: agentforge/{task_id}]\n\n",
                            })
                        # Delegate to the standard stream path — handles streaming + memory saving
                        await _do_stream(prompt, is_debug)
                    except asyncio.CancelledError:
                        raise
                    finally:
                        agent.workdir = orig_wd
                        await _executor._workdir_manager.cleanup(task_id, base_dir)

                current_stream_task = asyncio.create_task(_do_build_stream())
                continue

            # ── Prompt ─────────────────────────────────────────────────────────
            if msg_type != "prompt":
                continue

            raw_prompt = str(msg.get("content", "")).strip()
            if not raw_prompt:
                continue

            # Skip context injection and shadow recording in debug mode
            prompt = raw_prompt
            if _memory_manager and not debug_mode:
                prompt = await _memory_manager.build_context(raw_prompt, session_id=session_id)

            if _memory_manager and not debug_mode:
                await _memory_manager.on_message(role="user", content=raw_prompt, session_id=session_id)

            if current_stream_task and not current_stream_task.done():
                await websocket.send_json({"type": "error", "message": "Agent is busy"})
                continue

            # Streaming runs as a background task so interrupt messages can arrive.
            current_stream_task = asyncio.create_task(_do_stream(prompt, debug_mode))

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
    except Exception as exc:
        logger.exception("WebSocket error")
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        if current_stream_task and not current_stream_task.done():
            current_stream_task.cancel()
            try:
                await current_stream_task
            except asyncio.CancelledError:
                pass
        if _memory_manager:
            _memory_manager.cancel_session(session_id)
        await broadcaster.disconnect(websocket)
