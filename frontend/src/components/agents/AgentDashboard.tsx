import { useAgentStore } from "@/store/agentStore";
import { AgentCard } from "./AgentCard";
import { TaskDAG } from "./TaskDAG";

export function AgentDashboard() {
  const poolSlots = useAgentStore((s) => s.poolSlots);
  const idleTimeout = useAgentStore((s) => s.poolIdleTimeout);
  const activeTasks = useAgentStore((s) => s.activeTasks);
  const activePlanSessionId = useAgentStore((s) => s.activePlanSessionId);

  const hasPlan = activePlanSessionId !== null && activeTasks.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-foreground">Agent Pool</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {poolSlots.length === 0
              ? "No agents running"
              : `${poolSlots.length} slot${poolSlots.length !== 1 ? "s" : ""} active`}
            {hasPlan && ` · ${activeTasks.length} tasks in plan`}
          </p>
        </div>
        {hasPlan && (
          <span className="text-xs px-2 py-1 rounded border border-green-500/30 text-green-400 bg-green-500/5">
            plan running
          </span>
        )}
      </header>

      <div className="flex-1 overflow-auto p-4">
        {hasPlan ? (
          <TaskDAG tasks={activeTasks} slots={poolSlots} />
        ) : poolSlots.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No agents running — use /plan to spawn parallel agents.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {poolSlots.map((slot) => (
              <AgentCard key={slot.slot_id} slot={slot} idleTimeout={idleTimeout} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
