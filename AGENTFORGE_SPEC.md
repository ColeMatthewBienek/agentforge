# AgentForge — Project Specification
> Hand this document to Claude Code as the initial build brief.
> Version: 1.0 | Status: Planning Complete

---

## 1. Project Overview

**AgentForge** is a local desktop application that provides a clean control plane for running, orchestrating, scheduling, and managing Claude Code and OpenAI Codex CLI agents. It is built for a single power user running everything locally on their own machine.

The UI aesthetic is GitHub/GitLab — dark sidebar, clean content panels, monospace output, status badges, minimal chrome.

---

## 2. Core Goals (MVP Priority Order)

1. **Chat interface** — Direct conversational interface with a running Claude Code or Codex agent, with real-time streaming output
2. **Memory system** — Persistent semantic + structured memory that survives across sessions and is injected into agent context automatically
3. **Single agent running** — Reliable PTY-based subprocess management for `claude` and `codex` CLIs
4. **Scheduling** — Async job scheduling (cron, interval, one-shot) with persistence
5. **Multi-agent orchestration** — LangGraph-based planner routing tasks to agent pool (post-MVP)

---

## 3. Technology Stack

### Desktop Shell
- **Tauri v2** (Rust shell)
- Launches FastAPI backend as a sidecar process on app start
- Communicates with backend via local HTTP + WebSocket
- React renderer using system WebView2 (Windows)

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** — utility-first styling
- **shadcn/ui** — component library (dark theme, GitHub-like palette)
- **Zustand** — client state management
- **TanStack Query** — server state / data fetching
- Custom WebSocket hook for streaming agent output

### Backend
- **Python 3.12+**
- **FastAPI** — async HTTP API + WebSocket server
- **uvicorn** — ASGI server

### Orchestration
- **LangGraph** — graph-based multi-agent orchestration
- Planner node (Claude Opus) routes tasks to appropriate agent type
- Supports sequential, parallel, and conditional workflows

### Memory
- **LanceDB** — embedded vector DB, no server required, fast local semantic search
- **SQLite** (via `aiosqlite`) — structured persistence for tasks, sessions, schedules, logs
- Custom memory manager: auto-injects relevant context before each agent invocation, auto-saves learnings after completion

### Scheduling
- **APScheduler 4.x** (AsyncIOScheduler) — cron, interval, date-based jobs
- All jobs persisted to SQLite — survive app restarts
- Jobs are just task definitions that get dispatched to the agent pool on trigger

### Agent Runners
- **`ptyprocess`** (Python) — PTY subprocess management
- Each agent slot is a persistent PTY session wrapping `claude` or `codex`
- Output streamed in real-time over WebSocket to frontend
- Agents stay alive between tasks (no cold start per task)

### Workspace Isolation
- **Git worktrees** — each agent task gets its own isolated branch/worktree
- Worktree manager handles creation, assignment, cleanup
- Tasks can also specify an existing project directory or a shared workspace

---

## 4. Directory Structure

```
agentforge/
├── src-tauri/                        # Tauri v2 Rust shell
│   ├── src/
│   │   └── main.rs                   # App entry, sidecar launch, window config
│   ├── capabilities/
│   └── tauri.conf.json
│
├── frontend/                         # React app (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx       # Left nav — GitHub style
│   │   │   │   ├── TopBar.tsx        # Breadcrumb + agent status
│   │   │   │   └── Layout.tsx
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.tsx     # Main chat interface
│   │   │   │   ├── MessageList.tsx   # Streaming message display
│   │   │   │   ├── InputBar.tsx      # Prompt input + send
│   │   │   │   └── AgentSelector.tsx # Pick claude / codex
│   │   │   ├── agents/
│   │   │   │   ├── AgentDashboard.tsx # All running agent slots
│   │   │   │   └── AgentCard.tsx      # Single agent status card
│   │   │   ├── tasks/
│   │   │   │   ├── TaskQueue.tsx      # Task list + creation
│   │   │   │   └── TaskDetail.tsx     # Single task view + logs
│   │   │   ├── schedule/
│   │   │   │   ├── ScheduleManager.tsx
│   │   │   │   └── JobForm.tsx
│   │   │   └── memory/
│   │   │       ├── MemoryBrowser.tsx  # Search + inspect memory
│   │   │       └── MemoryCard.tsx
│   │   ├── hooks/
│   │   │   ├── useAgentStream.ts     # WebSocket streaming hook
│   │   │   ├── useTasks.ts
│   │   │   └── useMemory.ts
│   │   ├── store/
│   │   │   └── agentStore.ts         # Zustand global state
│   │   ├── lib/
│   │   │   └── api.ts                # HTTP client (TanStack Query)
│   │   └── App.tsx
│   ├── index.html
│   └── vite.config.ts
│
├── backend/                          # FastAPI Python app
│   ├── agents/
│   │   ├── base.py                   # CLIAgent PTY base class
│   │   ├── claude_agent.py           # Claude Code CLI runner
│   │   └── codex_agent.py            # Codex CLI runner
│   ├── pool/
│   │   ├── agent_pool.py             # Slot management + async locking
│   │   └── workdir.py                # Workspace / worktree allocation
│   ├── orchestrator/
│   │   ├── graph.py                  # LangGraph planner + routing graph
│   │   ├── nodes.py                  # Individual graph node definitions
│   │   └── state.py                  # LangGraph shared state schema
│   ├── memory/
│   │   ├── memory_manager.py         # Context injection + post-task save
│   │   ├── lance_store.py            # LanceDB vector operations
│   │   └── sqlite_store.py           # Structured task/session storage
│   ├── scheduler/
│   │   ├── scheduler.py              # APScheduler setup + job dispatch
│   │   └── jobs.py                   # Job definitions
│   ├── api/
│   │   ├── agents.py                 # Agent pool endpoints
│   │   ├── tasks.py                  # Task CRUD endpoints
│   │   ├── memory.py                 # Memory search/browse endpoints
│   │   ├── schedule.py               # Schedule management endpoints
│   │   └── ws.py                     # WebSocket streaming endpoint
│   ├── config.py                     # App config, paths, constants
│   └── main.py                       # FastAPI app + router registration
│
└── data/                             # Local persistent data (gitignored)
    ├── agentforge.db                 # SQLite database
    ├── lancedb/                      # LanceDB vector store
    └── workspaces/                   # Agent workspaces + worktrees
```

---

## 5. Agent Runner — PTY Architecture

### Base Class (`backend/agents/base.py`)

```python
class CLIAgent:
    """
    Wraps a CLI process (claude or codex) in a PTY.
    Stays alive between tasks. Streams output via async generator.
    """
    name: str
    cmd: list[str]          # e.g. ["claude"] or ["codex"]
    workdir: Path
    slot_id: int
    status: Literal["idle", "busy", "error", "stopped"]

    async def start(self) -> None: ...
    async def send(self, prompt: str) -> None: ...
    async def stream_output(self) -> AsyncIterator[str]: ...
    async def is_generating(self) -> bool: ...
    async def kill(self) -> None: ...
    async def restart(self) -> None: ...
```

### Agent Pool (`backend/pool/agent_pool.py`)

- Maintains named slots: `claude-0`, `claude-1`, `codex-0`, etc.
- Slots start with one of each; new slots spawn on demand
- `acquire(agent_type)` — returns first free slot, waits if all busy
- `release(agent)` — marks slot as idle
- Background health monitor: pings each slot every 30s, restarts crashed processes
- Emits `AGENT_STATUS` WebSocket events on state changes

### Workspace Manager (`backend/pool/workdir.py`)

```python
class WorkdirManager:
    def resolve(self, task: Task) -> Path:
        if task.workdir:
            return Path(task.workdir)           # Existing project dir
        elif task.isolated:
            return self._create_worktree(task)  # New git worktree
        else:
            return SHARED_WORKSPACE             # Shared dir
    
    def _create_worktree(self, task: Task) -> Path:
        # git worktree add .agentforge/workspaces/{task.id} -b agent/{task.id}
        ...
    
    def cleanup(self, task_id: str) -> None:
        # git worktree remove + branch delete after task completion
        ...
```

---

## 6. Memory System

### Two-tier architecture:

**Tier 1 — Semantic (LanceDB)**
- Stores agent observations, learned facts, user preferences, project context
- Each memory record: `{id, content, agent, project, tags, embedding, created_at}`
- Search: cosine similarity on query embedding
- Auto-populated after each completed task

**Tier 2 — Structured (SQLite)**
- Tasks: `{id, title, type, status, agent_type, workdir, created_at, completed_at, output}`
- Sessions: `{id, agent_slot, task_id, started_at, message_count, token_estimate}`
- Jobs: `{id, name, trigger_type, trigger_config, task_template, last_run, next_run, enabled}`
- Logs: `{id, session_id, role, content, timestamp}`

### Memory Manager (`backend/memory/memory_manager.py`)

```python
class MemoryManager:
    async def inject_context(self, prompt: str, agent: str, project: str) -> str:
        """
        Before sending a prompt to an agent:
        1. Search LanceDB for semantically relevant memories
        2. Fetch recent task history from SQLite
        3. Prepend context block to prompt
        Returns enriched prompt.
        """

    async def save_learnings(self, session_id: str) -> None:
        """
        After task completion:
        1. Summarize session output (via Claude API call or heuristic)
        2. Extract key facts, decisions, errors, outcomes
        3. Store as memory records in LanceDB
        """
```

---

## 7. Orchestration — LangGraph

### Graph Structure (`backend/orchestrator/graph.py`)

```
START
  └── planner_node          # Analyzes task, decides routing
        ├── claude_node     # Routes to Claude Code agent pool
        ├── codex_node      # Routes to Codex agent pool  
        └── parallel_node   # Spawns multiple agents for subtasks
              ├── agent_1
              └── agent_2
                    └── reviewer_node   # Optional QA/review step
                          └── END
```

### Planner Node
- Uses Claude (via subprocess or direct API call for planning only) to decompose the task
- Outputs: `{agent_type, subtasks[], parallel: bool, needs_review: bool}`
- For MVP: planner is simple rule-based routing (coding task → codex, everything else → claude)
- Post-MVP: LLM-powered planner

### State Schema (`backend/orchestrator/state.py`)
```python
class AgentState(TypedDict):
    task_id: str
    original_prompt: str
    enriched_prompt: str        # After memory injection
    agent_type: str
    subtasks: list[dict]
    outputs: list[str]
    status: str
    error: str | None
```

---

## 8. Scheduling

### APScheduler Setup (`backend/scheduler/scheduler.py`)
- `AsyncIOScheduler` with `SQLAlchemyJobStore` pointing to `agentforge.db`
- Jobs persist across restarts
- Three trigger types:
  - `cron` — standard cron expression (e.g. `0 2 * * *` for 2am daily)
  - `interval` — every N minutes/hours
  - `date` — one-shot at a specific datetime
- On trigger: creates a Task record in SQLite, dispatches to agent pool via orchestrator

### Job Definition
```python
{
  "name": "Nightly code review",
  "trigger": "cron",
  "trigger_config": {"hour": 2, "minute": 0},
  "task_template": {
    "prompt": "Review all changes since last run and summarize issues",
    "agent_type": "claude",
    "workdir": "/path/to/project",
    "isolated": false
  }
}
```

---

## 9. API Endpoints

### WebSocket
- `ws://localhost:8765/ws/stream/{session_id}` — Real-time agent output stream
- Events: `{type: "chunk", content: "..."}` | `{type: "done"}` | `{type: "error", message: "..."}`
- Also broadcasts: `AGENT_STATUS`, `TASK_UPDATE`, `JOB_FIRED`

### HTTP REST
```
POST   /api/tasks              Create and dispatch a task
GET    /api/tasks              List tasks (paginated, filterable)
GET    /api/tasks/{id}         Task detail + full log
DELETE /api/tasks/{id}         Cancel running task

GET    /api/agents             All agent slots + status
POST   /api/agents/spawn       Add a new agent slot
DELETE /api/agents/{slot_id}   Kill a slot

GET    /api/memory/search?q=   Semantic memory search
GET    /api/memory             Browse all memories (paginated)
DELETE /api/memory/{id}        Delete a memory record

GET    /api/schedule           List all jobs
POST   /api/schedule           Create a new job
PUT    /api/schedule/{id}      Update a job
DELETE /api/schedule/{id}      Delete a job
POST   /api/schedule/{id}/run  Trigger a job immediately
```

---

## 10. UI — Key Screens

### GitHub/GitLab Design Language
- Background: `#0d1117` (GitHub dark)
- Sidebar: `#161b22`
- Border: `#30363d`
- Accent: `#238636` (green) / `#1f6feb` (blue)
- Text: `#e6edf3`
- Monospace font for all agent output: `JetBrains Mono` or `Fira Code`
- Status badges: pill-shaped, color-coded (green=active, yellow=busy, red=error, gray=idle)

### Sidebar Navigation
```
⬡ AgentForge
─────────────
💬 Chat
📋 Tasks
🤖 Agents
⏰ Schedule
🧠 Memory
─────────────
⚙ Settings
```

### Chat Panel
- Agent selector dropdown (claude / codex + slot)
- Message thread — user messages right-aligned, agent output left with monospace streaming
- Input bar at bottom — multiline, Shift+Enter for newline, Enter to send
- Token/context usage indicator
- "New Session" button to clear context

### Agent Dashboard
- Grid of agent slot cards
- Each card: name, status badge, current task title, uptime, last active
- Expandable to show live streaming output

### Task Queue
- Table view: title, agent, status, created, duration
- Filterable by status, agent type, date
- Click row → Task Detail with full streamed log

### Schedule Manager
- Calendar + list view of upcoming jobs
- Create job form: name, trigger type, cron/interval config, task template
- Job history with last N runs + outcomes

### Memory Browser
- Search bar → semantic results with similarity score
- Timeline view of recent memories
- Tag filtering
- Click memory → full content + source session link

---

## 11. Tauri + WSL2 Architecture

The FastAPI backend runs **natively inside WSL2 Ubuntu**, not as a Windows sidecar. This is the primary architecture — not a fallback. It gives us a proper Linux PTY environment for driving `claude` and `codex` CLIs with zero Windows compatibility issues.

### How it works

Tauri (Windows) launches WSL2 as a subprocess on startup:

```rust
// src-tauri/src/main.rs
fn launch_backend() {
    std::process::Command::new("wsl")
        .args([
            "-d", "Ubuntu",
            "--",
            "/bin/bash", "-c",
            "cd ~/agentforge && source .venv/bin/activate && uvicorn backend.main:app --host 127.0.0.1 --port 8765"
        ])
        .spawn()
        .expect("Failed to launch WSL2 backend");
}
```

WSL2 exposes `localhost:8765` to Windows transparently — this is built into WSL2's networking. Tauri's frontend connects to `http://localhost:8765` and `ws://localhost:8765/ws` exactly as if the backend were native Windows.

On app close, Tauri sends a shutdown signal to the backend via `POST /api/shutdown` before killing the WSL2 process.

### WSL2 Setup Requirements

The following must be present in the WSL2 Ubuntu environment before first run:

```bash
# Python environment
python3.12 -m venv ~/agentforge/.venv
source ~/agentforge/.venv/bin/activate
pip install -r backend/requirements.txt

# CLIs must be installed and authenticated in WSL2
claude   # Anthropic Claude Code CLI
codex    # OpenAI Codex CLI

# Git configured for worktree support
git config --global user.email "you@example.com"
git config --global user.name "AgentForge"
```

A `scripts/setup-wsl.sh` script will handle this automatically on first run.

### Port Configuration

Backend port defaults to `8765`. Configurable in `backend/config.py`. On startup, Tauri checks if the port is already bound (handles case where WSL2 backend is already running) and skips relaunch if so.

### Path Translation

WSL2 paths (`/home/user/...`) and Windows paths (`C:\Users\...`) need translation when the user picks a project directory from the Tauri file picker (which returns Windows paths).

```python
# backend/config.py
def win_to_wsl(path: str) -> str:
    # C:\Users\Cole\project → /mnt/c/Users/Cole/project
    drive, rest = path[0].lower(), path[2:].replace("\\", "/")
    return f"/mnt/{drive}{rest}"
```

Tauri passes Windows paths to the backend; backend translates them before use.

---

## 12. Build Phases

### Phase 1 — MVP (Weeks 1–3)
**Goal: One agent running, chat works, memory persists**

- [ ] Tauri v2 app scaffold with React + Tailwind + shadcn/ui
- [ ] FastAPI backend as Tauri sidecar
- [ ] `CLIAgent` PTY base class + `ClaudeAgent` implementation
- [ ] Single agent slot, no pool yet
- [ ] WebSocket streaming: backend PTY output → frontend chat
- [ ] Chat panel UI with real-time streaming display
- [ ] SQLite schema: tasks, sessions, logs
- [ ] LanceDB setup + basic memory manager (inject + save)
- [ ] GitHub dark theme applied across all base components

### Phase 2 — Scheduling + Pool (Weeks 4–5)
**Goal: Multiple agents, async jobs**

- [ ] `CodexAgent` implementation
- [ ] `AgentPool` with slot management + async locking
- [ ] `WorkdirManager` with git worktree support
- [ ] APScheduler + SQLite job store
- [ ] Schedule Manager UI
- [ ] Agent Dashboard UI
- [ ] Task Queue UI

### Phase 3 — Orchestration (Weeks 6–7)
**Goal: LangGraph planner routing tasks**

- [ ] LangGraph graph setup
- [ ] Rule-based planner node (MVP routing logic)
- [ ] Parallel task execution
- [ ] Reviewer node (optional QA step)
- [ ] Task dependency visualization in UI

### Phase 4 — Polish (Week 8)
**Goal: Production-quality feel**

- [ ] Memory Browser UI
- [ ] Health monitoring + auto-restart for crashed agents
- [ ] Selector health checks (detect if CLI interface changed)
- [ ] Settings panel (API keys, default agent, theme)
- [ ] Error handling + user-facing error states throughout

---

## 13. Key Constraints & Decisions

- **No Anthropic or OpenAI API billing** — agents run via `claude` and `codex` CLIs using existing subscriptions
- **100% local** — no cloud services, no telemetry, all data in `~/.agentforge/`
- **Single user** — no auth, no multi-tenancy
- **Tauri shell runs on Windows**, **FastAPI backend runs in WSL2 Ubuntu** — primary architecture, not a fallback
- All PTY subprocess management, CLI execution, and file I/O happens inside WSL2
- Windows ↔ WSL2 path translation handled by `backend/config.py`
- **Python 3.12+** for backend (in WSL2)
- **Node 20+** / **Rust stable** for Tauri/frontend
- PTY management happens in FastAPI backend, not Tauri Rust layer
- LanceDB is embedded — no separate vector DB server to manage
- SQLite is the only database — no Postgres, no Redis

---

## 14. Environment & Prerequisites

The target machine has:
- Windows 11, WSL2 Ubuntu
- AMD Ryzen 9800X3D, RTX 5090 (32GB VRAM), 64GB RAM
- `claude` CLI installed and authenticated
- `codex` CLI installed and authenticated
- Python 3.12+ available
- Node 20+ available
- Rust stable toolchain installed
- Git installed

---

## 15. First Task for Claude Code

**Start with Phase 1, Step 1:**

Scaffold the full project structure as defined in Section 4. Then implement:

0. `scripts/setup-wsl.sh` — installs Python deps, verifies `claude` and `codex` CLIs are present in WSL2, sets up git config

1. Tauri v2 app with React + Vite frontend connecting to a FastAPI sidecar
2. `CLIAgent` PTY base class in `backend/agents/base.py`
3. `ClaudeAgent` in `backend/agents/claude_agent.py`
4. WebSocket endpoint in `backend/api/ws.py` that streams PTY output
5. Basic Chat Panel UI (`frontend/src/components/chat/`) with real-time streaming
6. GitHub dark theme configured in Tailwind

Do NOT implement the agent pool, orchestration, or scheduling yet. Get one Claude Code agent streaming output to the chat UI first. Validate end-to-end before moving on.
