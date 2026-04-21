"""
Tests for AgentPool.
Written before implementation (TDD).
"""
import asyncio
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock


def make_mock_agent(name: str = "claude-0"):
    agent = MagicMock()
    agent.name = name
    agent.status = "idle"
    agent.start = AsyncMock()
    agent.kill = AsyncMock()
    return agent


def sequential_factory(agents: list):
    """Returns a factory that hands out agents from a list in order."""
    it = iter(agents)

    def factory(slot_id: int, workdir: Path):
        return next(it)

    return factory


@pytest.fixture
def pool(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    return AgentPool(
        agent_factory=sequential_factory([agent]),
        workdir=tmp_path,
        broadcaster=None,
        idle_timeout=300,
    )


@pytest.mark.asyncio
async def test_pool_starts_empty(pool):
    assert pool.status() == []


@pytest.mark.asyncio
async def test_acquire_spawns_new_slot(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    pool = AgentPool(sequential_factory([agent]), workdir=tmp_path)
    slot = await pool.acquire()
    assert slot.slot_id == "claude-0"
    agent.start.assert_called_once()


@pytest.mark.asyncio
async def test_acquire_marks_slot_busy(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    pool = AgentPool(sequential_factory([agent]), workdir=tmp_path)
    slot = await pool.acquire(task_id="t1", task_title="My task")
    assert slot.status == "busy"
    assert slot.current_task_id == "t1"
    assert slot.current_task_title == "My task"


@pytest.mark.asyncio
async def test_release_marks_slot_idle(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    pool = AgentPool(sequential_factory([agent]), workdir=tmp_path, idle_timeout=300)
    slot = await pool.acquire()
    await pool.release(slot)
    assert slot.status == "idle"
    assert slot.current_task_id is None
    assert slot.idle_since is not None
    slot.cancel_idle_timer()


@pytest.mark.asyncio
async def test_acquire_reuses_idle_slot(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    pool = AgentPool(sequential_factory([agent]), workdir=tmp_path, idle_timeout=300)
    slot1 = await pool.acquire()
    await pool.release(slot1)
    slot1.cancel_idle_timer()

    slot2 = await pool.acquire()
    assert slot2 is slot1
    agent.start.assert_called_once()  # only spawned once, reused on second acquire


@pytest.mark.asyncio
async def test_pool_status_includes_all_active_slots(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    pool = AgentPool(sequential_factory([agent]), workdir=tmp_path)
    await pool.acquire()
    statuses = pool.status()
    assert len(statuses) == 1
    assert statuses[0].slot_id == "claude-0"
    assert statuses[0].status == "busy"


@pytest.mark.asyncio
async def test_shutdown_all_kills_all_agents(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    pool = AgentPool(sequential_factory([agent]), workdir=tmp_path)
    await pool.acquire()
    await pool.shutdown_all()
    agent.kill.assert_called_once()
    assert pool.status() == []


@pytest.mark.asyncio
async def test_idle_timer_expires_slot(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    pool = AgentPool(sequential_factory([agent]), workdir=tmp_path, idle_timeout=0)
    slot = await pool.acquire()
    await pool.release(slot)
    # Let the event loop run the timer
    await asyncio.sleep(0.05)
    assert pool.status() == []
    agent.kill.assert_called_once()


@pytest.mark.asyncio
async def test_mark_error_removes_slot(tmp_path):
    from backend.pool.agent_pool import AgentPool

    agent = make_mock_agent("claude-0")
    pool = AgentPool(sequential_factory([agent]), workdir=tmp_path)
    slot = await pool.acquire()
    await pool.mark_error(slot)
    assert pool.status() == []
