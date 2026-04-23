"""
Tests for WorkdirManager.
Written before implementation (TDD).
"""
import asyncio
import subprocess
from pathlib import Path

import pytest


def init_git_repo(path: Path) -> None:
    """Create a minimal git repo with one commit so worktrees can be added."""
    subprocess.run(["git", "init", str(path)], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(path), "config", "user.email", "test@test.com"], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(path), "config", "user.name", "Test"], check=True, capture_output=True)
    (path / "README.md").write_text("init")
    subprocess.run(["git", "-C", str(path), "add", "."], check=True, capture_output=True)
    subprocess.run(["git", "-C", str(path), "commit", "-m", "init"], check=True, capture_output=True)


@pytest.fixture
def git_repo(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    init_git_repo(repo)
    return repo


@pytest.fixture
def workspace(tmp_path):
    ws = tmp_path / "workspaces"
    ws.mkdir()
    return ws


@pytest.mark.asyncio
async def test_worktree_creates_branch(git_repo, workspace):
    """create() in a git repo adds a worktree and a new branch."""
    from backend.pool.workdir import WorkdirManager

    mgr = WorkdirManager(workspace_root=workspace)
    result = await mgr.create(task_id="task-1", base_dir=str(git_repo))

    assert result.is_dir()
    # git worktree list should include the new path
    out = subprocess.run(
        ["git", "-C", str(git_repo), "worktree", "list", "--porcelain"],
        capture_output=True, text=True, check=True,
    )
    assert str(result) in out.stdout


@pytest.mark.asyncio
async def test_worktree_cleanup_removes_branch(git_repo, workspace):
    """cleanup() removes the worktree and the associated branch."""
    from backend.pool.workdir import WorkdirManager

    mgr = WorkdirManager(workspace_root=workspace)
    worktree_path = await mgr.create(task_id="task-2", base_dir=str(git_repo))
    assert worktree_path.is_dir()

    await mgr.cleanup(task_id="task-2", base_dir=str(git_repo))

    # worktree directory gone
    assert not worktree_path.exists()
    # branch gone
    out = subprocess.run(
        ["git", "-C", str(git_repo), "branch"],
        capture_output=True, text=True, check=True,
    )
    assert "task-2" not in out.stdout


@pytest.mark.asyncio
async def test_worktree_fallback_non_git_dir(tmp_path, workspace):
    """create() on a non-git directory falls back to returning the base_dir as-is."""
    from backend.pool.workdir import WorkdirManager

    plain_dir = tmp_path / "plain"
    plain_dir.mkdir()

    mgr = WorkdirManager(workspace_root=workspace)
    result = await mgr.create(task_id="task-3", base_dir=str(plain_dir))

    assert result == plain_dir


@pytest.mark.asyncio
async def test_cleanup_is_noop_on_non_git_dir(tmp_path, workspace):
    """cleanup() on a non-git directory does not raise."""
    from backend.pool.workdir import WorkdirManager

    plain_dir = tmp_path / "plain"
    plain_dir.mkdir()

    mgr = WorkdirManager(workspace_root=workspace)
    # Should not raise even though no worktree was ever created
    await mgr.cleanup(task_id="task-4", base_dir=str(plain_dir))


@pytest.mark.asyncio
async def test_resolve_returns_base_dir_when_not_parallel(git_repo, workspace):
    """resolve() with parallel=False returns the base_dir unchanged."""
    from backend.pool.workdir import WorkdirManager

    mgr = WorkdirManager(workspace_root=workspace)
    result = await mgr.resolve(task_id="task-5", base_dir=str(git_repo), parallel=False)
    assert result == git_repo


@pytest.mark.asyncio
async def test_resolve_creates_worktree_when_parallel(git_repo, workspace):
    """resolve() with parallel=True creates a new worktree."""
    from backend.pool.workdir import WorkdirManager

    mgr = WorkdirManager(workspace_root=workspace)
    result = await mgr.resolve(task_id="task-6", base_dir=str(git_repo), parallel=True)

    assert result != git_repo
    assert result.is_dir()
    # cleanup so tmp_path doesn't complain
    await mgr.cleanup(task_id="task-6", base_dir=str(git_repo))
