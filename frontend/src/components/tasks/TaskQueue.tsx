import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import { api } from "@/lib/api";
import type { TaskSpec } from "@/store/agentStore";

interface HistorySession {
  id: string;
  direction: string;
  task_count: number;
  status: string;
  created_at: string;
  tasks?: Array<{ id: string; title: string; status: string; complexity: string }>;
}

const PRIORITY_COLORS: Record<string, string> = {
  high:   "border-status-error/30 text-status-error",
  medium: "border-status-busy/30 text-status-busy",
  low:    "border-status-idle/40 text-status-idle",
};

function PriorityBadge({ complexity }: { complexity: string }) {
  return (
    <span className={cn(
      "text-[9px] px-1.5 py-0.5 rounded border font-mono",
      PRIORITY_COLORS[complexity] ?? "border-border text-muted-foreground"
    )}>
      {complexity}
    </span>
  );
}

const COLUMN_COLORS: Record<string, string> = {
  pending:    "bg-status-idle",
  running:    "bg-status-busy",
  complete:   "bg-status-active",
  error:      "bg-status-error",
  cancelled:  "bg-[#484f58]",
};

interface Column {
  key: TaskSpec["status"];
  label: string;
  color: string;
}

const COLUMNS: Column[] = [
  { key: "pending",   label: "Pending",    color: COLUMN_COLORS.pending },
  { key: "running",   label: "In Progress", color: COLUMN_COLORS.running },
  { key: "complete",  label: "Done",        color: COLUMN_COLORS.complete },
  { key: "error",     label: "Error",       color: COLUMN_COLORS.error },
  { key: "cancelled", label: "Cancelled",   color: COLUMN_COLORS.cancelled },
];

function KanbanCard({ task }: { task: TaskSpec }) {
  return (
    <div className="p-2.5 px-3 rounded-md border border-[#21262d] bg-background cursor-pointer hover:border-border transition-colors">
      <div className="text-[12px] text-foreground mb-2 leading-snug">{task.title}</div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#484f58]">{task.slot_id ?? "unassigned"}</span>
        <PriorityBadge complexity={task.complexity} />
      </div>
    </div>
  );
}

function KanbanView({ tasks }: { tasks: TaskSpec[] }) {
  const grouped = COLUMNS.map((col) => ({
    ...col,
    tasks: tasks.filter((t) => t.status === col.key),
  }));

  return (
    <div className="flex gap-3 p-4 flex-1 overflow-x-auto">
      {grouped.map((col) => (
        <div key={col.key} className="flex-shrink-0 w-[220px] flex flex-col">
          <div className="flex items-center gap-2 mb-2.5 px-1">
            <div className={cn("w-2 h-2 rounded-full", col.color)} />
            <span className="text-[12px] font-semibold text-foreground">{col.label}</span>
            <span className="text-[11px] text-[#484f58]">{col.tasks.length}</span>
          </div>
          <div className="space-y-1.5 flex-1">
            {col.tasks.map((task) => (
              <KanbanCard key={task.id} task={task} />
            ))}
          </div>
          <div className="px-2 py-2 text-center text-[11px] text-[#484f58] cursor-pointer hover:text-muted-foreground transition-colors">
            + Add task
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyKanban() {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
      <span>No active plan.</span>
      <code className="px-2 py-1 rounded bg-secondary font-mono text-xs">/plan &lt;direction&gt;</code>
    </div>
  );
}

function HistoryTab() {
  const { planSessionWarnings } = useAgentStore();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sessionTasks, setSessionTasks] = useState<Record<string, HistorySession["tasks"]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<{ sessions: HistorySession[] }>("/api/tasks/sessions")
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadSession = async (id: string) => {
    if (sessionTasks[id]) {
      setExpanded(expanded === id ? null : id);
      return;
    }
    try {
      const d = await api.get<HistorySession>(`/api/tasks/sessions/${id}`);
      setSessionTasks((prev) => ({ ...prev, [id]: d.tasks }));
      setExpanded(id);
    } catch {
      setExpanded(id);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">Loading…</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        No plan history yet.
      </div>
    );
  }

  return (
    <div className="space-y-2 px-4 py-4">
      {sessions.map((session) => (
        <div key={session.id} className="rounded-lg border border-[#21262d] bg-background overflow-hidden">
          <button
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-secondary/30 transition-colors"
            onClick={() => void loadSession(session.id)}
          >
            <span className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0",
              session.status === "complete" ? "border-status-active/40 text-status-active" :
              session.status === "error"    ? "border-status-error/40 text-status-error" :
              session.status === "running"  ? "border-status-busy/40 text-status-busy" :
                                             "border-[#21262d] text-[#484f58]"
            )}>
              {session.status}
            </span>
            <span className="flex-1 text-[13px] text-foreground truncate">{session.direction}</span>
            {planSessionWarnings[session.id] && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/40 text-yellow-400 shrink-0">
                ⚠ decomposer
              </span>
            )}
            <span className="text-[11px] text-[#484f58] shrink-0">
              {session.task_count > 0 ? `${session.task_count} task${session.task_count !== 1 ? "s" : ""}` : "—"}
            </span>
          </button>

          {expanded === session.id && sessionTasks[session.id] && (
            <div className="border-t border-[#21262d] px-4 py-3 space-y-1.5">
              {sessionTasks[session.id]!.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <span className={cn(
                    "font-mono px-1 py-0.5 rounded border text-[10px]",
                    t.status === "complete" ? "border-status-active/40 text-status-active" :
                    t.status === "error"    ? "border-status-error/40 text-status-error" :
                                             "border-[#21262d] text-[#484f58]"
                  )}>
                    {t.status}
                  </span>
                  <span className="text-[12px] text-foreground">{t.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function TaskQueue() {
  const activePlanSessionId = useAgentStore((s) => s.activePlanSessionId);
  const activeTasks = useAgentStore((s) => s.activeTasks);
  const [tab, setTab] = useState<"active" | "history">("active");

  useEffect(() => {
    if (activePlanSessionId) setTab("active");
  }, [activePlanSessionId]);

  const hasActive = activeTasks.length > 0 || activePlanSessionId !== null;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
        <div className="text-[14px] font-semibold text-foreground">Task Queue</div>
        <button className="px-3.5 py-1.5 rounded-md border border-border text-[#484f58] text-[12px] hover:text-muted-foreground transition-colors">
          + New Task
        </button>
      </div>

      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-[#21262d]">
        {(["active", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors capitalize",
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
            {t === "active" && hasActive && (
              <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-status-active animate-pulse inline-block" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "active" ? (
          activeTasks.length === 0 ? (
            <EmptyKanban />
          ) : (
            <KanbanView tasks={activeTasks} />
          )
        ) : (
          <div className="flex-1 overflow-y-auto">
            <HistoryTab />
          </div>
        )}
      </div>
    </div>
  );
}
