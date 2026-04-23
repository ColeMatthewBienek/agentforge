import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import type { TaskSpec, PoolSlot } from "@/store/agentStore";

interface TaskNodeProps {
  task: TaskSpec;
  slot: PoolSlot | null;
  onMeasure: () => void;
}

const STATUS_BADGE: Record<TaskSpec["status"], string> = {
  pending:   "border-[#30363d] text-[#8b949e]",
  running:   "border-green-500/40 text-green-400 bg-green-500/10",
  complete:  "border-green-500/40 text-green-400 bg-green-500/10",
  error:     "border-red-500/40 text-red-400 bg-red-500/10",
  cancelled: "border-[#30363d] text-[#8b949e]",
};

const COMPLEXITY_BADGE: Record<TaskSpec["complexity"], string> = {
  low:    "border-[#30363d] text-[#8b949e]",
  medium: "border-yellow-500/40 text-yellow-400",
  high:   "border-orange-500/40 text-orange-400",
};

export const TaskNode = forwardRef<HTMLDivElement, TaskNodeProps>(
  ({ task, slot, onMeasure }, ref) => {
    const [expanded, setExpanded] = useState(false);
    const taskChunks = useAgentStore((s) => s.taskChunks);
    const output = taskChunks[task.id] ?? "";
    const outputLines = output.split("\n").slice(-20).join("\n");

    const borderClass =
      task.status === "running"
        ? "border-[#30363d] border-l-2 border-l-[#238636] shadow-[0_0_8px_rgba(35,134,54,0.15)]"
        : task.status === "complete"
        ? "border-[#238636]/30"
        : task.status === "error"
        ? "border-[#30363d] border-l-2 border-l-[#f85149]"
        : task.status === "cancelled"
        ? "border-[#30363d] opacity-40"
        : "border-[#30363d]";

    return (
      <div
        ref={ref}
        className={cn(
          "bg-card border rounded-md font-mono text-xs cursor-pointer",
          "transition-all duration-200 hover:border-[#484f58]",
          borderClass
        )}
        onClick={() => {
          setExpanded((v) => !v);
          setTimeout(onMeasure, 50);
        }}
      >
        <div className="p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className={cn("px-1 py-0.5 rounded border text-[9px]", STATUS_BADGE[task.status])}>
              {task.status === "running" ? (
                <span className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse inline-block" />
                  running
                </span>
              ) : (
                task.status
              )}
            </span>
            {slot && (
              <span className="text-[9px] text-muted-foreground/50 border border-[#30363d] rounded px-1 py-0.5">
                {slot.slot_id}
              </span>
            )}
          </div>
          <p className="text-foreground line-clamp-2 leading-snug">{task.title}</p>
          <span className={cn("self-start px-1 py-0.5 rounded border text-[9px]", COMPLEXITY_BADGE[task.complexity])}>
            {task.complexity}
          </span>
        </div>

        {expanded && (
          <div className="border-t border-[#30363d] p-2 flex flex-col gap-1.5">
            <p className="text-muted-foreground/60 text-[9px] leading-relaxed line-clamp-2">
              {task.prompt.slice(0, 200)}
            </p>
            {outputLines && (
              <div className="bg-[#0d1117] rounded p-1.5 max-h-24 overflow-y-auto">
                <pre className="text-green-400/70 text-[9px] leading-relaxed whitespace-pre-wrap break-all">
                  {outputLines}
                </pre>
              </div>
            )}
            {task.error && (
              <p className="text-red-400 text-[9px] bg-red-500/10 rounded p-1.5 leading-relaxed">
                {task.error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

TaskNode.displayName = "TaskNode";
