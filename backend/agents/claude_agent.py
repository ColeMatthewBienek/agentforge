import asyncio
import json
import re
import signal
from pathlib import Path

from .base import CLIAgent, _strip_ansi

CLAUDE_PROMPT_RE = re.compile(r"(?:^|\r?\n)>\s*$")

_TYPEWRITER_CHUNK = 4
_TYPEWRITER_DELAY = 0.016


class ClaudeAgent(CLIAgent):
    """
    Runs `claude --output-format stream-json --verbose --print -` per message,
    passing the prompt via stdin. This avoids shell argument parsing issues
    (e.g. prompts starting with dashes being treated as flags) and correctly
    handles multi-line prompts from memory context injection.
    """

    @property
    def name(self) -> str:
        return f"claude-{self.slot_id}"

    @property
    def cmd(self) -> list[str]:
        return ["claude", "--output-format", "stream-json", "--verbose", "--print", "-"]

    @property
    def prompt_pattern(self) -> re.Pattern[str]:
        return CLAUDE_PROMPT_RE

    async def start(self, ready_timeout: float = 30.0) -> None:
        self.status = "idle"
        self._ready.set()

    async def send(self, prompt: str) -> None:
        if self.status == "busy":
            raise RuntimeError("Agent is busy")

        # Kill any previous subprocess
        await self._kill_subprocess()

        while not self._response_queue.empty():
            self._response_queue.get_nowait()

        self.status = "busy"
        self._capturing = True

        self._process = await asyncio.create_subprocess_exec(
            *self.cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            cwd=str(self.workdir),
        )

        # Write prompt to stdin and close it so claude knows input is done
        encoded = prompt.encode("utf-8")
        self._process.stdin.write(encoded)
        await self._process.stdin.drain()
        self._process.stdin.close()

        self._reader_task = asyncio.create_task(self._read_json_stream())

    async def _kill_subprocess(self) -> None:
        proc = self._process
        if proc is None:
            return
        # Handle both asyncio.Process and legacy ptyprocess
        try:
            if hasattr(proc, "returncode") and proc.returncode is None:
                proc.kill()
                await proc.wait()
            elif hasattr(proc, "isalive") and proc.isalive():
                proc.terminate(force=True)
        except Exception:
            pass
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
            self._reader_task = None

    async def interrupt(self) -> None:
        """Send SIGINT to the current subprocess without ending the session."""
        proc = self._process
        if proc is not None and proc.returncode is None:
            try:
                proc.send_signal(signal.SIGINT)
            except ProcessLookupError:
                pass
        self.status = "idle"
        self._capturing = False
        await self._response_queue.put(None)

    async def kill(self) -> None:
        await self._kill_subprocess()
        self.status = "stopped"

    async def _read_json_stream(self) -> None:
        response_sent = False
        try:
            async for raw_line in self._process.stdout:
                line = _strip_ansi(raw_line.decode("utf-8", errors="replace")).strip()
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
                        result = event.get("result", "")
                        if result:
                            await self._typewriter(result)
        except Exception as e:
            if not response_sent:
                await self._response_queue.put(f"[Error] {e}")
        finally:
            await self._response_queue.put(None)
            self._capturing = False
            self.status = "idle"

    async def _typewriter(self, text: str) -> None:
        for i in range(0, len(text), _TYPEWRITER_CHUNK):
            await self._response_queue.put(text[i : i + _TYPEWRITER_CHUNK])
            await asyncio.sleep(_TYPEWRITER_DELAY)
