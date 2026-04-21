"""
Tests for CLIAgent base class.
Written before implementation (TDD).
"""
import asyncio
import re
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call
import pytest

from backend.agents.base import CLIAgent, _strip_ansi


# ---------------------------------------------------------------------------
# Concrete subclass for testing the abstract base
# ---------------------------------------------------------------------------

class _TestAgent(CLIAgent):
    @property
    def name(self) -> str:
        return f"test-{self.slot_id}"

    @property
    def cmd(self) -> list[str]:
        return ["echo", "hello"]

    @property
    def prompt_pattern(self) -> re.Pattern[str]:
        return re.compile(r"READY$")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def workdir(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture
def agent(workdir: Path) -> _TestAgent:
    return _TestAgent(slot_id=0, workdir=workdir)


def _make_mock_process(output_chunks: list[bytes], *, alive: bool = True) -> MagicMock:
    """Return a fake PtyProcess that yields output_chunks then raises EOFError."""
    proc = MagicMock()
    proc.isalive.return_value = alive

    chunks = iter(output_chunks + [EOFError("eof")])

    def _read(_size: int) -> bytes:
        val = next(chunks)
        if isinstance(val, Exception):
            raise val
        return val

    proc.read.side_effect = _read
    return proc


# ---------------------------------------------------------------------------
# _strip_ansi helper
# ---------------------------------------------------------------------------

def test_strip_ansi_removes_escape_sequences():
    assert _strip_ansi("\x1b[32mhello\x1b[0m") == "hello"


def test_strip_ansi_leaves_plain_text():
    assert _strip_ansi("plain text") == "plain text"


# ---------------------------------------------------------------------------
# Initialisation
# ---------------------------------------------------------------------------

def test_initial_status_is_stopped(agent: _TestAgent):
    assert agent.status == "stopped"


def test_initial_slot_id(agent: _TestAgent):
    assert agent.slot_id == 0


# ---------------------------------------------------------------------------
# start()
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_start_spawns_ptyprocess(agent: _TestAgent, workdir: Path):
    ready_output = [b"startup...\r\nREADY"]

    with patch("backend.agents.base.ptyprocess.PtyProcess.spawn") as mock_spawn:
        mock_proc = _make_mock_process(ready_output)
        mock_spawn.return_value = mock_proc

        await agent.start()

    mock_spawn.assert_called_once_with(
        agent.cmd,
        cwd=str(workdir),
        dimensions=(50, 220),
    )
    assert agent.status == "idle"


@pytest.mark.asyncio
async def test_start_sets_status_idle(agent: _TestAgent):
    with patch("backend.agents.base.ptyprocess.PtyProcess.spawn") as mock_spawn:
        mock_spawn.return_value = _make_mock_process([b"READY"])
        await agent.start()

    assert agent.status == "idle"


@pytest.mark.asyncio
async def test_start_raises_if_no_prompt_within_timeout(agent: _TestAgent):
    """start() raises RuntimeError if prompt never appears."""
    with patch("backend.agents.base.ptyprocess.PtyProcess.spawn") as mock_spawn:
        mock_proc = MagicMock()
        mock_proc.isalive.return_value = True
        mock_proc.read.return_value = b"no prompt here"
        mock_spawn.return_value = mock_proc

        with pytest.raises(RuntimeError, match="did not become ready"):
            await agent.start(ready_timeout=0.3)


# ---------------------------------------------------------------------------
# send()
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_writes_prompt_to_pty(agent: _TestAgent):
    with patch("backend.agents.base.ptyprocess.PtyProcess.spawn") as mock_spawn:
        mock_proc = _make_mock_process([b"READY"])
        mock_spawn.return_value = mock_proc
        await agent.start()

        mock_proc.write.reset_mock()
        await agent.send("hello agent")

    mock_proc.write.assert_called_once_with(b"hello agent\n")


@pytest.mark.asyncio
async def test_send_sets_status_busy(agent: _TestAgent):
    with patch("backend.agents.base.ptyprocess.PtyProcess.spawn") as mock_spawn:
        mock_proc = _make_mock_process([b"READY"])
        mock_spawn.return_value = mock_proc
        await agent.start()

        await agent.send("test")

    assert agent.status == "busy"


@pytest.mark.asyncio
async def test_send_raises_when_not_started(agent: _TestAgent):
    with pytest.raises(RuntimeError, match="not running"):
        await agent.send("hello")


@pytest.mark.asyncio
async def test_send_raises_when_busy(agent: _TestAgent):
    with patch("backend.agents.base.ptyprocess.PtyProcess.spawn") as mock_spawn:
        mock_proc = _make_mock_process([b"READY"])
        mock_spawn.return_value = mock_proc
        await agent.start()
        agent.status = "busy"  # simulate already busy

        with pytest.raises(RuntimeError, match="busy"):
            await agent.send("another")


# ---------------------------------------------------------------------------
# stream_output()
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_stream_output_yields_queued_chunks(agent: _TestAgent):
    agent.status = "busy"
    await agent._response_queue.put("chunk one ")
    await agent._response_queue.put("chunk two")
    await agent._response_queue.put(None)  # sentinel

    chunks = []
    async for chunk in agent.stream_output():
        chunks.append(chunk)

    assert chunks == ["chunk one ", "chunk two"]


@pytest.mark.asyncio
async def test_stream_output_sets_status_idle_on_sentinel(agent: _TestAgent):
    agent.status = "busy"
    await agent._response_queue.put("data")
    await agent._response_queue.put(None)

    async for _ in agent.stream_output():
        pass

    assert agent.status == "idle"


@pytest.mark.asyncio
async def test_stream_output_stops_at_timeout(agent: _TestAgent):
    """stream_output returns after idle_timeout seconds with no new chunks."""
    agent.status = "busy"
    await agent._response_queue.put("first")

    chunks = []
    async for chunk in agent.stream_output(idle_timeout=0.3):
        chunks.append(chunk)

    assert chunks == ["first"]
    assert agent.status == "idle"


# ---------------------------------------------------------------------------
# is_generating()
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_is_generating_true_when_busy(agent: _TestAgent):
    agent.status = "busy"
    assert await agent.is_generating() is True


@pytest.mark.asyncio
async def test_is_generating_false_when_idle(agent: _TestAgent):
    agent.status = "idle"
    assert await agent.is_generating() is False


# ---------------------------------------------------------------------------
# kill()
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_kill_terminates_process(agent: _TestAgent):
    with patch("backend.agents.base.ptyprocess.PtyProcess.spawn") as mock_spawn:
        mock_proc = _make_mock_process([b"READY"])
        mock_spawn.return_value = mock_proc
        await agent.start()

        await agent.kill()

    mock_proc.terminate.assert_called_once()
    assert agent.status == "stopped"


@pytest.mark.asyncio
async def test_kill_is_safe_when_not_started(agent: _TestAgent):
    await agent.kill()  # should not raise
    assert agent.status == "stopped"
