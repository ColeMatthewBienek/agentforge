import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import type { PoolSlot } from "@/store/agentStore";

const SLOT_DOT: Record<PoolSlot["status"], string> = {
  busy:     "bg-status-busy",
  starting: "bg-status-busy",
  idle:     "bg-status-idle",
  error:    "bg-status-error",
  stopping: "bg-[#484f58]",
};

const SLOT_BADGE: Record<PoolSlot["status"], string> = {
  idle:     "border-status-idle/30 text-status-idle bg-status-idle/5",
  busy:     "border-status-busy/30 text-status-busy bg-status-busy/5",
  starting: "border-status-busy/30 text-status-busy bg-status-busy/5",
  error:    "border-status-error/30 text-status-error bg-status-error/5",
  stopping: "border-[#484f58]/30 text-[#484f58] bg-transparent",
};

export function AgentStatusBar() {
  const poolSlots = useAgentStore((s) => s.poolSlots);

  return (
    <div className="h-9 border-b border-[#21262d] bg-background flex items-center px-4 gap-3 text-[11px] flex-shrink-0">
      <span className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest">Agents</span>
      <div className="w-px h-3.5 bg-[#21262d]" />

      {poolSlots.length === 0 ? (
        <span className="text-[10px] text-[#484f58]">No agents running</span>
      ) : (
        poolSlots.map((slot) => (
          <div key={slot.slot_id} className="flex items-center gap-1.5">
            <div
              className={cn("w-1.5 h-1.5 rounded-full", SLOT_DOT[slot.status] ?? "bg-status-active")}
              style={slot.status === "busy" ? { boxShadow: "0 0 6px #3fb95060" } : undefined}
            />
            <span className="font-mono text-muted-foreground">{slot.slot_id}</span>
            <span className={cn("text-[10px] px-1.5 rounded border", SLOT_BADGE[slot.status] ?? "border-status-active/30 text-status-active bg-status-active/5")}>
              {slot.status}
            </span>
            {slot.current_task_title && (
              <span className="text-[10px] text-[#484f58] max-w-[140px] truncate">
                — {slot.current_task_title}
              </span>
            )}
          </div>
        ))
      )}

      <div className="flex-1" />
      <span className="text-[10px] text-[#484f58]">
        {poolSlots.filter((s) => s.status !== "stopping").length}/{poolSlots.length} online
      </span>
    </div>
  );
}
