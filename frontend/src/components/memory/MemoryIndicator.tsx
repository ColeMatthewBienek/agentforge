import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore, type MemoryStatus, type RecentMemory } from "@/store/agentStore";

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const STATUS_DOT: Record<MemoryStatus, string> = {
  idle: "bg-muted-foreground/40",
  processing: "bg-blue-400 animate-pulse",
  stored: "bg-green-500",
  error: "bg-red-500",
};

const STATUS_LABEL: Record<MemoryStatus, string> = {
  idle: "Memory",
  processing: "Storing...",
  stored: "Stored",
  error: "Memory error",
};

function MemoryPanel({ memories }: { memories: RecentMemory[] }) {
  return (
    <div className="absolute bottom-full right-0 mb-2 w-80 bg-card border border-border rounded-lg shadow-xl overflow-hidden z-50">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-foreground">Recent memories — this session</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {memories.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">No memories stored yet.</div>
        ) : (
          memories.map((m) => (
            <div key={m.record_id} className="flex items-start gap-2 px-3 py-2 border-b border-border/50 last:border-0">
              <span
                className={cn(
                  "shrink-0 text-[10px] font-mono px-1 py-0.5 rounded border mt-px",
                  m.role === "user"
                    ? "border-accent/40 text-accent"
                    : "border-primary/40 text-primary"
                )}
              >
                {m.role === "user" ? "user" : "asst"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{m.preview}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(m.created_at)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-border">
        <span className="text-[10px] text-muted-foreground">Memory Browser coming soon</span>
      </div>
    </div>
  );
}

export function MemoryIndicator() {
  const [open, setOpen] = useState(false);
  const memoryStatus = useAgentStore((s) => s.memoryStatus);
  const recentMemories = useAgentStore((s) => s.recentMemories);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-colors", STATUS_DOT[memoryStatus])} />
        {STATUS_LABEL[memoryStatus]}
      </button>
      {open && <MemoryPanel memories={recentMemories} />}
    </div>
  );
}
