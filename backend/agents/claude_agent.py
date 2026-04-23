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
    Runs `claude --output-format stream-json --verbose --print -` per message.
    Uses --resume <session_id> on subsequent calls to maintain conversation continuity.
    """

    def __init__(self, slot_id: int, workdir: Path) -> None:
        super().__init__(slot_id, workdir)
        self._claude_session_id: str | None = None

    @property
    def name(self) -> str:
        return f"claude-{self.slot_id}"

    @property
    def cmd(self) -> list[str]:
        cmd = [
            "claude",
            "--output-format", "stream-json",
            "--verbose",
            "--print",
            "--dangerously-skip-permissions",
        ]
        if self._claude_session_id:
            cmd += ["--resume", self._claude_session_id]
        cmd += ["-"]
        return cmd

    @property
    def prompt_pattern(self) -> re.Pattern[str]:
        return CLAUDE_PROMPT_RE

    async def start(self, ready_timeout: float = 30.0) -> None:
        self.status = "idle"
        self._ready.set()

    def reset_session(self) -> None:
        """Clear the stored claude session ID — starts a fresh conversation."""
        self._claude_session_id = None

    async def send(self, prompt: str) -> None:
        if self.status == "busy":
            raise RuntimeError("Agent is busy")

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

        encoded = prompt.encode("utf-8")
        self._process.stdin.write(encoded)
        await self._process.stdin.drain()
        self._process.stdin.close()

        self._reader_task = asyncio.create_task(self._read_json_stream())

    async def _kill_subprocess(self) -> None:
        proc = self._process
        if proc is None:
            return
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
        self._claude_session_id = None
        self.status = "stopped"

    async def _read_json_stream(self) -> None:
        response_sent = False
        tool_used = False
        try:
            async for raw_line in self._process.stdout:
                line = _strip_ansi(raw_line.decode("utf-8", errors="replace")).strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Capture session ID from any event so --resume works next call
                sid = event.get("session_id")
                if sid:
                    self._claude_session_id = sid

                etype = event.get("type")

                if etype == "assistant":
                    for block in event.get("message", {}).get("content", []):
                        if block.get("type") == "text" and block.get("text"):
                            await self._typewriter(block["text"])
                            response_sent = True
                        elif block.get("type") == "tool_use":
                            tool_used = True

                elif etype == "result":
                    if event.get("is_error"):
                        err = event.get("result") or event.get("subtype") or "Unknown error"
                        if not response_sent:
                            await self._response_queue.put(f"[Error] {err}")
                    else:
                        result = event.get("result", "").strip()
                        if result:
                            if not response_sent:
                                # Nothing streamed yet — show result as the full response
                                await self._typewriter(result)
                            elif tool_used:
                                # Preamble was streamed but tools were used — the result
                                # contains the completion notice the user needs to see.
                                await self._response_queue.put("\n\n")
                                await self._typewriter(result)
        except Exception as e:
            if not response_sent:
                await self._response_queue.put(f"[Error] {e}")
        finally:
            await self._response_queue.put(None)
            self._capturing = False
            self.status = "idle"

    async def run_oneshot(self, prompt: str, timeout: int = 90) -> str:
        """
        Spawn a fresh claude subprocess, collect the complete text response, return it.
        Not streamed to UI. Used by Decomposer. No --resume — always a clean session.
        Raises asyncio.TimeoutError if timeout exceeded.
        """
        cmd = [
            "claude",
            "--output-format", "stream-json",
            "--verbose",
            "--print",
            "--dangerously-skip-permissions",
            "-",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            cwd=str(self.workdir),
        )
        proc.stdin.write(prompt.encode("utf-8"))
        await proc.stdin.drain()
        proc.stdin.close()

        accumulated: list[str] = []

        async def _read() -> None:
            async for raw_line in proc.stdout:
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
                            accumulated.append(block["text"])
                elif etype == "result":
                    result = event.get("result", "")
                    if result and not accumulated:
                        accumulated.append(result)

        try:
            async with asyncio.timeout(timeout):
                await _read()
                await proc.wait()
        except asyncio.TimeoutError:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            raise

        return "".join(accumulated)

    async def _typewriter(self, text: str) -> None:
        for i in range(0, len(text), _TYPEWRITER_CHUNK):
            await self._response_queue.put(text[i : i + _TYPEWRITER_CHUNK])
            await asyncio.sleep(_TYPEWRITER_DELAY)
