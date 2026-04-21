import logging
from datetime import datetime, timezone
from uuid import uuid4

from backend.memory.models import MemoryChunk, MemoryRecord
from backend.memory.lance_store import LanceStore
from backend.memory.shadow_agent import ShadowAgent

logger = logging.getLogger(__name__)

CONTEXT_LIMIT = 5


class MemoryManager:
    def __init__(self, store: LanceStore, shadow_agent: ShadowAgent):
        self._store = store
        self._shadow_agent = shadow_agent

    async def build_context(self, prompt: str, session_id: str) -> str:
        try:
            results = await self._store.search(prompt, limit=CONTEXT_LIMIT)
        except Exception as e:
            logger.error("build_context search failed: %s", e)
            return prompt

        if not results:
            return prompt

        context_lines = []
        for r in results:
            prefix = "[PINNED] " if r.pinned else ""
            context_lines.append(f"- {prefix}[{r.role}]: {r.content[:300]}")

        context_block = "\n".join([
            "--- Relevant memory context ---",
            *context_lines,
            "--- End context ---",
            "",
        ])
        return context_block + prompt

    async def on_message(self, role: str, content: str, session_id: str) -> None:
        """Called after each message in both directions — non-blocking."""
        chunk = MemoryChunk(
            role=role,
            content=content,
            session_id=session_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        await self._shadow_agent.process(chunk)

    async def remember(self, content: str, session_id: str) -> None:
        """Manual pin — /remember command. Embeds and stores immediately."""
        try:
            embedding = await self._shadow_agent._embedder.embed(content)
        except Exception as e:
            logger.error("remember embed failed: %s", e)
            embedding = [0.0] * 768

        record = MemoryRecord(
            id=str(uuid4()),
            session_id=session_id,
            role="user",
            content=content,
            embedding=embedding,
            created_at=datetime.now(timezone.utc).isoformat(),
            pinned=True,
            source="manual",
        )
        await self._store.write(record)
