import asyncio
import signal
import pytest
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch


def make_claude_agent():
    from backend.agents.claude_agent import ClaudeAgent
    return ClaudeAgent(slot_id=0, workdir=Path("/tmp"))


# ── ClaudeAgent.interrupt() ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_interrupt_sends_sigint_to_subprocess():
    agent = make_claude_agent()
    proc = MagicMock()
    proc.returncode = None
    agent._process = proc

    await agent.interrupt()

    proc.send_signal.assert_called_once_with(signal.SIGINT)


@pytest.mark.asyncio
async def test_interrupt_sets_status_idle():
    agent = make_claude_agent()
    proc = MagicMock()
    proc.returncode = None
    agent._process = proc
    agent.status = "busy"

    await agent.interrupt()

    assert agent.status == "idle"


@pytest.mark.asyncio
async def test_interrupt_puts_none_sentinel_in_queue():
    agent = make_claude_agent()
    proc = MagicMock()
    proc.returncode = None
    agent._process = proc

    await agent.interrupt()

    sentinel = agent._response_queue.get_nowait()
    assert sentinel is None


@pytest.mark.asyncio
async def test_interrupt_noop_when_process_already_exited():
    agent = make_claude_agent()
    proc = MagicMock()
    proc.returncode = 0  # already exited
    agent._process = proc

    await agent.interrupt()  # must not raise

    proc.send_signal.assert_not_called()


@pytest.mark.asyncio
async def test_interrupt_noop_when_no_process():
    agent = make_claude_agent()
    # _process is None by default

    await agent.interrupt()  # must not raise

    assert agent._response_queue.qsize() == 1  # still puts sentinel


@pytest.mark.asyncio
async def test_interrupt_tolerates_process_lookup_error():
    agent = make_claude_agent()
    proc = MagicMock()
    proc.returncode = None
    proc.send_signal.side_effect = ProcessLookupError
    agent._process = proc

    await agent.interrupt()  # must not raise


@pytest.mark.asyncio
async def test_interrupt_unblocks_stream_output():
    """stream_output must return promptly after interrupt() is called."""
    agent = make_claude_agent()
    agent._capturing = True
    agent.status = "busy"

    async def do_interrupt():
        await asyncio.sleep(0.05)
        await agent.interrupt()

    asyncio.create_task(do_interrupt())

    chunks = []
    async for chunk in agent.stream_output(idle_timeout=5.0):
        chunks.append(chunk)

    # stream returned — it was unblocked by the None sentinel
    assert agent.status == "idle"


# ── CLIAgent base.interrupt() — ptyprocess path ───────────────────────────────

def test_base_interrupt_kills_ptyprocess():
    """base.interrupt() calls proc.kill(SIGINT) on a ptyprocess."""
    from backend.agents.base import CLIAgent

    # Build a minimal concrete subclass to test the base method directly
    class _Stub(CLIAgent):
        @property
        def name(self): return "stub"
        @property
        def cmd(self): return ["echo"]
        @property
        def prompt_pattern(self):
            import re
            return re.compile(r">")

    agent = _Stub(slot_id=0, workdir=Path("/tmp"))
    proc = MagicMock()
    proc.isalive.return_value = True
    agent._process = proc

    async def _run():
        await agent.interrupt()

    asyncio.run(_run())

    proc.kill.assert_called_once_with(signal.SIGINT)
