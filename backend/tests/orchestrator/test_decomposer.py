"""
Tests for Decomposer.
"""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_pool(oneshot_return: str = "", raise_exc: Exception | None = None):
    agent = MagicMock()
    if raise_exc:
        agent.run_oneshot = AsyncMock(side_effect=raise_exc)
    else:
        agent.run_oneshot = AsyncMock(return_value=oneshot_return)
    slot = MagicMock()
    slot.agent = agent
    pool = MagicMock()
    pool.acquire = AsyncMock(return_value=slot)
    pool.release = AsyncMock()
    return pool, slot, agent


def _valid_json(n: int = 2) -> str:
    tasks = [
        {
            "id": f"task-{i + 1}",
            "title": f"Task {i + 1}",
            "prompt": f"Do thing {i + 1}",
            "dependencies": [] if i == 0 else [f"task-{i}"],
            "complexity": "medium",
        }
        for i in range(n)
    ]
    return json.dumps(tasks)


# ── existing tests updated for tuple return ────────────────────────────────────

@pytest.mark.asyncio
async def test_decompose_returns_task_list():
    pool, _, _ = _make_pool(oneshot_return=_valid_json(3))
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    tasks, err = await d.decompose("build an API", "/tmp/repo", "plan-1")
    assert len(tasks) == 3
    assert tasks[0].id == "task-1"
    assert tasks[1].dependencies == ["task-1"]


@pytest.mark.asyncio
async def test_decompose_fallback_on_parse_failure():
    pool, _, _ = _make_pool(oneshot_return="this is not json at all")
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    tasks, err = await d.decompose("build something", "/tmp", "plan-2")
    assert len(tasks) == 1
    assert tasks[0].prompt == "build something"


@pytest.mark.asyncio
async def test_decompose_fallback_on_timeout():
    pool, _, _ = _make_pool(raise_exc=asyncio.TimeoutError())
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    tasks, err = await d.decompose("build something", "/tmp", "plan-3")
    assert len(tasks) == 1
    pool.release.assert_awaited_once()


@pytest.mark.asyncio
async def test_decompose_max_8_tasks():
    pool, _, _ = _make_pool(oneshot_return=_valid_json(12))
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    tasks, err = await d.decompose("huge project", "/tmp", "plan-4")
    assert len(tasks) <= 8


@pytest.mark.asyncio
async def test_decompose_embeds_summary_to_plan_session():
    pool, _, _ = _make_pool(oneshot_return=_valid_json(2))
    memory_manager = MagicMock()
    memory_manager.on_message = AsyncMock()
    memory_manager.build_context = AsyncMock(return_value="enriched direction")
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool, memory_manager=memory_manager)
    await d.decompose("build it", "/tmp", "plan-5", chat_session_id="chat-1")
    memory_manager.on_message.assert_awaited_once()
    call = memory_manager.on_message.call_args
    assert call.kwargs["session_id"] == "plan-5"


@pytest.mark.asyncio
async def test_decompose_slot_always_released_on_failure():
    pool, _, _ = _make_pool(raise_exc=RuntimeError("agent crashed"))
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    tasks, err = await d.decompose("x", "/tmp", "plan-6")
    assert len(tasks) == 1
    pool.release.assert_awaited_once()


# ── new tests for tuple-return contract ───────────────────────────────────────

@pytest.mark.asyncio
async def test_decompose_returns_tuple_on_success():
    pool, _, _ = _make_pool(oneshot_return=_valid_json(2))
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    result = await d.decompose("do x", "/tmp", "plan-7")
    assert isinstance(result, tuple) and len(result) == 2
    tasks, err = result
    assert len(tasks) == 2
    assert err is None


@pytest.mark.asyncio
async def test_decompose_returns_tuple_on_parse_failure():
    pool, _, _ = _make_pool(oneshot_return="not json")
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    tasks, err = await d.decompose("do y", "/tmp", "plan-8")
    assert len(tasks) == 1  # fallback
    assert err is not None
    assert isinstance(err, str) and len(err) > 0


@pytest.mark.asyncio
async def test_decompose_returns_tuple_on_timeout():
    pool, _, _ = _make_pool(raise_exc=asyncio.TimeoutError())
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    tasks, err = await d.decompose("do z", "/tmp", "plan-9")
    assert len(tasks) == 1
    assert err is not None
    assert "timed out" in err.lower() or "timeout" in err.lower()


@pytest.mark.asyncio
async def test_decompose_returns_tuple_on_empty_response():
    pool, _, _ = _make_pool(oneshot_return="")
    from backend.orchestrator.decomposer import Decomposer
    d = Decomposer(pool=pool)
    tasks, err = await d.decompose("do w", "/tmp", "plan-10")
    assert len(tasks) == 1
    assert err is not None
    assert "empty" in err.lower()


@pytest.mark.asyncio
async def test_parse_returns_none_error_on_valid_json():
    from backend.orchestrator.decomposer import Decomposer, TaskSpec
    pool = MagicMock()
    d = Decomposer(pool=pool)
    tasks, err = d._parse(_valid_json(2), "direction")
    assert len(tasks) == 2
    assert err is None


@pytest.mark.asyncio
async def test_parse_returns_error_on_bad_json():
    from backend.orchestrator.decomposer import Decomposer
    pool = MagicMock()
    d = Decomposer(pool=pool)
    tasks, err = d._parse("{ bad json }", "direction")
    assert len(tasks) == 1  # fallback
    assert err is not None
    assert "json" in err.lower()


@pytest.mark.asyncio
async def test_parse_returns_error_on_empty_string():
    from backend.orchestrator.decomposer import Decomposer
    pool = MagicMock()
    d = Decomposer(pool=pool)
    tasks, err = d._parse("", "direction")
    assert len(tasks) == 1
    assert err is not None
    assert "empty" in err.lower()


@pytest.mark.asyncio
async def test_parse_returns_error_on_non_array_json():
    from backend.orchestrator.decomposer import Decomposer
    pool = MagicMock()
    d = Decomposer(pool=pool)
    tasks, err = d._parse('{"key": "value"}', "direction")
    assert len(tasks) == 1
    assert err is not None
    assert "array" in err.lower() or "list" in err.lower()
