import { useAgentStore } from "@/store/agentStore";
import { AgentCard } from "./AgentCard";

export function AgentDashboard() {
  const poolSlots = useAgentStore((s) => s.poolSlots);
  const idleTimeout = useAgentStore((s) => s.poolIdleTimeout);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border">
        <h1 className="text-base font-semibold text-foreground">Agent Pool</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {poolSlots.length === 0
            ? "No agents running"
            : `${poolSlots.length} slot${poolSlots.length !== 1 ? "s" : ""} active`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {poolSlots.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            No agents running — dispatch a parallel task to spawn one.
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
