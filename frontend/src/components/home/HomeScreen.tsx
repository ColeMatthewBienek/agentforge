import { useEffect, useState } from "react";
import { api, type Project } from "@/lib/api";
import { useAgentStore } from "@/store/agentStore";

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  executing: "bg-status-active",
  complete:  "bg-status-active",
  planning:  "bg-accent",
  paused:    "bg-status-idle",
  error:     "bg-status-error",
};

const CHIPS = ["Review today's changes", "Refactor auth module", "Write unit tests"];

interface HomeScreenProps {
  onNavigate: (view: string) => void;
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const activeTasks = useAgentStore((s) => s.activeTasks);

  useEffect(() => {
    api.projects.list().then((d) => setProjects(d.projects.slice(0, 3))).catch(() => {});
  }, []);

  return (
    <div className="flex-1 overflow-auto flex flex-col items-center pt-12 pb-8 px-6">
      {/* Hero */}
      <div className="text-[22px] font-semibold text-foreground mb-1.5">What should we build?</div>
      <div className="text-[13px] text-[#484f58] mb-6">
        Start a conversation, plan a project, or dispatch a task
      </div>

      {/* Prompt bar */}
      <div className="max-w-[620px] w-full mb-3">
        <div className="rounded-[10px] border border-border bg-card flex items-center px-4 py-1 pr-1">
          <span className="text-[#484f58] flex-shrink-0 mr-2">
            <PlusIcon size={16} />
          </span>
          <input
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-[#484f58] outline-none py-2.5"
            placeholder="Describe a task, or use / for commands..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                onNavigate("chat");
              }
            }}
          />
          <button
            onClick={() => onNavigate("chat")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-[13px] font-medium cursor-pointer hover:bg-primary/90 transition-colors"
          >
            Plan <span className="text-[11px] opacity-70">→</span>
          </button>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="flex gap-1.5 mb-10 flex-wrap justify-center">
        {CHIPS.map((s) => (
          <button
            key={s}
            onClick={() => onNavigate("chat")}
            className="px-3 py-1 rounded-full border border-[#21262d] text-[12px] text-muted-foreground bg-card cursor-pointer hover:text-foreground hover:border-border transition-colors"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Dashboard grid */}
      <div className="max-w-[800px] w-full grid grid-cols-2 gap-3.5">
        {/* Recent Projects */}
        <div className="rounded-[10px] border border-[#21262d] bg-background overflow-hidden">
          <div className="px-3.5 py-3 border-b border-[#21262d] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-foreground">Recent Projects</span>
            <button
              onClick={() => onNavigate("projects")}
              className="text-[11px] text-accent cursor-pointer hover:underline"
            >
              View all →
            </button>
          </div>
          {projects.length === 0 ? (
            <div className="px-3.5 py-3 text-[12px] text-[#484f58] italic">No projects yet</div>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                onClick={() => onNavigate("projects")}
                className="px-3.5 py-2.5 border-b last:border-0 border-[#21262d] flex items-center gap-2.5 cursor-pointer hover:bg-card/50 transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[p.status] ?? "bg-status-idle"}`} />
                <span className="flex-1 text-[13px] text-foreground truncate">{p.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#21262d] text-[#484f58]">
                  {p.status}
                </span>
                <span className="text-[11px] text-[#484f58] shrink-0">{timeAgo(p.updated_at)}</span>
              </div>
            ))
          )}
        </div>

        {/* Active Tasks */}
        <div className="rounded-[10px] border border-[#21262d] bg-background overflow-hidden">
          <div className="px-3.5 py-3 border-b border-[#21262d] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-foreground">Active Tasks</span>
            <button
              onClick={() => onNavigate("tasks")}
              className="text-[11px] text-accent cursor-pointer hover:underline"
            >
              View all →
            </button>
          </div>
          {activeTasks.length === 0 ? (
            <div className="px-3.5 py-3 text-[12px] text-[#484f58] italic">No active tasks</div>
          ) : (
            activeTasks.slice(0, 3).map((t) => (
              <div
                key={t.id}
                onClick={() => onNavigate("tasks")}
                className="px-3.5 py-2.5 border-b last:border-0 border-[#21262d] flex items-center gap-2.5 cursor-pointer hover:bg-card/50 transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[t.status] ?? "bg-status-idle"}`} />
                <span className="flex-1 text-[13px] text-foreground truncate">{t.title}</span>
                {t.slot_id && (
                  <span className="text-[11px] font-mono text-[#484f58] shrink-0">{t.slot_id}</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
