import asyncio
import logging
from uuid import uuid4

from backend.memory.models import MemoryChunk, MemoryRecord
from backend.memory.embedder import Embedder
from backend.memory.lance_store import LanceStore

logger = logging.getLogger(__name__)


class ShadowAgent:
    def __init__(self, store: LanceStore, embedder: Embedder, broadcaster):
        self._store = store
        self._embedder = embedder
        self._broadcaster = broadcaster
        self._queue: asyncio.Queue[MemoryChunk] = asyncio.Queue(maxsize=100)
        self._active_sessions: set[str] = set()
        self._worker_task: asyncio.Task | None = None

    async def start(self) -> None:
        self._worker_task = asyncio.create_task(self._worker())

    def register_session(self, session_id: str) -> None:
        self._active_sessions.add(session_id)

    async def process(self, message: MemoryChunk) -> None:
        try:
            self._queue.put_nowait(message)
        except asyncio.QueueFull:
            logger.warning("Shadow agent queue full — dropping message for session %s", message.session_id)

    def cancel_session(self, session_id: str) -> None:
        """Remove session and drain its pending queue items."""
        self._active_sessions.discard(session_id)
        remaining: list[MemoryChunk] = []
        while not self._queue.empty():
            try:
                item = self._queue.get_nowait()
                if item.session_id == session_id:
                    # Discarded — must account for the put() that queued it.
                    self._queue.task_done()
                else:
                    remaining.append(item)
            except asyncio.QueueEmpty:
                break
        for item in remaining:
            try:
                self._queue.put_nowait(item)
            except asyncio.QueueFull:
                # Can't put it back — discard and account for it.
                self._queue.task_done()
                break

    async def shutdown(self) -> None:
        """Flush pending writes then stop."""
        await self._queue.join()
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    async def _worker(self) -> None:
        while True:
            message = await self._queue.get()
            try:
                if message.session_id not in self._active_sessions:
                    continue
                await self._embed_and_store(message)
            except Exception as e:
                logger.error("Shadow agent worker error: %s", e)
            finally:
                self._queue.task_done()

    async def _embed_and_store(self, message: MemoryChunk) -> None:
        try:
            embedding = await self._embedder.embed(message.content)
            record = MemoryRecord(
                id=str(uuid4()),
                session_id=message.session_id,
                role=message.role,
                content=message.content,
                embedding=embedding,
                created_at=message.timestamp,
                pinned=False,
                source="shadow",
            )
            await self._store.write(record)
            await self._broadcaster.emit("MEMORY_STORED", {
                "record_id": record.id,
                "session_id": record.session_id,
                "role": record.role,
                "preview": record.content[:120],
                "created_at": record.created_at,
            })
        except Exception as e:
            logger.error("Shadow agent error: %s", e)
            # Never propagate — shadow agent must never affect primary agent
