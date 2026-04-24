import re
from pathlib import Path

from .base import CLIAgent

OLLAMA_PROMPT_RE = re.compile(r"(?:^|\r?\n)>>>\s*$")


class OllamaCliAgent(CLIAgent):
    """
    Runs `ollama run <model>` as a persistent REPL via PTY.
    v1: basic REPL interaction. No session resume.
    Default model: qwen3-coder:30b (fits RTX 5090 32GB VRAM at Q8).
    run_oneshot delegates to OllamaAgent HTTP client (more reliable).
    """

    def __init__(self, slot_id: int, workdir: Path, model: str = "qwen3-coder:30b") -> None:
        super().__init__(slot_id, workdir)
        self.model = model

    @property
    def name(self) -> str:
        return f"ollama-{self.slot_id}"

    @property
    def cmd(self) -> list[str]:
        return ["ollama", "run", self.model]

    @property
    def prompt_pattern(self) -> re.Pattern[str]:
        return OLLAMA_PROMPT_RE

    def reset_session(self) -> None:
        pass

    async def run_oneshot(self, prompt: str, timeout: int = 90) -> str:
        from backend.agents.ollama_agent import OllamaAgent
        agent = OllamaAgent(model=self.model)
        try:
            return await agent.run_oneshot(prompt, timeout=timeout)
        finally:
            await agent.close()
