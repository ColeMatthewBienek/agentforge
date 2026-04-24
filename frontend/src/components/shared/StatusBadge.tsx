import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  planning:    "border-accent/40 text-accent",
  decomposing: "border-status-busy/40 text-status-busy",
  em_review:   "border-status-busy/40 text-status-busy",
  executing:   "border-status-active/40 text-status-active bg-status-active/10",
  paused:      "border-border text-muted-foreground",
  complete:    "border-status-active/40 text-status-active",
  error:       "border-status-error/40 text-status-error",
  idle:        "border-status-idle/40 text-status-idle",
  busy:        "border-status-busy/40 text-status-busy",
  starting:    "border-status-busy/40 text-status-busy",
  streaming:   "border-status-active/40 text-status-active",
  stopped:     "border-[#484f58]/40 text-[#484f58]",
  stopping:    "border-[#484f58]/40 text-[#484f58]",
  archived:    "border-border text-muted-foreground",
  running:     "border-status-busy/40 text-status-busy",
  pending:     "border-border text-muted-foreground",
  cancelled:   "border-border text-[#484f58]",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "text-[10px] font-mono px-1.5 py-0.5 rounded border",
      STATUS_STYLES[status] ?? "border-border text-muted-foreground"
    )}>
      {status}
    </span>
  );
}
