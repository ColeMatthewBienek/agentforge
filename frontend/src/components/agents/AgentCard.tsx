import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import type { PoolSlot } from "@/store/agentStore";

const STATUS_STYLES: Record<PoolSlot["status"], string> = {
  starting: "border-blue-500/40 text-blue-400 bg-blue-500/10",
  idle:     "border-[#30363d] text-[#8b949e] bg-transparent",
  busy:     "border-green-500/40 text-green-400 bg-green-500/10",
  stopping: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10",
  error:    "border-red-500/40 text-red-400 bg-red-500/10",
};

const COMPLEXITY_STYLES: Record<string, string> = {
  low:    "border-[#30363d] text-[#8b949e]",
  medium: "border-yellow-500/40 text-yellow-400",
  high:   "border-orange-500/40 text-orange-400",
};

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

interface AgentCardProps {
  slot: PoolSlot;
  idleTimeout: number;
}

export function AgentCard({ slot, idleTimeout }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const outputRef = useRef<HTMLDivElement>(null);

  const activeTasks = useAgentStore((s) => s.activeTasks);
  const taskChunks = useAgentStore((s) => s.taskChunks);

  const task = slot.current_task_id
    ? (activeTasks.find((t) => t.id === slot.current_task_id) ?? null)
    : null;
  const output = slot.current_task_id ? (taskChunks[slot.current_task_id] ?? "") : "";
  const outputLines = output.split("\n").slice(-40).join("\n");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (expanded && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputLines, expanded]);

  const displayUptime = fmtDuration(Math.max(0, slot.uptime_seconds));

  let idleCountdown: string | null = null;
  if (slot.status === "idle" && slot.idle_since) {
    const idleSecs = Math.floor((now - new Date(slot.idle_since).getTime()) / 1000);
    const remaining = Math.max(0, idleTimeout - idleSecs);
    idleCountdown = fmtDuration(remaining);
  }

  return (
    <div
      className={cn(
        "border rounded-md bg-card font-mono text-xs transition-all duration-200",
        slot.status === "busy"
          ? "border-[#30363d] border-l-2 border-l-[#238636]"
          : slot.status === "error"
          ? "border-[#30363d] border-l-2 border-l-[#f85149]"
          : "border-[#30363d]"
      )}
    >
      <div
        className="flex items-center justify-between gap-2 p-3 cursor-pointer select-none hover:bg-secondary/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "text-muted-foreground/50 transition-transform duration-150 flex-shrink-0 text-sm leading-none",
              expanded ? "rotate-90" : ""
            )}
          >
            ›
          </span>
          <span className="text-foreground font-semibold">{slot.slot_id}</span>
          {task && <span className="text-muted-foreground truncate">{task.title}</span>}
          {slot.current_task_title && !task && (
            <span className="text-muted-foreground truncate">{slot.current_task_title}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {slot.status === "busy" && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
          <span className={cn("px-1.5 py-0.5 rounded border text-[10px]", STATUS_STYLES[slot.status])}>
            {slot.status}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#30363d] px-3 pb-3 flex flex-col gap-2">
          {task ? (
            <>
              <div className="flex items-center gap-2 pt-2 flex-wrap">
                <span className={cn("px-1.5 py-0.5 rounded border text-[10px]", COMPLEXITY_STYLES[task.complexity])}>
                  {task.complexity}
                </span>
                <span className="text-muted-foreground/50 font-mono text-[10px]">{task.id}</span>
                {task.worktree_path && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void navigator.clipboard.writeText(task.worktree_path!);
                    }}
                    className="text-[10px] text-muted-foreground/50 hover:text-accent truncate max-w-[200px] transition-colors"
                    title="Click to copy worktree path"
                  >
                    📁 {task.worktree_path.split("/").slice(-2).join("/")}
                  </button>
                )}
              </div>

              <p className="text-muted-foreground/70 text-[10px] leading-relaxed line-clamp-3 whitespace-pre-wrap">
                {task.prompt.slice(0, 300)}
                {task.prompt.length > 300 ? "…" : ""}
              </p>

              <div
                ref={outputRef}
                className="bg-[#0d1117] border border-[#30363d] rounded p-2 h-32 overflow-y-auto"
              >
                {outputLines ? (
                  <pre className="text-green-400/80 text-[10px] leading-relaxed whitespace-pre-wrap break-all">
                    {outputLines}
                  </pre>
                ) : (
                  <span className="text-muted-foreground/40 text-[10px]">
                    {slot.status === "busy" ? "Waiting for output…" : "No output"}
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="pt-2 text-muted-foreground/40 text-[10px]">
              {slot.status === "idle" && idleCountdown !== null
                ? `Idle — shutting down in ${idleCountdown}`
                : "No active task"}
            </div>
          )}
          <div className="text-muted-foreground/40 text-[10px]">up {displayUptime}</div>
        </div>
      )}
    </div>
  );
}
