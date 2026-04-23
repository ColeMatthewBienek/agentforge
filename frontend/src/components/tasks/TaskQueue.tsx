import { useEffect, useState } from "react";
import { useAgentStore } from "@/store/agentStore";
import { TaskCard } from "./TaskCard";

interface HistorySession {
  id: string;
  direction: string;
  task_count: number;
  status: string;
  created_at: string;
  tasks?: Array<{ id: string; title: string; status: string; complexity: string }>;
}

export function TaskQueue() {
  const { activeTasks, activePlanSessionId, planSessionWarnings } = useAgentStore();
  const [history, setHistory] = useState<HistorySession[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sessionTasks, setSessionTasks] = useState<Record<string, HistorySession["tasks"]>>({});

  useEffect(() => {
    fetch("/api/tasks/sessions")
      .then((r) => r.json())
      .then((d: { sessions: HistorySession[] }) => setHistory(d.sessions ?? []))
      .catch(() => {});
  }, [activePlanSessionId]);

  const loadSession = async (id: string) => {
    if (sessionTasks[id]) {
      setExpanded(expanded === id ? null : id);
      return;
    }
    try {
      const r = await fetch(`/api/tasks/sessions/${id}`);
      const d = (await r.json()) as HistorySession;
      setSessionTasks((prev) => ({ ...prev, [id]: d.tasks }));
      setExpanded(id);
    } catch {
      setExpanded(id);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 space-y-6">
      {activeTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Active{activePlanSessionId && <span className="ml-2 font-mono text-primary">{activePlanSessionId}</span>}
          </h2>
          <div className="space-y-2">
            {activeTasks.map((task) => (
              <TaskCard key={task.id} task={task} allTasks={activeTasks} />
            ))}
          </div>
        </section>
      )}

      {activeTasks.length === 0 && !activePlanSessionId && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          No active tasks. Use <code className="mx-1 px-1.5 py-0.5 rounded bg-secondary font-mono text-xs">/plan &lt;direction&gt;</code> to start.
        </div>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">History</h2>
          <div className="space-y-2">
            {history.map((session) => (
              <div
                key={session.id}
                className="rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden"
              >
                <button
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[#1c2128] transition-colors"
                  onClick={() => loadSession(session.id)}
                >
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      session.status === "complete"
                        ? "border-green-500/40 text-green-400"
                        : session.status === "error"
                        ? "border-red-500/40 text-red-400"
                        : "border-[#30363d] text-[#8b949e]"
                    }`}
                  >
                    {session.status}
                  </span>
                  <span className="flex-1 text-sm text-foreground truncate">{session.direction}</span>
                  {planSessionWarnings[session.id] && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-yellow-500/40 text-yellow-400 shrink-0">
                      ⚠️ decomposer failed
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">{session.task_count} task{session.task_count !== 1 ? "s" : ""}</span>
                </button>

                {expanded === session.id && sessionTasks[session.id] && (
                  <div className="border-t border-[#30363d] px-4 py-3 space-y-1.5">
                    {sessionTasks[session.id]!.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-mono px-1 py-0.5 rounded border text-[10px] ${
                            t.status === "complete"
                              ? "border-green-500/40 text-green-400"
                              : t.status === "error"
                              ? "border-red-500/40 text-red-400"
                              : "border-[#30363d] text-[#8b949e]"
                          }`}
                        >
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
        </section>
      )}
    </div>
  );
}
