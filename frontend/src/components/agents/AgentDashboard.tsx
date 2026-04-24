import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import type { PoolSlot } from "@/store/agentStore";
import { AgentCard } from "./AgentCard";
import { TaskDAG } from "./TaskDAG";
import { StatusBadge } from "@/components/shared/StatusBadge";

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, seconds)}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const SLOT_LEFT_BORDER: Record<PoolSlot["status"], string> = {
  busy:     "border-l-[3px] border-l-status-busy",
  starting: "border-l-[3px] border-l-status-busy",
  error:    "border-l-[3px] border-l-status-error",
  stopping: "border-l-[3px] border-l-[#484f58]",
  idle:     "border-l-[3px] border-l-status-idle",
};

function AgentSlotCard({ slot, idleTimeout }: { slot: PoolSlot; idleTimeout: number }) {
  return (
    <div className={cn(
      "p-4 rounded-lg border border-[#21262d] bg-background",
      SLOT_LEFT_BORDER[slot.status] ?? "border-l-[3px] border-l-status-active"
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[14px] font-semibold text-foreground">{slot.slot_id}</span>
          <StatusBadge status={slot.status} />
        </div>
        <span className="text-[11px] text-[#484f58]">Claude Code</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
        <div>
          <div className="text-[#484f58]">Uptime</div>
          <div className="text-muted-foreground font-mono mt-0.5">
            {slot.uptime_seconds ? formatUptime(slot.uptime_seconds) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[#484f58]">Status</div>
          <div className="text-muted-foreground font-mono mt-0.5">{slot.status}</div>
        </div>
        <div className="col-span-2">
          <div className="text-[#484f58]">Task</div>
          <div className={cn("mt-0.5 truncate", slot.current_task_title ? "text-foreground" : "text-[#484f58]")}>
            {slot.current_task_title ?? "No active task"}
          </div>
        </div>
      </div>

      {slot.status !== "stopping" && (
        <div className="flex gap-1.5 pt-2.5 border-t border-[#21262d]">
          <button className="px-2.5 py-1 rounded border border-[#21262d] text-[#484f58] text-[10px] hover:text-muted-foreground transition-colors">
            Restart
          </button>
          <button className="px-2.5 py-1 rounded border border-status-error/30 text-status-error text-[10px] hover:bg-status-error/10 transition-colors">
            Stop
          </button>
        </div>
      )}
    </div>
  );
}

export function AgentDashboard() {
  const poolSlots = useAgentStore((s) => s.poolSlots);
  const idleTimeout = useAgentStore((s) => s.poolIdleTimeout);
  const activeTasks = useAgentStore((s) => s.activeTasks);
  const activePlanSessionId = useAgentStore((s) => s.activePlanSessionId);

  const hasPlan = activePlanSessionId !== null && activeTasks.length > 0;
  const activeCount = poolSlots.filter((s) => s.status !== "stopping" && s.status !== "idle").length;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
        <div>
          <div className="text-[14px] font-semibold text-foreground">Agent Pool</div>
          <div className="text-[11px] text-[#484f58] mt-0.5">
            {activeCount} active, {poolSlots.length} total
            {hasPlan && ` · ${activeTasks.length} tasks in plan`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasPlan && (
            <span className="text-[11px] px-2 py-1 rounded border border-status-active/30 text-status-active bg-status-active/5">
              plan running
            </span>
          )}
          <button className="px-3.5 py-1.5 rounded-md border border-border text-[#484f58] text-[12px] hover:text-muted-foreground transition-colors">
            + Spawn Agent
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {hasPlan ? (
          <TaskDAG tasks={activeTasks} slots={poolSlots} />
        ) : poolSlots.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[13px] text-[#484f58]">
            No agents running — use /plan to spawn parallel agents.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {poolSlots.map((slot) => (
              <AgentSlotCard key={slot.slot_id} slot={slot} idleTimeout={idleTimeout} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
