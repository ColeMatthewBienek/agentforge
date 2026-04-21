from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = Path.home() / ".agentforge"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "agentforge.db"
LANCEDB_DIR = DATA_DIR / "lancedb"
WORKSPACES_DIR = DATA_DIR / "workspaces"

BACKEND_HOST = "127.0.0.1"
BACKEND_PORT = 8765

AGENT_IDLE_TIMEOUT_SECONDS: int = 300
HEALTH_CHECK_INTERVAL_SECONDS: int = 30

SHARED_WORKSPACE = WORKSPACES_DIR / "shared"
SHARED_WORKSPACE.mkdir(parents=True, exist_ok=True)

AGENTFORGE_WORKSPACES = DATA_DIR / "workspaces"


def win_to_wsl(path: str) -> str:
    """Translate a Windows path (C:\\Users\\...) to a WSL2 path (/mnt/c/...)."""
    if not path or path[1:3] != ":\\":
        return path
    drive = path[0].lower()
    rest = path[2:].replace("\\", "/")
    return f"/mnt/{drive}{rest}"
