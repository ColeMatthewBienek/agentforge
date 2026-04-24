import { cn } from "@/lib/utils";

interface ScheduledJob {
  id: string;
  name: string;
  trigger: string;
  schedule: string;
  agent: string;
  lastRun: string | null;
  nextRun: string | null;
  enabled: boolean;
}

// Static mock data — no /api/schedule endpoint exists yet
const MOCK_JOBS: ScheduledJob[] = [
  {
    id: "1",
    name: "Daily Memory Digest",
    trigger: "cron",
    schedule: "0 9 * * *",
    agent: "claude-0",
    lastRun: "2026-04-22T09:00:00Z",
    nextRun: "2026-04-23T09:00:00Z",
    enabled: true,
  },
  {
    id: "2",
    name: "Weekly Project Report",
    trigger: "cron",
    schedule: "0 10 * * 1",
    agent: "claude-0",
    lastRun: "2026-04-15T10:00:00Z",
    nextRun: "2026-04-28T10:00:00Z",
    enabled: true,
  },
  {
    id: "3",
    name: "Stale Task Cleanup",
    trigger: "webhook",
    schedule: "on push",
    agent: "claude-1",
    lastRun: null,
    nextRun: null,
    enabled: false,
  },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ScheduleView() {
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
        <div>
          <div className="text-[14px] font-semibold text-foreground">Scheduled Jobs</div>
          <div className="text-[11px] text-[#484f58] mt-0.5">{MOCK_JOBS.length} jobs configured</div>
        </div>
        <button className="px-3.5 py-1.5 rounded-md border border-primary/40 text-primary text-[12px] hover:bg-primary/10 transition-colors font-medium">
          + New Job
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="text-[10px] text-[#484f58] mb-3 px-1">
          Mock data — wire to <code className="font-mono">GET /api/schedule</code> when endpoint exists
        </div>
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr>
              {["", "Name", "Trigger", "Schedule", "Agent", "Last Run", "Next Run", ""].map((col, i) => (
                <th
                  key={i}
                  className="text-left text-[10px] uppercase tracking-widest text-[#484f58] font-semibold pb-2 pr-4"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_JOBS.map((job) => (
              <tr
                key={job.id}
                className={cn("border-b border-[#21262d]", !job.enabled && "opacity-50")}
              >
                <td className="py-3 pr-3 w-6">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    job.enabled ? "bg-status-active" : "bg-[#484f58]"
                  )} />
                </td>
                <td className="py-3 pr-4 text-foreground font-medium">{job.name}</td>
                <td className="py-3 pr-4">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#21262d] text-muted-foreground">
                    {job.trigger}
                  </span>
                </td>
                <td className="py-3 pr-4 font-mono text-muted-foreground">{job.schedule}</td>
                <td className="py-3 pr-4 text-[#484f58]">{job.agent}</td>
                <td className="py-3 pr-4 text-[#484f58]">{formatDateTime(job.lastRun)}</td>
                <td className="py-3 pr-4 text-[#484f58]">{formatDateTime(job.nextRun)}</td>
                <td className="py-3">
                  <button className="px-2 py-1 rounded border border-status-active/30 text-status-active text-[10px] hover:bg-status-active/10 transition-colors whitespace-nowrap">
                    Run Now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
