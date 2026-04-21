import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Literal

from pydantic import BaseModel

from backend.agents.base import CLIAgent

logger = logging.getLogger(__name__)

# Factory type — the pool never imports a specific agent class.
# Pass lambda slot_id, workdir: ClaudeAgent(slot_id, workdir) for Claude,
# or any other CLIAgent subclass for future agent types.
AgentFactory = Callable[[int, Path], CLIAgent]


class SlotStatus(BaseModel):
    slot_id: str
    status: Literal["starting", "idle", "busy", "stopping", "error"]
    current_task_id: str | None = None
    current_task_title: str | None = None
    uptime_seconds: int
    idle_since: datetime | None = None


class AgentSlot:
    def __init__(self, slot_id: str, agent: CLIAgent) -> None:
        self.slot_id = slot_id
        self.agent = agent
        self.status: Literal["starting", "idle", "busy", "stopping", "error"] = "starting"
        self.current_task_id: str | None = None
        self.current_task_title: str | None = None
        self.started_at: datetime = datetime.now(timezone.utc)
        self.idle_since: datetime | None = None
        self._idle_timer: asyncio.Task | None = None

    def snapshot(self) -> SlotStatus:
        uptime = int((datetime.now(timezone.utc) - self.started_at).total_seconds())
        return SlotStatus(
            slot_id=self.slot_id,
            status=self.status,
            current_task_id=self.current_task_id,
            current_task_title=self.current_task_title,
            uptime_seconds=uptime,
            idle_since=self.idle_since,
        )

    def cancel_idle_timer(self) -> None:
        if self._idle_timer and not self._idle_timer.done():
            self._idle_timer.cancel()
            self._idle_timer = None


class AgentPool:
    def __init__(
        self,
        agent_factory: AgentFactory,
        workdir: Path,
        broadcaster=None,
        idle_timeout: int = 300,
    ) -> None:
        self._factory = agent_factory
        self._workdir = workdir
        self._broadcaster = broadcaster
        self._idle_timeout = idle_timeout
        self._slots: dict[str, AgentSlot] = {}
        self._next_id: int = 0
        self._lock = asyncio.Lock()

    async def acquire(
        self,
        task_id: str | None = None,
        task_title: str | None = None,
    ) -> AgentSlot:
        async with self._lock:
            for slot in self._slots.values():
                if slot.status == "idle":
                    slot.cancel_idle_timer()
                    slot.status = "busy"
                    slot.current_task_id = task_id
                    slot.current_task_title = task_title
                    slot.idle_since = None
                    await self._broadcast_locked()
                    return slot

            idx = self._next_id
            self._next_id += 1
            agent = self._factory(idx, self._workdir)
            slot = AgentSlot(slot_id=agent.name, agent=agent)
            self._slots[slot.slot_id] = slot

        try:
            await agent.start()
        except Exception as exc:
            async with self._lock:
                slot.status = "error"
            await self._broadcast()
            raise RuntimeError(f"Failed to start agent {slot.slot_id}: {exc}") from exc

        async with self._lock:
            slot.status = "busy"
            slot.current_task_id = task_id
            slot.current_task_title = task_title

        await self._broadcast()
        return slot

    async def release(self, slot: AgentSlot) -> None:
        async with self._lock:
            if slot.slot_id not in self._slots:
                return
            slot.status = "idle"
            slot.current_task_id = None
            slot.current_task_title = None
            slot.idle_since = datetime.now(timezone.utc)
            slot._idle_timer = asyncio.create_task(self._idle_expire(slot))
        await self._broadcast()

    async def _idle_expire(self, slot: AgentSlot) -> None:
        await asyncio.sleep(self._idle_timeout)
        async with self._lock:
            if slot.slot_id not in self._slots or slot.status != "idle":
                return
            slot.status = "stopping"
        await self._broadcast()
        try:
            await slot.agent.kill()
        except Exception as exc:
            logger.warning("Error killing idle slot %s: %s", slot.slot_id, exc)
        async with self._lock:
            self._slots.pop(slot.slot_id, None)
        await self._broadcast()
        logger.info("Idle slot %s shut down after timeout", slot.slot_id)

    async def mark_error(self, slot: AgentSlot) -> None:
        """Called by health monitor when a slot's process dies unexpectedly."""
        async with self._lock:
            if slot.slot_id not in self._slots:
                return
            slot.cancel_idle_timer()
            slot.status = "error"
        await self._broadcast()
        async with self._lock:
            self._slots.pop(slot.slot_id, None)
        await self._broadcast()
        logger.error(
            "Slot %s removed after unexpected death (task: %s)",
            slot.slot_id,
            slot.current_task_id,
        )

    async def check_health(self) -> None:
        """Inspect each slot and remove any whose agent process has died."""
        async with self._lock:
            slots = list(self._slots.values())
        for slot in slots:
            if slot.status in ("starting", "stopping", "error"):
                continue
            if slot.agent.status in ("stopped", "error"):
                logger.error("Health check: slot %s process died unexpectedly", slot.slot_id)
                await self.mark_error(slot)

    def status(self) -> list[SlotStatus]:
        return [slot.snapshot() for slot in self._slots.values()]

    async def shutdown_all(self) -> None:
        async with self._lock:
            slots = list(self._slots.values())
        for slot in slots:
            slot.cancel_idle_timer()
            try:
                await slot.agent.kill()
            except Exception as exc:
                logger.warning("Error killing slot %s on shutdown: %s", slot.slot_id, exc)
        async with self._lock:
            self._slots.clear()
        logger.info("Agent pool shut down cleanly")

    async def _broadcast(self) -> None:
        if self._broadcaster is None:
            return
        try:
            async with self._lock:
                payload = [s.snapshot().model_dump(mode="json") for s in self._slots.values()]
            await self._broadcaster.emit(
                "AGENT_POOL_UPDATE",
                {"slots": payload, "idle_timeout_seconds": self._idle_timeout},
            )
        except Exception as exc:
            logger.warning("Pool broadcast failed: %s", exc)

    async def _broadcast_locked(self) -> None:
        """Broadcast from inside an already-held lock — builds payload without re-acquiring."""
        if self._broadcaster is None:
            return
        try:
            payload = [s.snapshot().model_dump(mode="json") for s in self._slots.values()]
            asyncio.create_task(
                self._broadcaster.emit(
                    "AGENT_POOL_UPDATE",
                    {"slots": payload, "idle_timeout_seconds": self._idle_timeout},
                )
            )
        except Exception as exc:
            logger.warning("Pool broadcast_locked failed: %s", exc)


async def run_health_monitor(pool: AgentPool, interval: int = 30) -> None:
    """Background task: check pool slot health every `interval` seconds."""
    while True:
        try:
            await asyncio.sleep(interval)
            await pool.check_health()
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("Health monitor error: %s", exc)
