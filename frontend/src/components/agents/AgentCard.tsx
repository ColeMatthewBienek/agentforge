import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { PoolSlot } from "@/store/agentStore";

const STATUS_STYLES: Record<PoolSlot["status"], string> = {
  starting: "border-blue-500/40 text-blue-400 bg-blue-500/10",
  idle:     "border-[#30363d] text-[#8b949e] bg-transparent",
  busy:     "border-green-500/40 text-green-400 bg-green-500/10",
  stopping: "border-yellow-500/40 text-yellow-400 bg-yellow-500/10",
  error:    "border-red-500/40 text-red-400 bg-red-500/10",
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const uptime = slot.uptime_seconds + Math.floor((now - Date.now()) / 1000);
  const displayUptime = fmtDuration(Math.max(0, slot.uptime_seconds));

  let idleCountdown: string | null = null;
  if (slot.status === "idle" && slot.idle_since) {
    const idleSecs = Math.floor((now - new Date(slot.idle_since).getTime()) / 1000);
    const remaining = Math.max(0, idleTimeout - idleSecs);
    idleCountdown = fmtDuration(remaining);
  }

  void uptime;

  return (
    <div className="border border-[#30363d] rounded-md p-3 bg-card font-mono text-xs flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground font-semibold">{slot.slot_id}</span>
        <span className={cn("px-1.5 py-0.5 rounded border text-[10px]", STATUS_STYLES[slot.status])}>
          {slot.status}
        </span>
      </div>

      {slot.current_task_title && (
        <p className="text-muted-foreground truncate" title={slot.current_task_title}>
          {slot.current_task_title}
        </p>
      )}
      {slot.current_task_id && !slot.current_task_title && (
        <p className="text-muted-foreground truncate">task {slot.current_task_id.slice(0, 8)}</p>
      )}

      <div className="flex items-center justify-between text-muted-foreground/70">
        <span>up {displayUptime}</span>
        {idleCountdown !== null && (
          <span className="text-yellow-500/70">shutting down in {idleCountdown}</span>
        )}
      </div>
    </div>
  );
}
