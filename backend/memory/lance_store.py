import asyncio
import logging
from pathlib import Path
from uuid import uuid4

import lancedb
import pyarrow as pa

from backend.memory.models import MemoryRecord
from backend.memory.embedder import Embedder

logger = logging.getLogger(__name__)

MEMORY_SCHEMA = pa.schema([
    pa.field("id", pa.string()),
    pa.field("session_id", pa.string()),
    pa.field("role", pa.string()),
    pa.field("content", pa.string()),
    pa.field("embedding", pa.list_(pa.float32(), 768)),
    pa.field("created_at", pa.string()),
    pa.field("pinned", pa.bool_()),
    pa.field("source", pa.string()),
])


def _row_to_record(row: dict) -> MemoryRecord:
    return MemoryRecord(
        id=row["id"],
        session_id=row["session_id"],
        role=row["role"],
        content=row["content"],
        embedding=list(row["embedding"]),
        created_at=row["created_at"],
        pinned=bool(row["pinned"]),
        source=row["source"],
    )


class LanceStore:
    def __init__(self, db_path: Path, embedder: Embedder):
        self._db_path = db_path
        self._embedder = embedder
        self._db: lancedb.DBConnection | None = None
        self._table = None

    async def initialize(self) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._sync_initialize)

    def _sync_initialize(self) -> None:
        self._db_path.mkdir(parents=True, exist_ok=True)
        self._db = lancedb.connect(str(self._db_path))
        try:
            self._table = self._db.open_table("memories")
        except Exception:
            self._table = self._db.create_table("memories", schema=MEMORY_SCHEMA)

    async def write(self, record: MemoryRecord) -> None:
        loop = asyncio.get_event_loop()
        row = {
            "id": record.id,
            "session_id": record.session_id,
            "role": record.role,
            "content": record.content,
            "embedding": record.embedding,
            "created_at": record.created_at,
            "pinned": record.pinned,
            "source": record.source,
        }
        await loop.run_in_executor(None, lambda: self._table.add([row]))

    async def search(self, query: str, limit: int = 10) -> list[MemoryRecord]:
        loop = asyncio.get_event_loop()
        embedding = await self._embedder.embed(query)

        def _search():
            try:
                count = self._table.count_rows()
                if count == 0:
                    return []
                rows = (
                    self._table.search(embedding)
                    .limit(min(limit + 20, count))
                    .to_list()
                )
                # Pinned records surface first, then sort by distance
                rows.sort(key=lambda r: (not r.get("pinned", False), r.get("_distance", 0.0)))
                return rows[:limit]
            except Exception as e:
                logger.error("LanceStore.search error: %s", e)
                return []

        rows = await loop.run_in_executor(None, _search)
        return [_row_to_record(r) for r in rows]

    async def get_recent(self, session_id: str, limit: int = 20) -> list[MemoryRecord]:
        loop = asyncio.get_event_loop()

        def _get():
            try:
                df = self._table.to_pandas()
                df = df[df["session_id"] == session_id]
                df = df.sort_values("created_at", ascending=False)
                return df.head(limit).to_dict("records")
            except Exception as e:
                logger.error("LanceStore.get_recent error: %s", e)
                return []

        rows = await loop.run_in_executor(None, _get)
        return [_row_to_record(r) for r in rows]

    async def get_all(self, page: int = 1, page_size: int = 20) -> tuple[list[MemoryRecord], int]:
        loop = asyncio.get_event_loop()

        def _get():
            try:
                df = self._table.to_pandas()
                df = df.sort_values("created_at", ascending=False)
                total = len(df)
                start = (page - 1) * page_size
                rows = df.iloc[start : start + page_size].to_dict("records")
                return rows, total
            except Exception as e:
                logger.error("LanceStore.get_all error: %s", e)
                return [], 0

        rows, total = await loop.run_in_executor(None, _get)
        return [_row_to_record(r) for r in rows], total

    async def delete(self, record_id: str) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, lambda: self._table.delete(f"id = '{record_id}'")
        )

    async def pin(self, record_id: str) -> None:
        loop = asyncio.get_event_loop()

        def _pin():
            df = self._table.to_pandas()
            mask = df["id"] == record_id
            if not mask.any():
                return
            df.loc[mask, "pinned"] = True
            self._table.delete(f"id = '{record_id}'")
            self._table.add(df[mask].to_dict("records"))

        await loop.run_in_executor(None, _pin)

    async def unpin(self, record_id: str) -> None:
        loop = asyncio.get_event_loop()

        def _unpin():
            df = self._table.to_pandas()
            mask = df["id"] == record_id
            if not mask.any():
                return
            df.loc[mask, "pinned"] = False
            self._table.delete(f"id = '{record_id}'")
            self._table.add(df[mask].to_dict("records"))

        await loop.run_in_executor(None, _unpin)
