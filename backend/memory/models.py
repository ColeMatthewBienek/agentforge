from dataclasses import dataclass, field
from typing import Literal


@dataclass
class MemoryChunk:
    role: str
    content: str
    session_id: str
    timestamp: str


@dataclass
class MemoryRecord:
    id: str
    session_id: str
    role: str
    content: str
    embedding: list[float]
    created_at: str
    pinned: bool
    source: str  # "shadow" | "manual"
