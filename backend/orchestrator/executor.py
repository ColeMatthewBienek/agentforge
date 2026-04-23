import inspect
import logging
from typing import Callable, Awaitable

from backend.pool.agent_pool import AgentPool
from backend.pool.workdir import WorkdirManager

logger = logging.getLogger(__name__)

OnChunk = Callable[[str], None | Awaitable[None]]


class TaskExecutor:
    def __init__(self, pool: AgentPool, workdir_manager: WorkdirManager) -> None:
        self._pool = pool
        self._workdir_manager = workdir_manager

    async def run(
        self,
        task_id: str,
        prompt: str,
        base_dir: str,
        on_chunk: OnChunk,
        parallel: bool = True,
    ) -> None:
        workdir = await self._workdir_manager.resolve(task_id, base_dir, parallel)
        slot = await self._pool.acquire(task_id=task_id, task_title=prompt[:60])
        try:
            slot.agent.workdir = workdir
            await slot.agent.send(prompt)
            async for chunk in slot.agent.stream_output(idle_timeout=120.0):
                result = on_chunk(chunk)
                if inspect.isawaitable(result):
                    await result
        finally:
            await self._pool.release(slot)
            if parallel:
                await self._workdir_manager.cleanup(task_id, base_dir)
