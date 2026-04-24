# UI Migration — Part 1: Layout Shell

> Tasks 1–5: Icon Rail, Thread List, Agent Status Bar, Context Panel, Layout rewire
> Hand this entire doc to one Claude Code session.
> Read `docs/ui-migration/00-overview.md` first for context.

---

## What You Are Building

Replace the current 224px emoji-icon sidebar with a two-panel left nav matching the
prototype design, add an agent status bar across the top of the main area, and add
a collapsible context panel on the right side of the chat view.

**Current layout:**
```
[Sidebar 224px] [TopBar h-12] [Main content]
```

**New layout:**
```
[IconRail 56px] [ThreadList 260px] [AgentStatusBar h-9] [Main content] [ContextPanel 280px if open]
```

No backend changes. No store changes (the store already has everything needed).

---

## Task 1: IconRail Component

Create `frontend/src/components/layout/IconRail.tsx`

**Spec:**
- Width: `w-14` (56px), full height, `bg-background`, right border `border-r border-border`
- `flex flex-col items-center py-3 gap-0.5 flex-shrink-0`
- Logo at top: 34×34px div, `rounded-[10px]`, `bg-gradient-to-br from-primary to-[#1a6b2b]`, shows `⬡` in white 16px bold. Clicking navigates to `'home'`
- 7 nav icons (see icon list below): 38×38px each, `rounded-lg`, `cursor-pointer`
  - Active: `bg-secondary text-foreground`
  - Inactive: `text-[#484f58] hover:text-muted-foreground hover:bg-secondary/50`
  - Transition: `transition-all duration-150`
- `<div className="flex-1" />` spacer between nav icons and settings
- Settings icon at bottom, same 38×38 style

**Nav items (id → SVG):**

```tsx
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'chat', label: 'Chat', icon: <ChatIcon /> },
  { id: 'projects', label: 'Projects', icon: <FolderIcon /> },
  { id: 'agents', label: 'Agents', icon: <AgentsIcon /> },
  { id: 'tasks', label: 'Tasks', icon: <TasksIcon /> },
  { id: 'schedule', label: 'Schedule', icon: <ClockIcon /> },
  { id: 'memory', label: 'Memory', icon: <MemoryIcon /> },
];
```

**SVG icons** — all `width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"`:

```tsx
// Home
<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
<polyline points="9 22 9 12 15 12 15 22"/>

// Chat
<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>

// Folder/Projects
<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>

// Agents
<rect x="4" y="4" width="16" height="16" rx="2"/>
<circle cx="9" cy="10" r="1.5"/>
<circle cx="15" cy="10" r="1.5"/>
<path d="M9 15h6"/>

// Tasks
<path d="M9 11l3 3L22 4"/>
<path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>

// Schedule/Clock
<circle cx="12" cy="12" r="10"/>
<polyline points="12 6 12 12 16 14"/>

// Memory
<path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z"/>
<circle cx="12" cy="9" r="2.5"/>

// Settings (bottom)
<circle cx="12" cy="12" r="3"/>
<path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
```

**Props:**
```tsx
interface IconRailProps {
  active: string;
  onNavigate: (id: string) => void;
  poolSlots: PoolSlot[];  // from agentStore — used for streaming glow on logo (optional v1: skip)
}
```

**Tooltip:** Use native HTML `title` attribute on each icon wrapper div for now. No custom tooltip component needed.

---

## Task 2: ThreadList Component

Create `frontend/src/components/layout/ThreadList.tsx`

This is a static-data component in v1 — it shows threads from the store but clicking just navigates to chat. Full thread persistence is a future feature.

**Spec:**
- Width: `w-[260px]`, full height, `bg-background`, right border `border-r border-[#21262d]`
- `flex flex-col flex-shrink-0 overflow-hidden`
- If `collapsed` prop is true, render null

**Header:**
```tsx
<div className="px-3.5 py-3.5 flex items-center justify-between">
  <span className="text-xs font-semibold text-foreground tracking-wide">Threads</span>
  <button onClick={onNew} className="w-6 h-6 rounded-md border border-border bg-transparent text-muted-foreground flex items-center justify-center cursor-pointer text-sm hover:text-foreground transition-colors">+</button>
</div>
```

**Search bar:**
```tsx
<div className="px-2.5 pb-2">
  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-[#21262d] bg-card text-xs text-[#484f58]">
    <SearchIcon size={12} />
    <span>Search threads...</span>
  </div>
</div>
```

**Thread list:**
- Group threads by `project` field (or 'General' if none)
- Group header: `text-[10px] font-semibold text-[#484f58] uppercase tracking-widest px-2 py-2`
- Thread button: full width, `flex flex-col gap-0.5 px-2.5 py-2 rounded-md cursor-pointer border-l-2 transition-all duration-100`
  - Active: `bg-card border-l-primary`
  - Inactive: `bg-transparent border-l-transparent hover:bg-secondary/30`
- Thread title: `text-[13px]` — active: `text-foreground font-medium`, inactive: `text-muted-foreground`
- Thread meta row: `text-[11px] text-[#484f58]` — agent name · time
- Unread dot: `w-1.5 h-1.5 rounded-full bg-primary`

**Thread data — use hardcoded seed data in v1.** Pull from a const in the file. Do not wire to backend yet.

```tsx
const SEED_THREADS = [
  { id: 't1', title: 'AgentForge UI redesign', agent: 'claude-0', time: '2m ago', project: 'AgentForge', unread: false },
  { id: 't2', title: 'Fix WSL2 path translation', agent: 'claude-0', time: '1h ago', project: 'AgentForge', unread: true },
  { id: 't3', title: 'Memory search performance', agent: 'codex-0', time: '3h ago', project: 'AgentForge', unread: false },
  { id: 't4', title: 'Auth refactor planning', agent: 'claude-0', time: '1d ago', project: 'PepChat', unread: false },
];
```

**Props:**
```tsx
interface ThreadListProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  collapsed?: boolean;
}
```

---

## Task 3: AgentStatusBar Component

Create `frontend/src/components/layout/AgentStatusBar.tsx`

This replaces the current `TopBar`. It reads `poolSlots` from the store.

**Spec:**
- Height: `h-9` (36px), `border-b border-[#21262d]`, `bg-background`
- `flex items-center px-4 gap-3 text-[11px] flex-shrink-0`

**Left section:**
```tsx
<span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">Agents</span>
<div className="w-px h-3.5 bg-[#21262d]" />
```

**Per agent slot** (map over `poolSlots`):
```tsx
<div className="flex items-center gap-1.5 cursor-pointer">
  {/* Status dot */}
  <div className={cn(
    "w-1.5 h-1.5 rounded-full",
    slot.status === 'busy' || slot.status === 'starting' ? "bg-status-busy" :
    slot.status === 'idle' ? "bg-status-idle" :
    slot.status === 'error' ? "bg-status-error" :
    slot.status === 'stopping' ? "bg-[#484f58]" :
    "bg-status-active"  // default: active/streaming glow
  )} style={isActive ? { boxShadow: '0 0 6px #3fb95060' } : undefined} />
  {/* Name */}
  <span className="font-mono text-[11px] text-muted-foreground">{slot.slot_id}</span>
  {/* Status badge */}
  <span className={cn(
    "text-[10px] px-1.5 rounded border",
    // border and color match status
  )}>{slot.status}</span>
  {/* Task (if busy) */}
  {slot.current_task_title && (
    <span className="text-[10px] text-[#484f58] max-w-[140px] truncate">— {slot.current_task_title}</span>
  )}
</div>
```

**Status badge colors:**
```
idle:     border-status-idle/30     text-status-idle     bg-status-idle/5
busy:     border-status-busy/30     text-status-busy     bg-status-busy/5
starting: border-status-busy/30     text-status-busy     bg-status-busy/5
error:    border-status-error/30    text-status-error    bg-status-error/5
stopping: border-[#484f58]/30      text-[#484f58]       bg-transparent
default:  border-status-active/30  text-status-active   bg-status-active/5
```

**Right section (flex-1 spacer then):**
```tsx
<div className="flex-1" />
<span className="text-[10px] text-[#484f58]">
  {poolSlots.filter(s => s.status !== 'stopping').length}/{poolSlots.length} online
</span>
```

**Fallback when poolSlots is empty:**
Show a single dim text: `<span className="text-[10px] text-[#484f58]">No agents running</span>`

**Props:**
```tsx
interface AgentStatusBarProps {
  poolSlots: PoolSlot[];
}
```
Read `poolSlots` from `useAgentStore` inside the component — no prop drilling needed.

---

## Task 4: ContextPanel Component

Create `frontend/src/components/chat/ContextPanel.tsx`

Collapsible right panel, visible only in chat view.

**Spec:**
- Width: `w-[280px]`, full height, `bg-background`, left border `border-l border-[#21262d]`
- `flex flex-col flex-shrink-0 overflow-hidden`
- If `visible` is false, render null

**Header:**
```tsx
<div className="px-3.5 py-3 border-b border-[#21262d] flex items-center justify-between">
  <span className="text-xs font-semibold text-foreground">Context</span>
  <button onClick={onClose} className="text-[#484f58] hover:text-muted-foreground text-base leading-none">×</button>
</div>
```

**Scrollable body:** `flex-1 overflow-y-auto`

**Section: Project** (if `activeProjectId` in store has a loaded project — v1: show placeholder or skip if no project active)
```
[10px uppercase label: PROJECT]
[Card: project name, path · branch, status badge, task count badge]
```
Card: `p-2.5 rounded-lg border border-[#21262d] bg-card`

**Section: Injected Memory** (show `recentMemories` from store, max 5)
```
[10px uppercase label: INJECTED MEMORY]
[Per memory: brain-pin icon + content text + source label]
```
Per memory row: `flex items-start gap-2 px-2 py-1.5 rounded-md bg-card border border-[#21262d]`
Icon: memory pin SVG in `text-accent` (blue)
Content: `text-[11px] text-muted-foreground leading-relaxed`
Source: `text-[10px] text-[#30363d]`

**Section: Agents** (show `poolSlots` from store)
```
[10px uppercase label: AGENTS]
[Per slot: status dot + slot_id + status right-aligned]
```

**Section: Quick Actions**
```
[10px uppercase label: QUICK ACTIONS]
[4 command chips: /plan  /build  /recall  /remember]
```
Chip: `px-2 py-1.5 rounded text-[11px] font-mono text-muted-foreground bg-card border border-[#21262d] cursor-pointer hover:text-foreground transition-colors`

**Props:**
```tsx
interface ContextPanelProps {
  visible: boolean;
  onClose: () => void;
}
```
Read `recentMemories`, `poolSlots`, `activeProjectId` from `useAgentStore` inside the component.

---

## Task 5: Layout Rewire

Replace `frontend/src/components/layout/Layout.tsx` and `frontend/src/components/layout/Sidebar.tsx`.

**Delete:** `Sidebar.tsx` and `TopBar.tsx` are replaced entirely. Keep the files but gut them — `Sidebar.tsx` can re-export `IconRail` as a compatibility shim if anything imports it, or just update all imports.

**New `Layout.tsx`:**

```tsx
import { type ReactNode, useState } from "react";
import { Toaster } from "sonner";
import { IconRail } from "./IconRail";
import { ThreadList } from "./ThreadList";
import { AgentStatusBar } from "./AgentStatusBar";
import { ContextPanel } from "@/components/chat/ContextPanel";
import { useInbox } from "@/hooks/useInbox";
import { useAgentStore } from "@/store/agentStore";

interface LayoutProps {
  activeView: string;
  onNavigate: (view: string) => void;
  children: (view: string) => ReactNode;
}

export function Layout({ activeView, onNavigate, children }: LayoutProps) {
  useInbox();
  const [contextVisible, setContextVisible] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>('t1');

  const handleSelectThread = (id: string) => {
    setActiveThreadId(id);
    onNavigate('chat');
  };

  const handleNewThread = () => {
    setActiveThreadId(null);
    onNavigate('chat');
    useAgentStore.getState().clearMessages();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Left: Icon Rail */}
      <IconRail active={activeView} onNavigate={onNavigate} />

      {/* Left: Thread List */}
      <ThreadList
        activeId={activeView === 'chat' ? activeThreadId : null}
        onSelect={handleSelectThread}
        onNew={handleNewThread}
      />

      {/* Right: main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Agent Status Bar */}
        <AgentStatusBar />

        {/* Content + optional context panel */}
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-hidden">
            {/* Inject contextVisible toggle into chat view */}
            {children(activeView)}
          </main>

          {/* Context Panel — chat view only */}
          {activeView === 'chat' && (
            <ContextPanel
              visible={contextVisible}
              onClose={() => setContextVisible(false)}
            />
          )}
        </div>
      </div>

      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{ style: { fontFamily: 'monospace', fontSize: '12px' } }}
      />
    </div>
  );
}
```

**Context toggle:** The "Context" button lives inside `ChatPanel`'s header. It needs to toggle the panel. Pass `onToggleContext` via store or a simple callback prop.

**Cleanest approach:** Add to the store:
```ts
// In agentStore.ts — add:
contextPanelVisible: boolean;
toggleContextPanel: () => void;
```
Then `ChatPanel` calls `toggleContextPanel()` and `Layout` reads `contextPanelVisible`.

**Update `ChatPanel.tsx` header** to add the Context button:
```tsx
<button
  onClick={() => useAgentStore.getState().toggleContextPanel()}
  className={cn(
    "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors",
    contextPanelVisible
      ? "bg-secondary border-border text-muted-foreground"
      : "bg-transparent border-[#21262d] text-[#484f58] hover:text-muted-foreground"
  )}
>
  <ContextIcon size={12} />
  Context
</button>
```

**Chat header full spec:**
```
[Left: thread title | agent badge (claude-0, green border)]
[Right: Context button | New Session button]
```
Height: `h-11`, `border-b border-[#21262d]`, `px-4`, `flex items-center justify-between flex-shrink-0`

---

## Check-In After Task 5

Before proceeding to Part 2, verify:

1. App loads with icon rail (56px) + thread list (260px) on the left
2. All 7 nav items navigate correctly (home shows placeholder for now)
3. Thread list shows 4 seed threads grouped under AgentForge / PepChat
4. Clicking a thread navigates to chat view
5. Agent status bar shows slots from the pool (or "No agents running" if none)
6. Chat view shows Context button in header — clicking shows/hides the panel
7. Context panel shows recentMemories and poolSlots from store
8. All existing chat functionality (send, stream, commands) still works
9. All existing views (Projects, Tasks, Agents, Memory) still render
10. No TypeScript errors

**Regression test:** Send a message in chat, verify streaming still works and system messages (inbox) still appear.
