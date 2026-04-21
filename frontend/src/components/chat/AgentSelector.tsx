import { useAgentStore } from "@/store/agentStore";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  idle: "bg-status-idle",
  busy: "bg-status-busy",
  active: "bg-status-active",
  error: "bg-status-error",
};

export function AgentSelector() {
  const { selectedAgent, connectionStatus } = useAgentStore();

  const dotColor =
    connectionStatus === "connected"
      ? "bg-status-active"
      : connectionStatus === "connecting"
      ? "bg-status-busy"
      : connectionStatus === "error"
      ? "bg-status-error"
      : "bg-status-idle";

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dotColor)} />
      <span className="text-xs font-mono text-muted-foreground">
        {selectedAgent}
      </span>
      <span
        className={cn(
          "ml-auto text-xs px-2 py-0.5 rounded-full border font-medium",
          connectionStatus === "connected"
            ? "border-status-active/40 text-status-active bg-status-active/10"
            : connectionStatus === "connecting"
            ? "border-status-busy/40 text-status-busy bg-status-busy/10"
            : "border-status-idle/40 text-status-idle bg-status-idle/10"
        )}
      >
        {connectionStatus}
      </span>
    </div>
  );
}
