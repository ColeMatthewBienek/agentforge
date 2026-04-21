import { useAgentStore } from "@/store/agentStore";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  connected: "bg-status-active",
  connecting: "bg-status-busy",
  disconnected: "bg-status-idle",
  error: "bg-status-error",
};

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  const { connectionStatus, selectedAgent } = useAgentStore();

  return (
    <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-background flex-shrink-0">
      <span className="text-sm text-muted-foreground">{title}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono">{selectedAgent}</span>
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            STATUS_COLORS[connectionStatus] ?? "bg-status-idle"
          )}
          title={connectionStatus}
        />
      </div>
    </header>
  );
}
