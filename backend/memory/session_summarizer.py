import logging
from datetime import datetime, timezone
from uuid import uuid4

from backend.memory.models import MemoryRecord
from backend.memory.lance_store import LanceStore
from backend.memory.embedder import Embedder

logger = logging.getLogger(__name__)


class SessionSummarizer:
    def __init__(self, store: LanceStore, embedder: Embedder):
        self._store = store
        self._embedder = embedder

    async def summarize(self, content: str, session_id: str) -> MemoryRecord:
        try:
            embedding = await self._embedder.embed(content)
        except Exception as e:
            logger.error("SessionSummarizer embed failed: %s", e)
            embedding = [0.0] * 768

        record = MemoryRecord(
            id=str(uuid4()),
            session_id=session_id,
            role="debug",
            content=content,
            embedding=embedding,
            created_at=datetime.now(timezone.utc).isoformat(),
            pinned=False,
            source="debug_summary",
        )
        await self._store.write(record)
        return record
