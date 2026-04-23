import asyncio
import logging
from pathlib import Path

from backend.config import AGENTFORGE_WORKSPACES

logger = logging.getLogger(__name__)


async def _run(cmd: list[str], cwd: str | None = None) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode(), stderr.decode()


async def _is_git_repo(path: str) -> bool:
    rc, _, _ = await _run(["git", "rev-parse", "--is-inside-work-tree"], cwd=path)
    return rc == 0


class WorkdirManager:
    def __init__(self, workspace_root: Path | None = None) -> None:
        self._workspace_root = workspace_root or AGENTFORGE_WORKSPACES
        self._workspace_root.mkdir(parents=True, exist_ok=True)
        # task_id -> worktree path
        self._worktrees: dict[str, Path] = {}

    async def resolve(self, task_id: str, base_dir: str, parallel: bool) -> Path:
        if not parallel:
            return Path(base_dir)
        return await self.create(task_id, base_dir)

    async def create(self, task_id: str, base_dir: str) -> Path:
        if not await _is_git_repo(base_dir):
            return Path(base_dir)

        branch = f"agentforge/{task_id}"
        worktree_path = self._workspace_root / task_id

        rc, _, err = await _run(
            ["git", "worktree", "add", "-b", branch, str(worktree_path)],
            cwd=base_dir,
        )
        if rc != 0:
            logger.warning("git worktree add failed (%s): %s — falling back to base_dir", rc, err.strip())
            return Path(base_dir)

        self._worktrees[task_id] = worktree_path
        logger.info("Created worktree %s for task %s", worktree_path, task_id)
        return worktree_path

    async def cleanup(self, task_id: str, base_dir: str) -> None:
        worktree_path = self._worktrees.pop(task_id, None)
        if worktree_path is None or not worktree_path.exists():
            return

        if not await _is_git_repo(base_dir):
            return

        rc, _, err = await _run(
            ["git", "worktree", "remove", "--force", str(worktree_path)],
            cwd=base_dir,
        )
        if rc != 0:
            logger.warning("git worktree remove failed: %s", err.strip())

        branch = f"agentforge/{task_id}"
        rc2, _, err2 = await _run(["git", "branch", "-D", branch], cwd=base_dir)
        if rc2 != 0:
            logger.warning("git branch -D failed: %s", err2.strip())
        else:
            logger.info("Removed worktree and branch %s for task %s", branch, task_id)

    async def list_active(self) -> list[dict]:
        return [
            {"task_id": tid, "path": str(p)}
            for tid, p in self._worktrees.items()
            if p.exists()
        ]
