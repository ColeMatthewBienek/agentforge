import { cn } from "@/lib/utils";

function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

const SEED_THREADS = [
  { id: "t1", title: "AgentForge UI redesign",      agent: "claude-0", time: "2m ago",  project: "AgentForge", unread: false },
  { id: "t2", title: "Fix WSL2 path translation",   agent: "claude-0", time: "1h ago",  project: "AgentForge", unread: true  },
  { id: "t3", title: "Memory search performance",   agent: "codex-0",  time: "3h ago",  project: "AgentForge", unread: false },
  { id: "t4", title: "Auth refactor planning",      agent: "claude-0", time: "1d ago",  project: "PepChat",    unread: false },
];

interface ThreadListProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  collapsed?: boolean;
}

export function ThreadList({ activeId, onSelect, onNew, collapsed }: ThreadListProps) {
  if (collapsed) return null;

  // Group by project
  const groups = SEED_THREADS.reduce<Record<string, typeof SEED_THREADS>>((acc, t) => {
    (acc[t.project] = acc[t.project] ?? []).push(t);
    return acc;
  }, {});

  return (
    <div className="w-[260px] flex-shrink-0 bg-background border-r border-[#21262d] flex flex-col overflow-hidden h-screen">
      {/* Header */}
      <div className="px-3.5 py-3.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground tracking-wide">Threads</span>
        <button
          onClick={onNew}
          className="w-6 h-6 rounded-md border border-border bg-transparent text-muted-foreground flex items-center justify-center cursor-pointer text-sm hover:text-foreground transition-colors"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div className="px-2.5 pb-2">
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-[#21262d] bg-card text-xs text-[#484f58]">
          <SearchIcon size={12} />
          <span>Search threads...</span>
        </div>
      </div>

      {/* Thread groups */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {Object.entries(groups).map(([project, threads]) => (
          <div key={project}>
            <div className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest px-2 py-2">
              {project}
            </div>
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => onSelect(thread.id)}
                className={cn(
                  "w-full flex flex-col gap-0.5 px-2.5 py-2 rounded-md cursor-pointer border-l-2 transition-all duration-100 text-left",
                  activeId === thread.id
                    ? "bg-card border-l-primary"
                    : "bg-transparent border-l-transparent hover:bg-secondary/30"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    "text-[13px] truncate",
                    activeId === thread.id ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {thread.title}
                  </span>
                  {thread.unread && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                  )}
                </div>
                <div className="text-[11px] text-[#484f58]">
                  {thread.agent} · {thread.time}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
