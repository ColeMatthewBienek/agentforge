import logging
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class ExecutorTier(str, Enum):
    QWEN   = "qwen"    # local Ollama qwen3-coder:30b — fast, free, boilerplate
    HAIKU  = "haiku"   # claude-haiku — moderate tasks, cheap, fast
    SONNET = "sonnet"  # claude-sonnet — standard coding tasks
    OPUS   = "opus"    # claude-opus — hardest problems, architecture, security


@dataclass
class RoutingDecision:
    tier: ExecutorTier
    model_name: str
    reason: str


TIER_MODELS = {
    ExecutorTier.QWEN:   "qwen3.6:27b",
    ExecutorTier.HAIKU:  "claude-haiku-4-5-20251001",
    ExecutorTier.SONNET: "claude-sonnet-4-6",
    ExecutorTier.OPUS:   "claude-opus-4-7",
}

COMPLEXITY_DEFAULT_TIER = {
    "low":    ExecutorTier.QWEN,
    "medium": ExecutorTier.HAIKU,
    "high":   ExecutorTier.SONNET,
}

SONNET_KEYWORDS = [
    "architect", "design pattern", "security", "authentication", "refactor",
    "multi-file", "database schema", "api design", "performance", "concurrency",
]
OPUS_KEYWORDS = [
    "critical", "security vulnerability", "cryptograph", "novel", "complex algorithm",
    "production incident", "data migration",
]


class IntelliRouter:
    """Per-task routing: which model tier executes this task."""

    def route(self, task) -> RoutingDecision:
        """
        Priority:
        1. Explicit executor_tier hint from EM/decomposer
        2. Keyword analysis (upgrades only)
        3. Complexity default
        """
        complexity = getattr(task, "complexity", "medium").lower()
        base_tier = COMPLEXITY_DEFAULT_TIER.get(complexity, ExecutorTier.SONNET)

        em_hint = getattr(task, "executor_tier", None)
        if em_hint:
            try:
                base_tier = ExecutorTier(em_hint)
            except ValueError:
                pass

        combined = (task.prompt + " " + task.title).lower()
        final_tier = base_tier
        upgrade_reason = ""

        if any(kw in combined for kw in OPUS_KEYWORDS):
            if final_tier != ExecutorTier.OPUS:
                upgrade_reason = "opus keyword signal"
                final_tier = ExecutorTier.OPUS
        elif any(kw in combined for kw in SONNET_KEYWORDS):
            if final_tier in (ExecutorTier.QWEN, ExecutorTier.HAIKU):
                upgrade_reason = "sonnet keyword signal"
                final_tier = ExecutorTier.SONNET

        reason = f"complexity={complexity}, hint={em_hint}"
        if upgrade_reason:
            reason += f", upgraded: {upgrade_reason}"

        logger.info("IntelliRouter: task '%s' → %s (%s)", task.id, final_tier.value, reason)

        return RoutingDecision(tier=final_tier, model_name=TIER_MODELS[final_tier], reason=reason)

    def route_all(self, tasks: list) -> dict[str, RoutingDecision]:
        return {t.id: self.route(t) for t in tasks}
