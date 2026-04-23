import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import { api } from "@/lib/api";
import { TaskCard } from "./TaskCard";

type Tab = "active" | "history";

interface HistorySession {
  id: string;
  direction: string;
  task_count: number;
  status: string;
  created_at: string;
  tasks?: Array<{ id: string; title: string; status: string; complexity: string }>;
}

function ActiveTab() {
  const { activeTasks, activePlanSessionId } = useAgentStore();

  if (activeTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
        <span>No active plan.</span>
        <code className="px-2 py-1 rounded bg-secondary font-mono text-xs">/plan &lt;direction&gt;</code>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activePlanSessionId && (
        <p className="text-[10px] font-mono text-muted-foreground/50 mb-3">{activePlanSessionId}</p>
      )}
      {activeTasks.map((task) => (
        <TaskCard key={task.id} task={task} allTasks={activeTasks} />
      ))}
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
    <div className="space-y-2">
      {sessions.map((session) => (
        <div key={session.id} className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden">
          <button
            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#1c2128] transition-colors"
            onClick={() => loadSession(session.id)}
          >
            <span className={cn(
              "text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0",
              session.status === "complete" ? "border-green-500/40 text-green-400" :
              session.status === "error"    ? "border-red-500/40 text-red-400" :
              session.status === "running"  ? "border-blue-500/40 text-blue-400" :
                                             "border-[#30363d] text-[#8b949e]"
            )}>
              {session.status}
            </span>
            <span className="flex-1 text-sm text-foreground truncate">{session.direction}</span>
            {planSessionWarnings[session.id] && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/40 text-yellow-400 shrink-0">
                ⚠️ decomposer
              </span>
            )}
            <span className="text-xs text-muted-foreground shrink-0">
              {session.task_count > 0 ? `${session.task_count} task${session.task_count !== 1 ? "s" : ""}` : "—"}
            </span>
          </button>

          {expanded === session.id && sessionTasks[session.id] && (
            <div className="border-t border-[#30363d] px-4 py-3 space-y-1.5">
              {sessionTasks[session.id]!.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <span className={cn(
                    "font-mono px-1 py-0.5 rounded border text-[10px]",
                    t.status === "complete" ? "border-green-500/40 text-green-400" :
                    t.status === "error"    ? "border-red-500/40 text-red-400" :
                                             "border-[#30363d] text-[#8b949e]"
                  )}>
                    {t.status}
                  </span>
                  <span className="text-foreground">{t.title}</span>
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
  const [tab, setTab] = useState<Tab>("active");

  // Switch to active tab automatically when a plan starts
  useEffect(() => {
    if (activePlanSessionId) setTab("active");
  }, [activePlanSessionId]);

  const hasActive = activeTasks.length > 0 || activePlanSessionId !== null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-border">
        {(["active", "history"] as Tab[]).map((t) => (
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
              <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tab === "active" ? <ActiveTab /> : <HistoryTab />}
      </div>
    </div>
  );
}
