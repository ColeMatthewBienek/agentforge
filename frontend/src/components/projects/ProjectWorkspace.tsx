import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { api, type ProjectDetail, type ProjectTask } from "@/lib/api";
import { useAgentStore } from "@/store/agentStore";
import { computeStages } from "@/lib/dagUtils";
import { TIER_COLORS } from "./ProjectPlanningModal";
import type { TaskSpec } from "@/store/agentStore";

// Map ProjectTask → TaskSpec-compatible shape for DAG reuse
function toTaskSpec(t: ProjectTask): TaskSpec {
  return {
    id: t.id,
    session_id: "",
    title: t.title,
    prompt: t.prompt,
    status: t.status as TaskSpec["status"],
    complexity: (t.complexity || "medium") as TaskSpec["complexity"],
    dependencies: t.dependencies ? (JSON.parse(t.dependencies) as string[]) : [],
    slot_id: t.slot_id,
    worktree_path: t.worktree_path,
    error: t.error,
    created_at: t.created_at,
    completed_at: t.completed_at,
  };
}

const KANBAN_COLUMNS = ["backlog", "assigned", "in_progress", "review", "done", "blocked"] as const;

const COLUMN_LABELS: Record<string, string> = {
  backlog: "Backlog",
  assigned: "Assigned",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
};

const STATUS_DOT: Record<string, string> = {
  pending:   "bg-[#8b949e]",
  running:   "bg-green-400 animate-pulse",
  complete:  "bg-green-400",
  error:     "bg-red-400",
  cancelled: "bg-[#8b949e]",
};

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <span className={cn("text-[9px] font-mono px-1 py-0.5 rounded border", TIER_COLORS[tier] ?? "border-[#30363d] text-[#8b949e]")}>
      {tier}
    </span>
  );
}

function TaskDetailPanel({ task, runId, onClose }: { task: ProjectTask; runId: string; onClose: () => void }) {
  const taskChunks = useAgentStore((s) => s.taskChunks);
  const [injection, setInjection] = useState("");
  const [injecting, setInjecting] = useState(false);
  const liveOutput = taskChunks[task.id] ?? "";
  const output = liveOutput || task.output || "";
  const outputLines = output.split("\n").slice(-40).join("\n");

  const handleInject = async () => {
    if (!injection.trim() || injecting) return;
    setInjecting(true);
    try {
      await api.projects.injectContext(runId, task.id, injection.trim());
      setInjection("");
    } finally {
      setInjecting(false);
    }
  };

  return (
    <div className="w-80 border-l border-[#30363d] bg-[#0d1117] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d]">
        <span className="text-xs font-semibold text-foreground truncate">{task.title}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none ml-2">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <TierBadge tier={task.executor_tier} />
          <span className="font-mono text-muted-foreground/50 text-[10px]">{task.id}</span>
        </div>

        {task.acceptance_criteria && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Acceptance Criteria</p>
            <p className="text-foreground/80 leading-relaxed">{task.acceptance_criteria}</p>
          </div>
        )}

        {task.em_notes && (
          <div>
            <p className="text-[10px] text-yellow-400/70 mb-1 uppercase tracking-wider">EM Notes</p>
            <p className="text-yellow-300/70 leading-relaxed">{task.em_notes}</p>
          </div>
        )}

        <details>
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">prompt</summary>
          <p className="mt-1 text-foreground/70 whitespace-pre-wrap leading-relaxed font-mono text-[10px]">{task.prompt}</p>
        </details>

        <div>
          <p className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Output</p>
          <div className="bg-[#161b22] border border-[#30363d] rounded p-2 h-36 overflow-y-auto">
            {outputLines ? (
              <pre className="text-green-400/80 text-[10px] leading-relaxed whitespace-pre-wrap break-all">{outputLines}</pre>
            ) : (
              <span className="text-muted-foreground/40 text-[10px] italic">no output yet</span>
            )}
          </div>
        </div>

        {task.error && (
          <div className="bg-red-500/5 border border-red-500/20 rounded p-2">
            <p className="text-red-400 text-[10px] leading-relaxed">{task.error}</p>
          </div>
        )}

        {task.worktree_path && (
          <button
            onClick={() => void navigator.clipboard.writeText(task.worktree_path!)}
            className="text-[10px] text-muted-foreground/50 hover:text-accent transition-colors truncate w-full text-left"
            title="Copy worktree path"
          >
            📁 {task.worktree_path.split("/").slice(-2).join("/")}
          </button>
        )}
      </div>

      {/* Context injection */}
      {(task.status === "running" || task.status === "pending") && (
        <div className="px-4 py-3 border-t border-[#30363d]">
          <p className="text-[10px] text-muted-foreground mb-1.5">Inject context</p>
          <div className="flex gap-2 items-end bg-[#161b22] border border-[#30363d] rounded px-2 py-1.5 focus-within:border-ring transition-colors">
            <textarea
              value={injection}
              onChange={(e) => setInjection(e.target.value)}
              placeholder="Additional context for the agent…"
              rows={2}
              className="flex-1 bg-transparent text-[10px] text-foreground resize-none outline-none placeholder:text-muted-foreground font-mono"
            />
            <button
              onClick={() => void handleInject()}
              disabled={!injection.trim() || injecting}
              className="shrink-0 px-2 py-1 text-[10px] rounded bg-primary/80 text-primary-foreground hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Inject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanCard({ task, onClick }: { task: ProjectTask; onClick: () => void }) {
  const deps = task.dependencies ? (JSON.parse(task.dependencies) as string[]) : [];
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded border bg-[#0d1117] px-3 py-2 text-xs hover:border-[#484f58] transition-colors",
        task.status === "running"
          ? "border-[#30363d] border-l-2 border-l-[#238636]"
          : task.status === "error"
          ? "border-[#30363d] border-l-2 border-l-[#f85149]"
          : task.kanban_column === "blocked"
          ? "border-yellow-500/20 opacity-70"
          : "border-[#30363d]"
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[task.status] ?? "bg-[#8b949e]")} />
        <TierBadge tier={task.executor_tier} />
        {task.slot_id && task.slot_id !== "ollama" && (
          <span className="text-[9px] font-mono text-muted-foreground/50">{task.slot_id}</span>
        )}
      </div>
      <p className="text-foreground line-clamp-2 leading-snug">{task.title}</p>
      {deps.length > 0 && (
        <p className="text-[9px] text-muted-foreground/50 mt-1">deps: {deps.join(", ")}</p>
      )}
    </button>
  );
}

interface DAGNodeProps {
  task: ProjectTask;
  onClick: () => void;
  onMeasure: () => void;
}

function DAGNode({ task, onClick, onMeasure }: DAGNodeProps, ref: React.Ref<HTMLDivElement>) {
  return (
    <div
      ref={ref}
      onClick={() => { onClick(); setTimeout(onMeasure, 50); }}
      className={cn(
        "bg-[#161b22] border rounded-md px-2.5 py-2 cursor-pointer text-xs transition-all hover:border-[#484f58]",
        task.status === "running"
          ? "border-[#30363d] border-l-2 border-l-[#238636] shadow-[0_0_6px_rgba(35,134,54,0.2)]"
          : task.status === "complete"
          ? "border-[#238636]/30"
          : task.status === "error"
          ? "border-[#30363d] border-l-2 border-l-[#f85149]"
          : "border-[#30363d]"
      )}
    >
      <div className="flex items-center gap-1 mb-1">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[task.status] ?? "bg-[#8b949e]")} />
        <TierBadge tier={task.executor_tier} />
      </div>
      <p className="text-foreground line-clamp-2 leading-snug text-[11px]">{task.title}</p>
    </div>
  );
}

const DAGNodeRef = (({ task, onClick, onMeasure }: DAGNodeProps, ref: React.Ref<HTMLDivElement>) => (
  <div
    ref={ref}
    onClick={() => { onClick(); setTimeout(onMeasure, 50); }}
    className={cn(
      "bg-[#161b22] border rounded-md px-2.5 py-2 cursor-pointer text-xs transition-all hover:border-[#484f58]",
      task.status === "running"
        ? "border-[#30363d] border-l-2 border-l-[#238636] shadow-[0_0_6px_rgba(35,134,54,0.2)]"
        : task.status === "complete"
        ? "border-[#238636]/30"
        : task.status === "error"
        ? "border-[#30363d] border-l-2 border-l-[#f85149]"
        : "border-[#30363d]"
    )}
  >
    <div className="flex items-center gap-1 mb-1">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[task.status] ?? "bg-[#8b949e]")} />
      <TierBadge tier={task.executor_tier} />
    </div>
    <p className="text-foreground line-clamp-2 leading-snug text-[11px]">{task.title}</p>
  </div>
));

DAGNodeRef.displayName = "DAGNodeRef";

function ProjectDAG({ tasks, onSelect }: { tasks: ProjectTask[]; onSelect: (t: ProjectTask) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [arrows, setArrows] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; complete: boolean }>>([]);

  const taskSpecs = tasks.map(toTaskSpec);
  const stages = computeStages(taskSpecs);
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const measure = useCallback(() => {
    if (!containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const newArrows: typeof arrows = [];
    for (const task of tasks) {
      const targetEl = nodeRefs.current.get(task.id);
      if (!targetEl) continue;
      const targetRect = targetEl.getBoundingClientRect();
      const deps = task.dependencies ? (JSON.parse(task.dependencies) as string[]) : [];
      for (const depId of deps) {
        const sourceEl = nodeRefs.current.get(depId);
        if (!sourceEl) continue;
        const sourceRect = sourceEl.getBoundingClientRect();
        const dep = taskById.get(depId);
        newArrows.push({
          x1: sourceRect.right - container.left,
          y1: sourceRect.top + sourceRect.height / 2 - container.top,
          x2: targetRect.left - container.left,
          y2: targetRect.top + targetRect.height / 2 - container.top,
          complete: dep?.status === "complete",
        });
      }
    }
    setArrows(newArrows);
  }, [tasks]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, tasks]);

  return (
    <div ref={containerRef} className="relative flex gap-6 items-start min-h-full pb-4">
      <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ width: "100%", height: "100%" }}>
        <defs>
          <marker id="proj-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#30363d" />
          </marker>
          <marker id="proj-arrow-done" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#238636" />
          </marker>
        </defs>
        {arrows.map((a, i) => (
          <path
            key={i}
            d={`M ${a.x1} ${a.y1} C ${(a.x1 + a.x2) / 2} ${a.y1}, ${(a.x1 + a.x2) / 2} ${a.y2}, ${a.x2} ${a.y2}`}
            stroke={a.complete ? "#238636" : "#30363d"}
            strokeWidth={1.5}
            fill="none"
            strokeDasharray={a.complete ? undefined : "4,3"}
            markerEnd={`url(#proj-arrow${a.complete ? "-done" : ""})`}
            opacity={0.7}
          />
        ))}
      </svg>
      {stages.map((stageTasks, stageIdx) => (
        <div key={stageIdx} className="flex flex-col gap-3 min-w-[180px] max-w-[220px]">
          <div className="text-[10px] text-muted-foreground/40 font-mono uppercase tracking-widest px-1">
            {stageIdx === 0 ? "parallel" : `stage ${stageIdx + 1}`}
          </div>
          {stageTasks.map((spec) => {
            const task = taskById.get(spec.id);
            if (!task) return null;
            return (
              <DAGNodeRef
                key={spec.id}
                task={task}
                onClick={() => onSelect(task)}
                onMeasure={measure}
                ref={(el) => {
                  if (el) nodeRefs.current.set(spec.id, el);
                  else nodeRefs.current.delete(spec.id);
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function ProjectWorkspace({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [view, setView] = useState<"kanban" | "dag">("kanban");
  const { projectKickBacks } = useAgentStore();

  const load = useCallback(() => {
    api.projects.get(projectId).then(setProject).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Only poll while executing — stop when terminal state reached
  useEffect(() => {
    const LIVE_STATUSES = new Set(["executing", "decomposing", "em_review"]);
    if (!project || !LIVE_STATUSES.has(project.status)) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [project?.status, load]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading project…
      </div>
    );
  }

  const latestRun = project.runs[0] ?? null;
  const tasks = project.tasks;
  const succeeded = tasks.filter((t) => t.status === "complete").length;
  const kickBacks = projectKickBacks;

  const tasksByColumn: Record<string, ProjectTask[]> = {};
  for (const col of KANBAN_COLUMNS) tasksByColumn[col] = [];
  for (const t of tasks) {
    const col = t.kanban_column || "backlog";
    (tasksByColumn[col] = tasksByColumn[col] ?? []).push(t);
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <header className="px-6 py-3 border-b border-border flex items-center gap-4">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          ← Projects
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground truncate">{project.name}</h1>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#30363d] text-muted-foreground">
              {project.status}
            </span>
          </div>
          {latestRun && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {succeeded}/{tasks.length} tasks complete
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("kanban")}
            className={cn("text-xs px-2 py-1 rounded border transition-colors",
              view === "kanban" ? "border-accent/50 text-accent bg-accent/10" : "border-[#30363d] text-muted-foreground hover:text-foreground")}
          >
            Kanban
          </button>
          <button
            onClick={() => setView("dag")}
            className={cn("text-xs px-2 py-1 rounded border transition-colors",
              view === "dag" ? "border-accent/50 text-accent bg-accent/10" : "border-[#30363d] text-muted-foreground hover:text-foreground")}
          >
            DAG
          </button>
        </div>
      </header>

      {/* Kick-back banner */}
      {kickBacks.length > 0 && (
        <div className="px-6 py-3 bg-yellow-500/5 border-b border-yellow-500/20">
          <p className="text-xs text-yellow-400 font-medium mb-1">⚠️ {kickBacks.length} task{kickBacks.length !== 1 ? "s" : ""} need clarification before executing:</p>
          <ul className="space-y-0.5">
            {kickBacks.map((q, i) => (
              <li key={i} className="text-xs text-yellow-300/70">{q}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-auto p-4">
          {view === "kanban" ? (
            <div className="flex gap-3 h-full">
              {KANBAN_COLUMNS.map((col) => (
                <div key={col} className="flex flex-col min-w-[180px] max-w-[220px]">
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-semibold">
                      {COLUMN_LABELS[col]}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40">
                      {tasksByColumn[col]?.length ?? 0}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2">
                    {(tasksByColumn[col] ?? []).map((task) => (
                      <KanbanCard
                        key={task.id}
                        task={task}
                        onClick={() => setSelectedTask(task)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            tasks.length > 0 ? (
              <ProjectDAG tasks={tasks} onSelect={setSelectedTask} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No tasks yet.
              </div>
            )
          )}
        </div>

        {/* Task detail panel */}
        {selectedTask && latestRun && (
          <TaskDetailPanel
            task={selectedTask}
            runId={latestRun.id}
            onClose={() => setSelectedTask(null)}
          />
        )}
      </div>
    </div>
  );
}
