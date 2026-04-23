import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore, type TaskSpec } from "@/store/agentStore";
import { TaskDetail } from "./TaskDetail";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-[#30363d] text-[#8b949e] bg-transparent",
  running: "border-green-500/40 text-green-400 bg-green-500/10",
  complete: "border-green-500/40 text-green-400 bg-green-500/10",
  error: "border-red-500/40 text-red-400 bg-red-500/10",
  cancelled: "border-[#30363d] text-[#8b949e] bg-transparent line-through",
};

const COMPLEXITY_STYLES: Record<string, string> = {
  low: "border-[#30363d] text-[#8b949e]",
  medium: "border-yellow-500/40 text-yellow-400",
  high: "border-orange-500/40 text-orange-400",
};

const LEFT_BORDER: Record<string, string> = {
  running: "border-l-2 border-l-[#238636]",
  error: "border-l-2 border-l-[#f85149]",
};

function Elapsed({ startedAt, endedAt }: { startedAt: string; endedAt: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endedAt]);
  const end = endedAt ? new Date(endedAt).getTime() : now;
  const s = Math.floor((end - new Date(startedAt).getTime()) / 1000);
  if (s < 60) return <span>{s}s</span>;
  return <span>{Math.floor(s / 60)}m {s % 60}s</span>;
}

interface TaskCardProps {
  task: TaskSpec;
  allTasks: TaskSpec[];
}

export function TaskCard({ task, allTasks }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
  };

  const depTasks = task.dependencies.map((dep) => allTasks.find((t) => t.id === dep)).filter(Boolean) as TaskSpec[];

  return (
    <div
      className={cn(
        "rounded-lg border border-[#30363d] bg-[#161b22] overflow-hidden cursor-pointer transition-colors hover:border-[#484f58]",
        LEFT_BORDER[task.status] ?? ""
      )}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
            <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", STATUS_STYLES[task.status])}>
              {task.status}
              {task.status === "running" && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              )}
            </span>
            <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", COMPLEXITY_STYLES[task.complexity])}>
              {task.complexity}
            </span>
            {task.slot_id && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-primary/30 text-primary">
                {task.slot_id}
              </span>
            )}
          </div>

          {depTasks.length > 0 && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {depTasks.map((dep) => (
                <span
                  key={dep.id}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border font-mono",
                    dep.status === "complete"
                      ? "border-green-500/40 text-green-400"
                      : "border-[#30363d] text-[#8b949e]"
                  )}
                >
                  {dep.title.slice(0, 20)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
          {(task.status === "running" || task.status === "complete") && task.created_at && (
            <Elapsed startedAt={task.created_at} endedAt={task.completed_at} />
          )}
          {(task.status === "pending" || task.status === "running") && (
            <button
              onClick={handleCancel}
              className="px-2 py-0.5 rounded border border-red-500/30 text-red-400 text-[10px] hover:bg-red-500/10 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {expanded && <TaskDetail task={task} />}
    </div>
  );
}
