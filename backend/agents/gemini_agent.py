import asyncio
import json
import re
from pathlib import Path

from .base import CLIAgent


class GeminiAgent(CLIAgent):
    """
    Runs `gemini -p "<prompt>" -o stream-json` per message.
    v1: one-shot only. Full streaming deferred to v2.
    Resume via `--resume latest` on subsequent calls.

    Gemini CLI NDJSON event types (stream-json / -o stream-json):
      init        — session started
      message     — { content } assistant text
      tool_use    — { name, input } tool invocation
      tool_result — { output } tool result
      result      — { content } final result
      error       — { message }

    NOTE: Verify exact flag from `gemini --help` — may be
    `--output-format stream-json` rather than `-o stream-json`.
    """

    def __init__(self, slot_id: int, workdir: Path) -> None:
        super().__init__(slot_id, workdir)
        self._has_session = False

    @property
    def name(self) -> str:
        return f"gemini-{self.slot_id}"

    @property
    def cmd(self) -> list[str]:
        return ["gemini"]

    @property
    def prompt_pattern(self) -> re.Pattern[str]:
        return re.compile(r"(?:never matches)")

    async def start(self, ready_timeout: float = 30.0) -> None:
        self.status = "idle"
        self._ready.set()

    def reset_session(self) -> None:
        self._has_session = False

    async def send(self, prompt: str) -> None:
        if self.status == "busy":
            raise RuntimeError("Agent is busy")
        await self._kill_subprocess()
        while not self._response_queue.empty():
            self._response_queue.get_nowait()
        self.status = "busy"
        self._capturing = True
        cmd = (
            ["gemini", "--resume", "latest", "-p", prompt, "-o", "stream-json"]
            if self._has_session
            else ["gemini", "-p", prompt, "-o", "stream-json"]
        )
        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            cwd=str(self.workdir),
        )
        self._has_session = True
        self._reader_task = asyncio.create_task(self._read_json_stream())

    async def _kill_subprocess(self) -> None:
        proc = self._process
        if proc is None:
            return
        try:
            if proc.returncode is None:
                proc.kill()
                await proc.wait()
        except Exception:
            pass
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
            self._reader_task = None

    async def kill(self) -> None:
        await self._kill_subprocess()
        self._has_session = False
        self.status = "stopped"

    async def interrupt(self) -> None:
        import signal
        proc = self._process
        if proc is not None and proc.returncode is None:
            try:
                proc.send_signal(signal.SIGINT)
            except ProcessLookupError:
                pass
        self.status = "idle"
        self._capturing = False
        await self._response_queue.put(None)

    async def _read_json_stream(self) -> None:
        response_sent = False
        try:
            async for raw_line in self._process.stdout:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    if not response_sent:
                        await self._response_queue.put(line + "\n")
                    continue
                etype = event.get("type")
                if etype == "message":
                    content = event.get("content", "")
                    if content:
                        await self._typewriter(content)
                        response_sent = True
                elif etype == "tool_use":
                    await self._response_queue.put(f"[tool: {event.get('name', 'tool')}]\n")
                elif etype == "result":
                    output = event.get("content", "").strip()
                    if output and not response_sent:
                        await self._typewriter(output)
                        response_sent = True
                elif etype == "error":
                    if not response_sent:
                        await self._response_queue.put(f"[Error] {event.get('message', 'Unknown')}")
        except Exception as e:
            if not response_sent:
                await self._response_queue.put(f"[Error] {e}")
        finally:
            await self._response_queue.put(None)
            self._capturing = False
            self.status = "idle"

    async def run_oneshot(self, prompt: str, timeout: int = 90) -> str:
        proc = await asyncio.create_subprocess_exec(
            "gemini", "-p", prompt, "-o", "stream-json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            cwd=str(self.workdir),
        )
        accumulated: list[str] = []

        async def _read() -> None:
            async for raw_line in proc.stdout:
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                etype = event.get("type")
                if etype == "message":
                    accumulated.append(event.get("content", ""))
                elif etype == "result" and not accumulated:
                    accumulated.append(event.get("content", ""))

        try:
            async with asyncio.timeout(timeout):
                await _read()
                await proc.wait()
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise
        return "".join(accumulated)

    async def _typewriter(self, text: str) -> None:
        _CHUNK = 4
        _DELAY = 0.016
        for i in range(0, len(text), _CHUNK):
            await self._response_queue.put(text[i:i + _CHUNK])
            await asyncio.sleep(_DELAY)
