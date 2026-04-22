import asyncio
import re
import signal
from abc import ABC, abstractmethod
from pathlib import Path
from typing import AsyncIterator, Literal

import ptyprocess


def _strip_ansi(text: str) -> str:
    # CSI sequences (includes private ? and > modes)
    text = re.sub(r"\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]", "", text)
    # OSC sequences
    text = re.sub(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)", "", text)
    # Other 2-char ESC sequences
    text = re.sub(r"\x1b[\x20-\x7e]", "", text)
    # C1 controls, lone ESC, bare CR
    text = re.sub(r"[\x80-\x9f]|\x1b|\r(?!\n)", "", text)
    return text


class CLIAgent(ABC):
    def __init__(self, slot_id: int, workdir: Path) -> None:
        self.slot_id = slot_id
        self.workdir = workdir
        self.status: Literal["idle", "busy", "error", "stopped"] = "stopped"
        self._process: ptyprocess.PtyProcess | None = None
        self._reader_task: asyncio.Task | None = None
        self._response_queue: asyncio.Queue[str | None] = asyncio.Queue()
        self._capturing = False
        self._ready = asyncio.Event()

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def cmd(self) -> list[str]: ...

    @property
    @abstractmethod
    def prompt_pattern(self) -> re.Pattern[str]: ...

    async def start(self, ready_timeout: float = 30.0) -> None:
        self._process = ptyprocess.PtyProcess.spawn(
            self.cmd,
            cwd=str(self.workdir),
            dimensions=(50, 220),
        )
        self.status = "idle"
        self._reader_task = asyncio.create_task(self._read_loop())
        try:
            await asyncio.wait_for(self._ready.wait(), timeout=ready_timeout)
        except asyncio.TimeoutError:
            raise RuntimeError(
                f"Agent {self.name} did not become ready within {ready_timeout}s"
            )

    def _read_chunk(self) -> bytes | None:
        """Blocking read — runs in a thread executor. Returns None on EOF/error."""
        try:
            return self._process.read(4096)
        except (EOFError, OSError):
            return None

    async def _read_loop(self) -> None:
        loop = asyncio.get_event_loop()
        accumulated = ""
        while self._process and self._process.isalive():
            raw = await loop.run_in_executor(None, self._read_chunk)
            if raw is None:
                break

            chunk = raw.decode("utf-8", errors="replace")
            accumulated += chunk
            clean = _strip_ansi(accumulated)

            if self._capturing:
                await self._response_queue.put(chunk)

            if self.prompt_pattern.search(clean[-200:]):
                if not self._ready.is_set():
                    self._ready.set()
                if self._capturing:
                    await self._response_queue.put(None)
                    self._capturing = False
                accumulated = ""

        if self._capturing:
            await self._response_queue.put(None)
        if self.status not in ("stopped",):
            self.status = "error"

    async def send(self, prompt: str) -> None:
        if not self._process or not self._process.isalive():
            raise RuntimeError("Agent is not running")
        if self.status == "busy":
            raise RuntimeError("Agent is busy")
        while not self._response_queue.empty():
            self._response_queue.get_nowait()
        self._capturing = True
        self.status = "busy"
        self._process.write((prompt + "\n").encode())

    async def stream_output(self, idle_timeout: float = 5.0) -> AsyncIterator[str]:
        while True:
            try:
                chunk = await asyncio.wait_for(
                    self._response_queue.get(),
                    timeout=idle_timeout,
                )
            except asyncio.TimeoutError:
                self._capturing = False
                self.status = "idle"
                return
            if chunk is None:
                self.status = "idle"
                return
            yield chunk

    async def is_generating(self) -> bool:
        return self.status == "busy"

    async def interrupt(self) -> None:
        """Send SIGINT to the running process without killing the session."""
        if self._process and self._process.isalive():
            try:
                self._process.kill(signal.SIGINT)
            except Exception:
                pass
        self.status = "idle"
        self._capturing = False
        await self._response_queue.put(None)

    async def kill(self) -> None:
        if self._process and self._process.isalive():
            self._process.terminate(force=True)
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
            self._reader_task = None
        self.status = "stopped"

    async def restart(self) -> None:
        await self.kill()
        self._ready.clear()
        self._response_queue = asyncio.Queue()
        self._capturing = False
        await asyncio.sleep(0.5)
        await self.start()
