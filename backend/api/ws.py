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

# Phase 1: single global agent
_agent: ClaudeAgent | None = None
_agent_lock = asyncio.Lock()

# Set by main.py lifespan after memory system initializes
_memory_manager = None


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

    try:
        agent = await get_or_start_agent()
        await websocket.send_json({"type": "status", "agent": agent.name, "status": agent.status})
    except Exception as exc:
        logger.exception("Failed to start agent")
        await websocket.send_json({"type": "error", "message": f"Agent failed to start: {exc}"})
        await broadcaster.disconnect(websocket)
        await websocket.close()
        return

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = msg.get("type")

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

                continue

            if msg_type != "prompt":
                continue

            raw_prompt = str(msg.get("content", "")).strip()
            if not raw_prompt:
                continue

            # Integration point 1: enrich prompt with memory context before sending
            prompt = raw_prompt
            if _memory_manager:
                prompt = await _memory_manager.build_context(raw_prompt, session_id=session_id)

            # Integration point 2: store user message
            if _memory_manager:
                await _memory_manager.on_message(role="user", content=raw_prompt, session_id=session_id)

            try:
                await agent.send(prompt)
            except RuntimeError as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})
                continue

            full_response: list[str] = []
            sent_any = False
            try:
                async for chunk in agent.stream_output(idle_timeout=120.0):
                    await websocket.send_json({"type": "chunk", "content": chunk})
                    full_response.append(chunk)
                    sent_any = True
            except Exception as exc:
                logger.error("Error during stream: %s", exc)
                await websocket.send_json({"type": "error", "message": str(exc)})
                continue

            if not sent_any:
                await websocket.send_json({
                    "type": "error",
                    "message": "Agent returned an empty response.",
                })
                continue

            await websocket.send_json({"type": "done"})

            # Integration point 2: store assistant response
            if _memory_manager and full_response:
                await _memory_manager.on_message(
                    role="assistant",
                    content="".join(full_response),
                    session_id=session_id,
                )

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
    except Exception as exc:
        logger.exception("WebSocket error")
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
    finally:
        await broadcaster.disconnect(websocket)
