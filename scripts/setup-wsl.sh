#!/usr/bin/env bash
# AgentForge WSL2 setup script.
# Run once from inside WSL2: bash scripts/setup-wsl.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> AgentForge WSL2 Setup"
echo "    Project root: $PROJECT_ROOT"

# ── Python venv ────────────────────────────────────────────────────────────────
echo ""
echo "==> Setting up Python virtual environment..."

cd "$PROJECT_ROOT"

if ! command -v python3 &>/dev/null; then
  echo "ERROR: python3 not found. Install Python 3.12+ first."
  exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "    Python $PYTHON_VERSION"

if [ ! -d ".venv" ]; then
  # Try standard venv first
  if python3 -m venv .venv 2>/dev/null; then
    echo "    Created .venv"
  else
    echo "    Standard venv failed. Trying pip bootstrap..."
    # Install pip if missing, then use it to create venv via virtualenv
    curl -sS https://bootstrap.pypa.io/get-pip.py | python3 - --break-system-packages
    python3 -m pip install --break-system-packages virtualenv --quiet
    python3 -m virtualenv .venv
    echo "    Created .venv via virtualenv"
  fi
else
  echo "    .venv already exists, skipping creation"
fi

echo "==> Installing Python dependencies..."
# Use --break-system-packages if the system pip was used, otherwise use venv pip
if [ -f ".venv/bin/pip" ]; then
  .venv/bin/pip install -r backend/requirements.txt --quiet
  echo "    Installed via .venv/bin/pip"
else
  python3 -m pip install -r backend/requirements.txt --break-system-packages --quiet
  echo "    Installed via system pip"
fi

# ── CLI checks ─────────────────────────────────────────────────────────────────
echo ""
echo "==> Checking required CLIs..."

if command -v claude &>/dev/null; then
  echo "    ✓ claude found at $(command -v claude)"
else
  echo "    ✗ claude CLI not found."
  echo "      Install it: npm install -g @anthropic-ai/claude-code"
  echo "      Then authenticate: claude auth"
fi

if command -v codex &>/dev/null; then
  echo "    ✓ codex found at $(command -v codex)"
else
  echo "    ✗ codex CLI not found (optional for Phase 1)."
  echo "      Install it: npm install -g @openai/codex"
fi

# ── Git config ─────────────────────────────────────────────────────────────────
echo ""
echo "==> Checking git config..."

if ! git config --global user.email &>/dev/null; then
  git config --global user.email "agentforge@localhost"
  echo "    Set git user.email = agentforge@localhost"
else
  echo "    ✓ git user.email = $(git config --global user.email)"
fi

if ! git config --global user.name &>/dev/null; then
  git config --global user.name "AgentForge"
  echo "    Set git user.name = AgentForge"
else
  echo "    ✓ git user.name = $(git config --global user.name)"
fi

# ── Data dirs ──────────────────────────────────────────────────────────────────
echo ""
echo "==> Creating data directories..."
mkdir -p ~/.agentforge/{lancedb,workspaces/shared}
echo "    ✓ ~/.agentforge/"

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "==> Setup complete!"
echo ""
echo "    To start the backend manually:"
echo "      cd $PROJECT_ROOT"
if [ -f ".venv/bin/uvicorn" ]; then
  echo "      source .venv/bin/activate && uvicorn backend.main:app --host 127.0.0.1 --port 8765"
else
  echo "      uvicorn backend.main:app --host 127.0.0.1 --port 8765"
fi
echo ""
echo "    To launch the full app (from PowerShell in the project root):"
echo "      cargo tauri dev"
