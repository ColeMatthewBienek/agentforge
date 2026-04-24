# UI Migration — Part 2: Home Screen & Chat Visual Update

> Tasks 6–8: Home Screen, Chat visual polish, App.tsx home route
> Prerequisite: Part 1 complete and checked in.
> Hand this entire doc to one Claude Code session.

---

## Task 6: Home Screen

Create `frontend/src/components/home/HomeScreen.tsx`

This is the default landing view when the app opens. Route id: `'home'`.

**Layout:** `flex-1 overflow-auto flex flex-col items-center` with `pt-12 pb-8 px-6`

### Hero Section

```tsx
<div className="text-[22px] font-semibold text-foreground mb-1.5">What should we build?</div>
<div className="text-[13px] text-[#484f58] mb-6">Start a conversation, plan a project, or dispatch a task</div>
```

### Prompt Bar

Max width `max-w-[620px] w-full`, `mb-3`

```tsx
<div className="rounded-[10px] border border-border bg-card flex items-center px-4 py-1 pr-1">
  {/* Plus icon left */}
  <PlusIcon className="text-[#484f58] flex-shrink-0 mr-2" size={16} />
  {/* Input */}
  <input
    className="flex-1 bg-transparent text-[14px] text-[#484f58] placeholder:text-[#484f58] outline-none py-2.5"
    placeholder="Describe a task, or use / for commands..."
    onKeyDown={(e) => {
      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
        onNavigate('chat');
        // TODO: pre-fill input when thread store is wired
      }
    }}
  />
  {/* Plan button */}
  <button
    onClick={() => onNavigate('chat')}
    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-[13px] font-medium cursor-pointer"
  >
    Plan <span className="text-[11px] opacity-70">→</span>
  </button>
</div>
```

### Suggestion Chips

```tsx
<div className="flex gap-1.5 mb-10">
  {["Review today's changes", "Refactor auth module", "Write unit tests"].map((s) => (
    <button
      key={s}
      onClick={() => onNavigate('chat')}
      className="px-3 py-1 rounded-full border border-[#21262d] text-[12px] text-muted-foreground bg-card cursor-pointer hover:text-foreground hover:border-border transition-colors"
    >
      {s}
    </button>
  ))}
</div>
```

### Dashboard Grid

`max-w-[800px] w-full grid grid-cols-2 gap-3.5`

**Recent Projects card:**
- Card: `rounded-[10px] border border-[#21262d] bg-background overflow-hidden`
- Header: `px-3.5 py-3 border-b border-[#21262d] flex items-center justify-between`
  - Title: `text-[12px] font-semibold text-foreground`
  - Link: `text-[11px] text-accent cursor-pointer hover:underline` — "View all →" → `onNavigate('projects')`
- Data: fetch from `api.projects.list()` on mount, show max 3, loading skeleton if needed
- Per row: `px-3.5 py-2.5 border-b last:border-0 border-[#21262d] flex items-center gap-2.5 cursor-pointer hover:bg-card/50`
  - Status dot: `w-1.5 h-1.5 rounded-full` — executing/complete: `bg-status-active`, paused: `bg-status-idle`, planning: `bg-accent`
  - Name: `flex-1 text-[13px] text-foreground`
  - Status badge: `text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#21262d] text-[#484f58]`
  - Time: `text-[11px] text-[#484f58]`

**Active Tasks card:**
- Same card structure
- Data: read `activeTasks` from store (already live-updated), show max 3
- If empty, show: `text-[12px] text-[#484f58] px-3.5 py-3 italic` — "No active tasks"
- Per row: same structure, right side shows agent slot id in `font-mono text-[#484f58]`
- "View all →" → `onNavigate('tasks')`

**Props:**
```tsx
interface HomeScreenProps {
  onNavigate: (view: string) => void;
}
```

---

## Task 7: Chat Screen Visual Update

Update `frontend/src/components/chat/ChatPanel.tsx` and `frontend/src/components/chat/MessageList.tsx`

The logic is **unchanged**. These are visual updates only.

### ChatPanel header (full replacement)

```tsx
{/* Header */}
<div className="h-11 border-b border-[#21262d] flex items-center justify-between px-4 flex-shrink-0">
  {/* Left: thread title + agent badge */}
  <div className="flex items-center gap-2">
    <span className="text-[13px] font-semibold text-foreground">
      {/* Show current session title or "New conversation" */}
      {currentSessionId ? 'Active session' : 'New conversation'}
    </span>
    <span className="text-[10px] px-2 py-0.5 rounded font-mono border border-status-active/30 text-status-active bg-status-active/10">
      {selectedAgent}
    </span>
  </div>

  {/* Right: Context toggle + New Session */}
  <div className="flex items-center gap-1.5">
    <button
      onClick={() => useAgentStore.getState().toggleContextPanel()}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border transition-colors",
        contextPanelVisible
          ? "bg-secondary border-border text-muted-foreground"
          : "bg-transparent border-[#21262d] text-[#484f58] hover:text-muted-foreground"
      )}
    >
      {/* Panel icon: rect with vertical divider */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M15 3v18"/>
      </svg>
      Context
    </button>
    <button
      onClick={() => { useAgentStore.getState().clearMessages(); sendCommand('new_session', ''); }}
      className="px-2 py-1 rounded text-[11px] border border-[#21262d] bg-transparent text-[#484f58] hover:text-muted-foreground transition-colors"
    >
      New Session
    </button>
  </div>
</div>
```

Read `contextPanelVisible` from store: `const contextPanelVisible = useAgentStore(s => s.contextPanelVisible)`

### MessageList — message bubble visual update

User message bubble:
```tsx
// Before: bg-accent/20 border border-accent/30
// After:
<div className="max-w-[65%] px-3.5 py-2.5 rounded-[12px_12px_4px_12px] bg-accent/10 border border-accent/20 text-[13px] text-foreground leading-relaxed">
```

Agent message wrapper:
```tsx
// Agent icon: 28×28, rounded-lg, bg-primary/10 border border-primary/20, ⬡ in text-status-active
<div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-[12px] text-status-active flex-shrink-0 mt-0.5">⬡</div>
```

Agent message bubble:
```tsx
// Before: bg-card border border-border
// After: remove the card wrapper entirely — agent text is flat, no bubble
<div className="flex flex-col gap-2 max-w-[75%]">
  <div className="text-[13px] text-[#c9d1d9] leading-[1.55]">{message.content}</div>
  {/* Code blocks stay as-is */}
</div>
```

**Streaming indicator** (replaces current ThinkingDots):
```tsx
<div className="flex gap-2.5 items-center">
  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-[12px] text-status-active flex-shrink-0">⬡</div>
  <div className="flex gap-1 items-center">
    {[0.8, 0.5, 0.3].map((op, i) => (
      <div key={i} className="w-1.5 h-1.5 rounded-full bg-status-active" style={{ opacity: op }} />
    ))}
    <span className="text-[11px] text-[#484f58] ml-1.5">{selectedAgent} is typing...</span>
  </div>
</div>
```

### InputBar visual update

The `InputBar.tsx` wrapper (keep all logic, update the wrapper div):

```tsx
// Outer container padding:
<div className="px-4 py-3 pb-4 border-t border-[#21262d] flex-shrink-0">
  {/* Input box */}
  <div className="rounded-[10px] border border-border bg-card flex items-end px-3.5 py-1 pr-1 focus-within:border-[#484f58] transition-colors">
    <PlusIcon className="text-[#484f58] mb-2.5 flex-shrink-0" size={16} />
    <textarea
      className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-[#484f58] resize-none outline-none py-2 px-2.5 min-h-[20px] max-h-40"
      placeholder={`Message ${selectedAgent}, or /command...`}
    />
    <div className="flex gap-1 items-center mb-1 mr-0.5">
      <span className="text-[10px] text-[#484f58] px-1.5 py-0.5 rounded border border-[#21262d] font-mono">⌘K</span>
      <button
        className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-[12px] font-medium cursor-pointer disabled:opacity-40"
      >
        Send
      </button>
    </div>
  </div>
</div>
```

---

## Task 8: App.tsx — Add Home Route

Update `frontend/src/App.tsx`:

```tsx
import { HomeScreen } from "@/components/home/HomeScreen";

// In the switch:
case "home":
  return <HomeScreen onNavigate={setActiveView} />;

// Change default:
default:
  return <HomeScreen onNavigate={setActiveView} />;
```

Also update the store's `activeView` initial value from `"chat"` to `"home"` in `agentStore.ts`:
```ts
activeView: "home",
```

---

## Store Additions Needed

Add to `agentStore.ts`:

```ts
// In interface AgentStore:
contextPanelVisible: boolean;
toggleContextPanel: () => void;
setContextPanelVisible: (v: boolean) => void;

// In create():
contextPanelVisible: false,
toggleContextPanel: () => set(state => ({ contextPanelVisible: !state.contextPanelVisible })),
setContextPanelVisible: (v) => set({ contextPanelVisible: v }),
```

---

## Check-In After Task 8

1. App opens to Home Screen with prompt bar, chips, and dashboard grid
2. Clicking "Plan →" or any chip navigates to chat
3. Dashboard grid shows real projects (fetched from API) and real active tasks from store
4. "View all →" links navigate to correct views
5. Chat header shows thread title, agent badge, Context toggle, New Session
6. Agent icon is now ⬡ with green tint (not the old hex shape)
7. User bubbles are blue-tinted, rounded asymmetrically
8. Agent messages are flat text (no card wrapper), more readable
9. Streaming indicator shows bouncing dots with agent name
10. Context panel toggles correctly from chat header button
11. InputBar shows ⌘K hint and updated styling
