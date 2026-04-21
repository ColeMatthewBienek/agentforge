import asyncio
import json
import re
import tempfile
from pathlib import Path

import ptyprocess

from .base import CLIAgent, _strip_ansi

CLAUDE_PROMPT_RE = re.compile(r"(?:^|\r?\n)>\s*$")

# Characters per typewriter chunk sent to the WebSocket client.
# At ~16ms per chunk this gives smooth ~60fps perceived streaming.
_TYPEWRITER_CHUNK = 4
_TYPEWRITER_DELAY = 0.016


class ClaudeAgent(CLIAgent):
    """
    Uses `claude --output-format stream-json --verbose --print` for clean JSON
    event parsing.  The prompt is written to a temp file and passed via stdin
    to avoid shell argument-length limits on long prompts.
    """

    @property
    def name(self) -> str:
        return f"claude-{self.slot_id}"

    @property
    def cmd(self) -> list[str]:
        return ["claude", "--output-format", "stream-json", "--verbose", "--print"]

    @property
    def prompt_pattern(self) -> re.Pattern[str]:
        return CLAUDE_PROMPT_RE

    async def start(self, ready_timeout: float = 30.0) -> None:
        self.status = "idle"
        self._ready.set()

    async def send(self, prompt: str) -> None:
        if self.status == "busy":
            raise RuntimeError("Agent is busy")

        if self._process and self._process.isalive():
            self._process.terminate(force=True)
        if self._reader_task:
            self._reader_task.cancel()

        while not self._response_queue.empty():
            self._response_queue.get_nowait()

        self.status = "busy"
        self._capturing = True
        self._current_prompt = prompt

        self._process = ptyprocess.PtyProcess.spawn(
            [*self.cmd, prompt],
            cwd=str(self.workdir),
            dimensions=(50, 220),
        )
        self._reader_task = asyncio.create_task(self._read_json_stream())

    async def _read_json_stream(self) -> None:
        loop = asyncio.get_event_loop()
        buf = ""
        response_sent = False

        while True:
            raw = await loop.run_in_executor(None, self._read_chunk)
            if raw is None:
                break
            if not raw:
                if not self._process.isalive():
                    break
                continue

            text = raw.decode("utf-8", errors="replace")
            text = _strip_ansi(text)
            buf += text

            lines = buf.split("\n")
            buf = lines[-1]

            for line in lines[:-1]:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue

                etype = event.get("type")

                if etype == "assistant":
                    for block in event.get("message", {}).get("content", []):
                        if block.get("type") == "text" and block.get("text"):
                            await self._typewriter(block["text"])
                            response_sent = True

                elif etype == "result":
                    if event.get("is_error"):
                        err = event.get("result") or event.get("subtype") or "Unknown error"
                        if not response_sent:
                            await self._response_queue.put(f"[Error] {err}")
                    elif not response_sent:
                        # Fallback: use the result field if no assistant event fired
                        result = event.get("result", "")
                        if result:
                            await self._typewriter(result)

        await self._response_queue.put(None)
        self._capturing = False
        self.status = "idle"

    async def _typewriter(self, text: str) -> None:
        """Stream text in small chunks to produce a typewriter effect."""
        for i in range(0, len(text), _TYPEWRITER_CHUNK):
            await self._response_queue.put(text[i : i + _TYPEWRITER_CHUNK])
            await asyncio.sleep(_TYPEWRITER_DELAY)
