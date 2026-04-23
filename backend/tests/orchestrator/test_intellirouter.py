"""
Tests for IntelliRouter.
Written before implementation (TDD).
"""
import pytest
from backend.orchestrator.decomposer import TaskSpec


def _task(id="t1", complexity="medium", executor_tier=None, title="task", prompt="do it"):
    t = TaskSpec(id=id, title=title, prompt=prompt, dependencies=[], complexity=complexity)
    if executor_tier:
        t.executor_tier = executor_tier
    return t


def test_low_complexity_routes_to_qwen():
    from backend.orchestrator.intellirouter import IntelliRouter, ExecutorTier
    r = IntelliRouter()
    decision = r.route(_task(complexity="low"))
    assert decision.tier == ExecutorTier.QWEN


def test_medium_complexity_routes_to_haiku():
    from backend.orchestrator.intellirouter import IntelliRouter, ExecutorTier
    r = IntelliRouter()
    decision = r.route(_task(complexity="medium"))
    assert decision.tier == ExecutorTier.HAIKU


def test_high_complexity_routes_to_sonnet():
    from backend.orchestrator.intellirouter import IntelliRouter, ExecutorTier
    r = IntelliRouter()
    decision = r.route(_task(complexity="high"))
    assert decision.tier == ExecutorTier.SONNET


def test_explicit_tier_overrides_complexity():
    from backend.orchestrator.intellirouter import IntelliRouter, ExecutorTier
    r = IntelliRouter()
    t = _task(complexity="low", executor_tier="sonnet")
    decision = r.route(t)
    assert decision.tier == ExecutorTier.SONNET


def test_keyword_upgrades_to_sonnet():
    from backend.orchestrator.intellirouter import IntelliRouter, ExecutorTier
    r = IntelliRouter()
    t = _task(complexity="low", prompt="refactor the authentication module")
    decision = r.route(t)
    assert decision.tier == ExecutorTier.SONNET


def test_keyword_upgrades_to_opus():
    from backend.orchestrator.intellirouter import IntelliRouter, ExecutorTier
    r = IntelliRouter()
    t = _task(complexity="medium", prompt="fix critical security vulnerability in auth")
    decision = r.route(t)
    assert decision.tier == ExecutorTier.OPUS


def test_keywords_never_downgrade():
    from backend.orchestrator.intellirouter import IntelliRouter, ExecutorTier
    r = IntelliRouter()
    t = _task(complexity="high", executor_tier="opus", prompt="simple config file change")
    decision = r.route(t)
    assert decision.tier == ExecutorTier.OPUS


def test_route_all_returns_dict():
    from backend.orchestrator.intellirouter import IntelliRouter
    r = IntelliRouter()
    tasks = [_task("t1", "low"), _task("t2", "high")]
    decisions = r.route_all(tasks)
    assert set(decisions.keys()) == {"t1", "t2"}


def test_decision_includes_model_name():
    from backend.orchestrator.intellirouter import IntelliRouter, TIER_MODELS, ExecutorTier
    r = IntelliRouter()
    decision = r.route(_task(complexity="low"))
    assert decision.model_name == TIER_MODELS[ExecutorTier.QWEN]
