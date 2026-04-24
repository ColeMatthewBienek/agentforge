# UI Migration — Part 3: Screen Polish Pass

> Task 9: Visual refresh for Projects, Agents, Tasks, Schedule, Memory, Settings
> Prerequisite: Parts 1 and 2 complete and checked in.
> Hand this entire doc to one Claude Code session.

---

## Overview

All existing screen components keep their data, logic, and API wiring. This pass
updates visual presentation to match the prototype. Work screen by screen.

**Reference design for all screens:** `AgentForge Prototype.html` → `components/screens.jsx`

---

## Screen 1: Projects (`ProjectsView.tsx`)

The existing `ProjectsView.tsx` is already well-built. Small adjustments only.

**Header:** Match exactly:
```tsx
<header className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between">
  <div>
    <h1 className="text-[14px] font-semibold text-foreground">Projects</h1>
    <p className="text-[11px] text-[#484f58] mt-0.5">{count} projects</p>
  </div>
  <div className="flex items-center gap-2">
    {/* Archive toggle — keep existing */}
    {/* New Project button */}
    <button className="px-3.5 py-1.5 text-[12px] rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors font-medium">
      + New Project
    </button>
  </div>
</header>
```

**Project row cards** — update to match prototype (keep all click/menu/modal logic):
```tsx
<div className="px-4 py-3 rounded-lg border border-[#21262d] bg-background hover:border-[#484f58] transition-colors cursor-pointer flex items-center gap-3.5">
  {/* Folder icon */}
  <div className="w-9 h-9 rounded-lg bg-card border border-[#21262d] flex items-center justify-center flex-shrink-0">
    <FolderIcon className="text-muted-foreground" size={16} />
  </div>
  {/* Content */}
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2">
      <span className="text-[13px] font-medium text-foreground">{p.name}</span>
      <StatusBadge status={p.status} />
    </div>
    {p.description && (
      <div className="text-[11px] text-[#484f58] mt-0.5 truncate">{p.description}</div>
    )}
  </div>
  <span className="text-[11px] text-[#484f58] flex-shrink-0">{timeAgo(p.updated_at)}</span>
</div>
```

**StatusBadge** — extract as a shared component used across screens:
```tsx
// frontend/src/components/shared/StatusBadge.tsx
const STATUS_STYLES = {
  planning:    'border-accent/40 text-accent',
  decomposing: 'border-status-busy/40 text-status-busy',
  em_review:   'border-status-busy/40 text-status-busy',
  executing:   'border-status-active/40 text-status-active bg-status-active/10',
  paused:      'border-border text-muted-foreground',
  complete:    'border-status-active/40 text-status-active',
  error:       'border-status-error/40 text-status-error',
  // agent statuses:
  idle:        'border-status-idle/40 text-status-idle',
  busy:        'border-status-busy/40 text-status-busy',
  streaming:   'border-status-active/40 text-status-active',
  stopped:     'border-[#484f58]/40 text-[#484f58]',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'text-[10px] font-mono px-1.5 py-0.5 rounded border',
      STATUS_STYLES[status] ?? 'border-border text-muted-foreground'
    )}>
      {status}
    </span>
  );
}
```

---

## Screen 2: Agents (`AgentDashboard.tsx`)

**Header:**
```tsx
<div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between">
  <div>
    <div className="text-[14px] font-semibold text-foreground">Agent Pool</div>
    <div className="text-[11px] text-[#484f58] mt-0.5">
      {activeCount} active, {totalCount} total
    </div>
  </div>
  <button className="px-3.5 py-1.5 rounded-md border border-border text-[#484f58] text-[12px] hover:text-muted-foreground transition-colors">
    + Spawn Agent
  </button>
</div>
```

**Agent cards grid:** `grid grid-cols-2 gap-3 p-4`

Per agent card:
```tsx
<div className={cn(
  "p-4 rounded-lg border border-[#21262d] bg-background",
  // Left colored border based on status
  slot.status === 'busy' || slot.status === 'starting' ? "border-l-[3px] border-l-status-busy" :
  slot.status === 'error' ? "border-l-[3px] border-l-status-error" :
  slot.status === 'stopping' ? "border-l-[3px] border-l-[#484f58]" :
  slot.status === 'idle' ? "border-l-[3px] border-l-status-idle" :
  "border-l-[3px] border-l-status-active"
)}>
  {/* Top row: name + badge + type */}
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <span className="font-mono text-[14px] font-semibold text-foreground">{slot.slot_id}</span>
      <StatusBadge status={slot.status} />
    </div>
    <span className="text-[11px] text-[#484f58]">Claude Code</span>
  </div>

  {/* Stats grid */}
  <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
    <div>
      <div className="text-[#484f58]">Uptime</div>
      <div className="text-muted-foreground font-mono mt-0.5">
        {slot.uptime_seconds ? formatUptime(slot.uptime_seconds) : '—'}
      </div>
    </div>
    <div>
      <div className="text-[#484f58]">Status</div>
      <div className="text-muted-foreground font-mono mt-0.5">{slot.status}</div>
    </div>
    <div className="col-span-2">
      <div className="text-[#484f58]">Task</div>
      <div className={cn("mt-0.5", slot.current_task_title ? "text-foreground" : "text-[#484f58]")}>
        {slot.current_task_title ?? 'No active task'}
      </div>
    </div>
  </div>

  {/* Actions — show if not stopped */}
  {slot.status !== 'stopping' && (
    <div className="flex gap-1.5 pt-2.5 border-t border-[#21262d]">
      <button className="px-2.5 py-1 rounded border border-[#21262d] text-[#484f58] text-[10px] hover:text-muted-foreground transition-colors">Restart</button>
      <button className="px-2.5 py-1 rounded border border-status-error/30 text-status-error text-[10px] hover:bg-status-error/10 transition-colors">Stop</button>
    </div>
  )}
</div>
```

**formatUptime helper:**
```ts
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
```

---

## Screen 3: Tasks / Kanban (`TaskQueue.tsx`)

**Header:**
```tsx
<div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
  <div className="text-[14px] font-semibold text-foreground">Task Queue</div>
  <button className="px-3.5 py-1.5 rounded-md border border-border text-[#484f58] text-[12px] hover:text-muted-foreground transition-colors">
    + New Task
  </button>
</div>
```

**Kanban board:** `flex gap-3 p-4 flex-1 overflow-x-auto` (horizontal scroll for columns)

**Column header:**
```tsx
<div className="flex items-center gap-2 mb-2.5 px-1">
  <div className={cn("w-2 h-2 rounded-full", columnColor)} />
  <span className="text-[12px] font-semibold text-foreground">{col.label}</span>
  <span className="text-[11px] text-[#484f58]">{col.tasks.length}</span>
</div>
```

**Column colors:**
- backlog: `bg-status-idle`
- in_progress / running: `bg-status-busy`
- review: `bg-accent`
- done / complete: `bg-status-active`
- error: `bg-status-error`

**Task card:**
```tsx
<div className="p-2.5 px-3 rounded-md border border-[#21262d] bg-background cursor-pointer hover:border-border transition-colors">
  <div className="text-[12px] text-foreground mb-2 leading-snug">{task.title}</div>
  <div className="flex items-center justify-between">
    <span className="text-[10px] font-mono text-[#484f58]">{task.slot_id ?? 'unassigned'}</span>
    <PriorityBadge complexity={task.complexity} />
  </div>
</div>
```

**PriorityBadge:**
```tsx
const PRIORITY_COLORS = {
  high:   'border-status-error/30 text-status-error',
  medium: 'border-status-busy/30 text-status-busy',
  low:    'border-status-idle/40 text-status-idle',
};
// text-[9px] px-1.5 py-0.5 rounded border
```

**"+ Add task"** row at bottom of each column:
```tsx
<div className="px-2 py-2 text-center text-[11px] text-[#484f58] cursor-pointer hover:text-muted-foreground transition-colors">
  + Add task
</div>
```

---

## Screen 4: Schedule (`ScheduleView.tsx` or placeholder)

The schedule screen currently shows a placeholder. Implement the basic table view from the design. Wire to actual backend schedule data if the `/api/schedule` endpoint exists; otherwise use static mock data clearly marked as mock.

**Header:** Same pattern as other screens — title "Scheduled Jobs", "+ New Job" button.

**Table:**
- `w-full text-[12px]` with `border-collapse`
- Header row: `text-[10px] uppercase tracking-widest text-[#484f58] font-semibold`
- Columns: (enabled dot) | Name | Trigger | Schedule | Agent | Last Run | Next Run | (Run Now button)
- Row: `border-b border-[#21262d]` — disabled rows: `opacity-50`
- Enabled dot: `w-2 h-2 rounded-full bg-status-active` or `bg-[#484f58]`
- Trigger badge: `text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#21262d] text-muted-foreground`
- Schedule cell: `font-mono text-muted-foreground`
- Run Now button: `px-2 py-1 rounded border border-status-active/30 text-status-active text-[10px] hover:bg-status-active/10 transition-colors`

---

## Screen 5: Memory (`MemoryBrowser.tsx`)

**Header:**
```tsx
<div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
  <div className="text-[14px] font-semibold text-foreground">Memory</div>
  <span className="text-[11px] text-[#484f58]">{count} records</span>
</div>
```

**Search bar:**
```tsx
<div className="px-5 py-3 border-b border-[#21262d]">
  <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card">
    <SearchIcon className="text-[#484f58]" size={14} />
    <input
      className="flex-1 bg-transparent text-[13px] text-[#484f58] placeholder:text-[#484f58] outline-none"
      placeholder="Semantic search across all memories..."
    />
  </div>
</div>
```

**Memory record cards:**
```tsx
<div className="px-4 py-3 rounded-lg border border-[#21262d] bg-background flex items-start gap-3">
  {/* Memory pin icon in type color */}
  <MemoryIcon className={typeColor[m.type]} size={14} style={{ marginTop: 2, flexShrink: 0 }} />
  <div className="flex-1">
    <div className="text-[13px] text-[#c9d1d9] leading-relaxed">{m.content}</div>
    <div className="flex items-center gap-2 mt-1.5 text-[10px]">
      <TypeBadge type={m.type} />
      <span className="text-[#484f58]">{m.source}</span>
      <span className="text-[#30363d]">·</span>
      <span className="text-[#484f58]">{timeAgo(m.created_at)}</span>
    </div>
  </div>
  {m.pinned && <span className="text-[13px]">📌</span>}
</div>
```

**Type badge colors:**
- fact: `border-accent/30 text-accent`
- preference: `border-status-busy/30 text-status-busy`
- config/other: `border-border text-muted-foreground`

---

## Screen 6: Settings

The existing Settings page works. Visual polish pass only.

**Layout:** `flex-1 overflow-auto px-8 py-6 max-w-[640px]`

**Page title:** `text-[14px] font-semibold text-foreground mb-6`

**Per section:**
- Section label: `text-[11px] uppercase tracking-widest text-[#484f58] font-semibold mb-3 pb-2 border-b border-[#21262d]`
- Items: `flex items-center justify-between py-2`
- Item label: `text-[13px] text-[#c9d1d9]`
- Value display / input: `px-2.5 py-1 rounded-md border border-[#21262d] bg-card text-[12px] text-muted-foreground`
- Toggle: existing toggle component, just ensure colors use design tokens

---

## Shared Components to Create

Create `frontend/src/components/shared/` folder with:

**`StatusBadge.tsx`** — already specced in Screen 1 above. Used everywhere.

**`SectionHeader.tsx`** — repeated pattern across all screens:
```tsx
export function SectionHeader({ title, count, action }: {
  title: string;
  count?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
      <div>
        <div className="text-[14px] font-semibold text-foreground">{title}</div>
        {count && <div className="text-[11px] text-[#484f58] mt-0.5">{count}</div>}
      </div>
      {action}
    </div>
  );
}
```

---

## Check-In After Task 9 (Final)

Full visual audit against the prototype:

1. Home Screen matches design — prompt bar, chips, 2-column dashboard
2. Chat screen matches — asymmetric user bubbles, flat agent text, correct streaming dots
3. Projects screen — folder icons, status badges, hover states
4. Agents screen — 2-col card grid, left-colored borders, stat grid, action buttons
5. Tasks/Kanban — column colors, task cards, priority badges
6. Schedule — table layout, trigger badges, Run Now buttons
7. Memory — search bar, type-colored icons, pin indicator
8. Settings — clean sections, correct spacing
9. `StatusBadge` component used consistently across all screens
10. No regressions — all existing data, API, and interactivity still works
11. No TypeScript errors or console warnings
12. App opens to Home Screen by default

---

## Notes for Claude Code

- **Do not change any API calls, store actions, or WebSocket handlers.** Visual only.
- **Preserve all existing modal logic** in ProjectsView (EditModal, ProjectMenu, ProjectPlanningModal).
- The `AgentDashboard` currently reads from `poolSlots` — keep that wiring.
- The `TaskQueue` currently reads from `activeTasks` and `buildSessions` — keep that wiring.
- `MemoryBrowser` has existing search and pin logic — keep it, just restyle the wrapper.
- If a screen currently shows a "coming soon" placeholder (Schedule), implement the basic static layout from the design spec above. Wire to real data if the endpoint exists at `GET /api/schedule` (check `backend/api/`).
- Use `cn()` from `@/lib/utils` for conditional class merging throughout.
- All SVG icons can be inline — no icon library import needed unless already present.
