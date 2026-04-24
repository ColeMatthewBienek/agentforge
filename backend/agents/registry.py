from pathlib import Path

from backend.agents.claude_agent import ClaudeAgent
from backend.agents.codex_agent import CodexAgent
from backend.agents.gemini_agent import GeminiAgent
from backend.agents.ollama_cli_agent import OllamaCliAgent
from backend.agents.base import CLIAgent

PROVIDER_CLASSES: dict[str, type[CLIAgent]] = {
    "claude": ClaudeAgent,
    "codex":  CodexAgent,
    "gemini": GeminiAgent,
    "ollama": OllamaCliAgent,
}

VALID_PROVIDERS: list[str] = list(PROVIDER_CLASSES.keys())


def make_agent(provider_type: str, slot_id: int, workdir: Path) -> CLIAgent:
    """Factory — returns an agent instance for the given provider type."""
    cls = PROVIDER_CLASSES.get(provider_type)
    if cls is None:
        raise ValueError(f"Unknown provider: {provider_type!r}. Valid: {VALID_PROVIDERS}")
    return cls(slot_id=slot_id, workdir=workdir)
