import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class CurationReport:
    run_at: str
    total_evaluated: int
    kept: int
    archived: int
    archived_previews: list[str]


class MemoryCurator:
    """
    Stub — full APScheduler integration not yet implemented.
    Trigger manually via POST /api/memory/curate.
    """

    def __init__(self, store, broadcaster):
        self._store = store
        self._broadcaster = broadcaster

    async def run(self) -> CurationReport:
        # TODO(cole): implement full curation logic with Claude Sonnet batched evaluation
        raise NotImplementedError("Curator not yet implemented — stub only")
