# AgentForge UI Migration — Overview

> Source design: `AgerntForge-handoff.zip` / `AgentForge Prototype.html`
> Target: `frontend/src/`
> Date: April 2026

---

## What the Design Introduces

The prototype replaces the current wide sidebar with a two-panel left nav:

1. **Icon Rail** (56px) — leftmost strip, SVG icons only, tooltips on hover, logo at top, settings at bottom
2. **Thread List** (260px) — conversation list grouped by project, search bar, "+ New" button, collapsible

Below the nav, a **top Agent Status Bar** replaces the current TopBar — it shows every agent slot (name, status dot, status badge, active task) in a single strip.

A **Context Panel** (280px, right side) is available in chat view — toggled by a "Context" button in the chat header. It shows current project, injected memory, agent list, and quick-action slash commands.

A new **Home Screen** is added as the default landing view — centered prompt bar, suggestion chips, and a 2-column dashboard showing recent projects and active tasks.

All screen-level views (Projects, Agents, Tasks/Kanban, Schedule, Memory, Settings) get visual refreshes matching the design.

---

## What Does NOT Change

- **Tailwind config** — already matches the design exactly (`#0d1117`, `#161b22`, etc.)
- **index.css** — already matches (scrollbar styles, `.agent-output`, `.streaming-cursor`, `@keyframes`)
- **Zustand store** — already has `activeView`, `setActiveView`, `poolSlots`, `systemMessages` — just needs minor additions
- **Backend / API / WebSocket** — zero changes
- **ChatPanel logic** — all command handling stays intact, visual wrapper changes only
- **ProjectsView, MemoryBrowser, AgentDashboard, TaskQueue** — internals stay, get visual polish pass

---

## Migration Scope

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| 1 | Icon Rail component | `layout/IconRail.tsx` (new) | Small |
| 2 | Thread List component | `layout/ThreadList.tsx` (new) | Small |
| 3 | Agent Status Bar | `layout/AgentStatusBar.tsx` (new) | Small |
| 4 | Context Panel | `chat/ContextPanel.tsx` (new) | Small |
| 5 | Layout rewire | `layout/Layout.tsx` | Small |
| 6 | Home Screen | `home/HomeScreen.tsx` (new) | Medium |
| 7 | Chat Screen visual update | `chat/ChatPanel.tsx`, `chat/MessageList.tsx` | Small |
| 8 | App.tsx — add Home route | `App.tsx` | Tiny |
| 9 | Screen polish pass | Projects, Agents, Tasks, Schedule, Memory, Settings | Medium |

**Build order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**

Tasks 1–5 are the structural skeleton. Do them together as one Claude Code session.
Tasks 6–8 are the content layer. One session.
Task 9 is a polish pass. One session per screen or batch all at once.

---

## Check-In Criteria (after tasks 1–5)

The app should render with:
- 56px icon rail on the far left with ⬡ logo, 7 nav icons, settings icon at bottom
- 260px thread list to the right of the rail with grouped threads and search bar
- Agent status bar strip under those two panels, spanning full width of main area
- Chat screen still works — messages, input, streaming all functional
- No regressions in Projects, Tasks, Agents, Memory

---

## Design Token Reference

All tokens already in `tailwind.config.ts`. Use these class names, not raw hex:

| Token | Class | Value |
|-------|-------|-------|
| App background | `bg-background` | `#0d1117` |
| Surface / card | `bg-card` or `bg-sidebar` | `#161b22` |
| Border | `border-border` | `#30363d` |
| Border subtle | `border-[#21262d]` | `#21262d` |
| Text | `text-foreground` | `#e6edf3` |
| Text muted | `text-muted-foreground` | `#8b949e` |
| Text dim | `text-[#484f58]` | `#484f58` |
| Accent green | `text-primary` / `bg-primary` | `#238636` |
| Accent blue | `text-accent` / `bg-accent` | `#1f6feb` |
| Status active | `text-status-active` | `#3fb950` |
| Status busy | `text-status-busy` | `#d29922` |
| Status error | `text-status-error` | `#f85149` |
| Status idle | `text-status-idle` | `#8b949e` |
| Mono font | `font-mono` | JetBrains Mono |

---

## Files in This Docs Folder

```
docs/ui-migration/
├── 00-overview.md          ← this file
├── 01-layout-shell.md      ← Tasks 1–5: Icon Rail, Thread List, Status Bar, Context Panel, Layout
├── 02-home-and-chat.md     ← Tasks 6–8: Home Screen, Chat visual update, App.tsx
└── 03-screen-polish.md     ← Task 9: per-screen visual polish pass
```

Hand each numbered doc to a separate Claude Code session in order.
