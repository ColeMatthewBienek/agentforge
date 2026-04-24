# UI Migration — New Project Flow

> Source design: `New Project Flow.html` from `AgerntForge-handoff__1_.zip`
> Target: `frontend/src/components/projects/ProjectPlanningModal.tsx`
> Prerequisite: None — this is self-contained within the modal
> Hand this entire doc to one Claude Code session.

---

## What the Design Adds

The current `ProjectPlanningModal` has two states: "name entry" and "planning chat".
The design replaces this with a **3-step wizard** inside the same modal:

```
Step 1: Name       Step 2: Configure       Step 3: Plan (AI chat)
  ────────────────────────────────────────────────────────────────
  What are        Working dir             PM chat on left
  you building?   Primary agent           Plan preview on right
  [input]         Workspace isolation     [Submit Plan]
                  Description
```

Visual changes:
- Modal gets a step indicator bar below the header
- Step 1 is centered, hero-style (full logo, suggestions, CTA button)
- Step 2 is a form with option selectors (not dropdowns)
- Step 3 is the existing PM chat — same backend wiring, restyled

**All backend API calls are unchanged.** The `api.projects.create()` call moves from
name-confirm to the Step 2→3 transition. The pm-chat endpoint, submitPlan, etc. are
identical.

---

## Animations

Add to `index.css` (or inject via `<style>` in the modal):

```css
@keyframes af-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes af-slide-up {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes af-pulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1; }
}
.af-fade-in  { animation: af-fade-in  0.3s ease both; }
.af-slide-up { animation: af-slide-up 0.35s cubic-bezier(0.16,1,0.3,1) both; }
```

---

## Component: `StepIndicator`

Renders inside the modal header area, below the title row.

```tsx
interface StepIndicatorProps {
  current: number;   // 0-based index
  steps: string[];   // ['Name', 'Configure', 'Plan']
}

function StepIndicator({ current, steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center px-6">
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-2">
            {/* Circle */}
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all duration-300",
              i < current
                ? "bg-primary border-[1.5px] border-primary text-white"
                : i === current
                ? "bg-primary/10 border-[1.5px] border-primary text-status-active"
                : "bg-card border-[1.5px] border-[#21262d] text-[#484f58]"
            )}>
              {i < current ? '✓' : i + 1}
            </div>
            {/* Label */}
            <span className={cn(
              "text-[12px] whitespace-nowrap transition-colors duration-200",
              i <= current
                ? i === current ? "text-foreground font-semibold" : "text-foreground font-normal"
                : "text-[#484f58]"
            )}>
              {label}
            </span>
          </div>
          {/* Connector line */}
          {i < steps.length - 1 && (
            <div className={cn(
              "flex-1 h-px mx-3 min-w-[24px] transition-colors duration-300",
              i < current ? "bg-primary" : "bg-[#21262d]"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
```

---

## Step 1: Name (`StepName`)

Centered layout, `flex-1 flex items-center justify-center`

```tsx
function StepName({
  name, setName, onNext
}: {
  name: string;
  setName: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="af-fade-in flex-1 flex items-center justify-center">
      <div className="w-[460px] text-center">
        {/* Logo */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-[#1a6b2b] flex items-center justify-center text-2xl text-white mx-auto mb-5">⬡</div>

        <div className="text-[20px] font-semibold text-foreground mb-1.5">What are you building?</div>
        <div className="text-[13px] text-[#484f58] mb-7">Give your project a name to get started</div>

        {/* Input */}
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onNext()}
          placeholder="e.g. Auth System, API Gateway, Mobile App..."
          className="w-full px-[18px] py-[14px] rounded-[10px] border-[1.5px] border-border bg-card text-foreground text-[15px] outline-none focus:border-primary transition-colors text-center placeholder:text-[#484f58]"
        />

        {/* Quick suggestions */}
        <div className="flex gap-1.5 justify-center mt-3.5 flex-wrap">
          {['REST API', 'CLI Tool', 'Web App', 'Data Pipeline', 'Microservice'].map((s) => (
            <button
              key={s}
              onClick={() => setName(s)}
              className="px-3 py-1 rounded-full border border-[#21262d] bg-background text-muted-foreground text-[11px] cursor-pointer hover:text-foreground hover:border-border transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onNext}
          disabled={!name.trim()}
          className="w-full mt-6 py-3 rounded-[10px] text-[14px] font-medium transition-all duration-200 bg-primary text-white hover:bg-primary/90 disabled:bg-secondary disabled:text-[#484f58] disabled:cursor-not-allowed"
        >
          Start Planning →
        </button>
      </div>
    </div>
  );
}
```

---

## Step 2: Configure (`StepConfigure`)

Scrollable form, `flex-1 flex flex-col overflow-auto`

```tsx
interface ProjectConfig {
  workdir: string;
  agent: 'claude' | 'codex' | 'auto';
  isolation: 'worktree' | 'shared';
  description: string;
}

function StepConfigure({
  config, setConfig, onNext, onBack
}: {
  config: ProjectConfig;
  setConfig: (fn: (prev: ProjectConfig) => ProjectConfig) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const update = <K extends keyof ProjectConfig>(k: K, v: ProjectConfig[K]) =>
    setConfig(prev => ({ ...prev, [k]: v }));

  return (
    <div className="af-fade-in flex-1 flex flex-col overflow-auto">
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-[560px] mx-auto w-full space-y-5">
          <div>
            <div className="text-[16px] font-semibold text-foreground mb-1">Configure your project</div>
            <div className="text-[12px] text-[#484f58]">Set up the workspace and agent preferences</div>
          </div>

          {/* Working Directory */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Working Directory
            </label>
            <div className="flex gap-2">
              <div className="flex-1 px-3.5 py-2.5 rounded-lg border border-[#21262d] bg-card text-[13px] font-mono flex items-center gap-2 text-foreground">
                <FolderIcon size={14} className="text-[#484f58]" />
                <span className={config.workdir ? "text-foreground" : "text-[#484f58]"}>
                  {config.workdir || 'Select a directory...'}
                </span>
              </div>
              <button
                onClick={() => update('workdir', '~/projects/my-app')}
                className="px-4 py-2.5 rounded-lg border border-border bg-secondary text-foreground text-[12px] hover:bg-secondary/80 transition-colors"
              >
                Browse
              </button>
            </div>
            {/* Quick paths */}
            <div className="flex gap-1.5 mt-2">
              {['~/agentforge', '~/projects/my-app', 'New worktree'].map((p) => (
                <button
                  key={p}
                  onClick={() => update('workdir', p)}
                  className={cn(
                    "px-2.5 py-1 rounded border text-[11px] cursor-pointer transition-colors",
                    config.workdir === p
                      ? "border-border bg-secondary text-muted-foreground"
                      : "border-[#21262d] bg-transparent text-[#484f58] hover:text-muted-foreground",
                    p !== 'New worktree' ? "font-mono" : ""
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Agent */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Primary Agent
            </label>
            <div className="flex gap-2">
              {([
                { id: 'claude', label: 'Claude Code', desc: 'Full-stack, reasoning-heavy tasks' },
                { id: 'codex',  label: 'Codex CLI',   desc: 'Fast code generation and edits' },
                { id: 'auto',   label: 'Auto',         desc: 'Let the planner decide per-task' },
              ] as const).map((a) => (
                <button
                  key={a.id}
                  onClick={() => update('agent', a.id)}
                  className={cn(
                    "flex-1 p-3 rounded-lg text-left border cursor-pointer transition-all duration-150",
                    config.agent === a.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-[#21262d] bg-card hover:border-border"
                  )}
                >
                  <div className={cn("text-[13px] font-medium mb-0.5", config.agent === a.id ? "text-status-active" : "text-foreground")}>
                    {a.label}
                  </div>
                  <div className="text-[11px] text-[#484f58]">{a.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Workspace Isolation */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Workspace Isolation
            </label>
            <div className="flex gap-2">
              {([
                { id: 'worktree', label: 'Git Worktrees',   desc: 'Each task gets an isolated branch' },
                { id: 'shared',   label: 'Shared Directory', desc: 'All tasks work in the same dir' },
              ] as const).map((w) => (
                <button
                  key={w.id}
                  onClick={() => update('isolation', w.id)}
                  className={cn(
                    "flex-1 p-3 rounded-lg text-left border cursor-pointer transition-all duration-150",
                    config.isolation === w.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-[#21262d] bg-card hover:border-border"
                  )}
                >
                  <div className={cn("text-[13px] font-medium mb-0.5", config.isolation === w.id ? "text-status-active" : "text-foreground")}>
                    {w.label}
                  </div>
                  <div className="text-[11px] text-[#484f58]">{w.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Description <span className="font-normal text-[#30363d] normal-case tracking-normal">optional</span>
            </label>
            <textarea
              value={config.description}
              onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of what this project will build..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#21262d] bg-card text-foreground text-[13px] resize-none outline-none focus:border-border transition-colors placeholder:text-[#484f58]"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between px-8 py-4 border-t border-[#21262d] flex-shrink-0">
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-lg border border-[#21262d] bg-transparent text-muted-foreground text-[13px] hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 rounded-lg bg-primary text-white text-[13px] font-medium hover:bg-primary/90 transition-colors"
        >
          Continue to Planning →
        </button>
      </div>
    </div>
  );
}
```

---

## Step 3: Planning Chat (`StepPlanning`)

This is the existing planning chat, visually updated to match the design.
**All API calls are identical to the current implementation.**

Changes from current:
- Agent avatar: `w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 text-status-active text-[12px]` shows `⬡`
- User bubble: `bg-accent/10 border border-accent/20 rounded-[12px_12px_4px_12px]`
- Assistant bubble: `bg-card border border-[#21262d] rounded-[4px_12px_12px_12px]`
- Streaming dots use `af-pulse` animation
- Plan preview panel header shows green dot when plan is detected

```tsx
// Plan preview panel header:
<div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Plan Preview</span>
  {planDocument && (
    <div className="w-1.5 h-1.5 rounded-full bg-status-active" />
  )}
</div>

// Submit button — when plan detected:
<button
  onClick={submitPlan}
  disabled={!planDocument || submitting}
  className={cn(
    "w-full py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200",
    planDocument
      ? "bg-primary text-white hover:bg-primary/90 cursor-pointer"
      : "bg-secondary text-[#484f58] cursor-not-allowed"
  )}
>
  {submitting ? 'Submitting…' : planDocument ? '✓ Submit Plan & Execute' : 'Waiting for plan...'}
</button>
```

Plan preview empty state:
```tsx
// When no plan yet:
<div className="text-center pt-10">
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#21262d" strokeWidth="1.5" className="mx-auto mb-3">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/>
  </svg>
  <p className="text-[12px] text-[#484f58] leading-relaxed">
    Task breakdown will appear<br/>here once the plan is ready
  </p>
</div>
```

---

## Full Modal Restructure

Replace the entire `ProjectPlanningModal` component with the 3-step wizard:

```tsx
export function ProjectPlanningModal({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [config, setConfig] = useState<ProjectConfig>({
    workdir: '',
    agent: 'auto',
    isolation: 'worktree',
    description: '',
  });
  const [projectId, setProjectId] = useState<string | null>(null);

  // Step 1 → 2: just advance (no API call yet)
  const handleNameNext = () => {
    if (name.trim()) setStep(1);
  };

  // Step 2 → 3: create the project now (was previously on name confirm)
  const handleConfigNext = async () => {
    const result = await api.projects.create(name.trim(), {
      description: config.description || undefined,
      // workdir and isolation can be passed if the API supports them
    });
    setProjectId(result.project_id);
    setStep(2);
  };

  const steps = ['Name', 'Configure', 'Plan'];

  const modalSubtitle =
    step === 0 ? 'Name your project' :
    step === 1 ? 'Configure workspace' :
    `Planning: ${name}`;

  return (
    <>
      <style>{`
        @keyframes pmBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes af-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes af-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1; }
        }
        .af-fade-in { animation: af-fade-in 0.3s ease both; }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-[90%] max-w-[900px] h-[82vh] bg-[#0d1117] border border-border rounded-[14px] flex flex-col overflow-hidden shadow-2xl">

          {/* Header */}
          <div className="px-6 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-[#1a6b2b] flex items-center justify-center text-[13px] text-white">⬡</div>
              <div>
                <div className="text-[14px] font-semibold text-foreground">New Project</div>
                <div className="text-[11px] text-[#484f58]">{modalSubtitle}</div>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md text-[#484f58] hover:text-muted-foreground hover:bg-secondary/50 transition-colors text-[18px]">×</button>
          </div>

          {/* Step indicator */}
          <div className="py-3.5 border-b border-[#21262d] flex-shrink-0">
            <StepIndicator current={step} steps={steps} />
          </div>

          {/* Step content */}
          {step === 0 && (
            <StepName name={name} setName={setName} onNext={handleNameNext} />
          )}
          {step === 1 && (
            <StepConfigure
              config={config}
              setConfig={setConfig}
              onNext={() => void handleConfigNext()}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && projectId && (
            <StepPlanning
              name={name}
              projectId={projectId}
              onBack={() => setStep(1)}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}
```

---

## `StepPlanning` Props Change

The existing planning chat logic needs to be extracted into a `StepPlanning` sub-component.
It receives `projectId` (already created in Step 2) instead of creating it internally.

```tsx
function StepPlanning({
  name,
  projectId,
  onBack,
  onClose,
}: {
  name: string;
  projectId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  // All existing pm-chat state and logic moves here verbatim:
  // messages, input, loading, planDocument, submitting
  // sendMessage(), submitPlan(), handleKeyDown()
  // The only change: projectId comes from props, not internal state
  // submitPlan calls onClose() on success
}
```

---

## `api.projects.create` Signature

Check `frontend/src/lib/api.ts` for the current signature. If it only takes `name`,
add an optional second argument:

```ts
create: async (name: string, opts?: { description?: string }) => {
  const res = await fetch('http://localhost:8765/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: opts?.description }),
  });
  return res.json() as Promise<{ project_id: string }>;
}
```

The backend already accepts `description` in the projects POST endpoint — this is
already in `backend/api/projects.py`. No backend changes needed.

---

## What Does NOT Change

- `ProjectWorkspace.tsx` — untouched (already matches the design)
- `ProjectsView.tsx` — untouched
- All backend API endpoints — untouched
- The planning chat logic (pm-chat, plan detection, submitPlan) — moved to `StepPlanning`, not changed
- `TIER_COLORS` export — stays in this file, still imported by `ProjectWorkspace`
- `ThinkingIndicator` — keep, used in `StepPlanning`

---

## Check-In Criteria

1. "+ New Project" button opens the modal
2. Step 1 shows centered hero layout with ⬡ logo, input, suggestions, CTA
3. Enter key on Step 1 advances to Step 2
4. Step indicator shows correct active/completed states with green checkmarks
5. Connector lines between steps turn green as steps complete
6. Step 2 shows working directory, agent selector (3 cards), isolation (2 cards), description
7. Clicking an agent/isolation card highlights it with green tint and border
8. "Continue to Planning →" creates the project and advances to Step 3
9. Step 3 shows the PM chat with ⬡ avatar, correct bubble styles, and plan preview panel
10. Plan preview panel shows empty clipboard state until `## Project:` detected
11. Plan preview shows task cards with staggered `af-fade-in` animation when plan appears
12. Green dot appears in plan preview header when plan is detected
13. Submit Plan button activates when plan is detected, submits to backend, closes modal
14. "← Back" on Steps 2 and 3 navigates backward correctly
15. No regressions in `ProjectWorkspace` (Kanban, DAG, task detail panel all still work)
16. No TypeScript errors
