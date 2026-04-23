import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api, type Project } from "@/lib/api";
import { ProjectPlanningModal } from "./ProjectPlanningModal";
import { ProjectWorkspace } from "./ProjectWorkspace";

const STATUS_STYLES: Record<string, string> = {
  planning:    "border-blue-500/40 text-blue-400",
  decomposing: "border-yellow-500/40 text-yellow-400",
  em_review:   "border-yellow-500/40 text-yellow-400",
  executing:   "border-green-500/40 text-green-400 bg-green-500/10",
  paused:      "border-[#30363d] text-[#8b949e]",
  complete:    "border-green-500/40 text-green-400",
  error:       "border-red-500/40 text-red-400",
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const load = () => {
    api.projects.list()
      .then((d) => setProjects(d.projects))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (selectedProject) {
    return (
      <ProjectWorkspace
        projectId={selectedProject}
        onBack={() => { setSelectedProject(null); load(); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-foreground">Projects</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? "Loading…" : `${projects.length} project${projects.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-1.5 text-xs rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
        >
          + New Project
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <p className="text-sm">No projects yet.</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-xs text-primary hover:underline"
            >
              Start a new project →
            </button>
          </div>
        )}
        <div className="space-y-2">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProject(p.id)}
              className="w-full text-left rounded-lg border border-[#30363d] bg-[#161b22] px-4 py-3 hover:border-[#484f58] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0",
                  STATUS_STYLES[p.status] ?? "border-[#30363d] text-[#8b949e]"
                )}>
                  {p.status}
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(p.updated_at)}</span>
              </div>
              {p.description && (
                <p className="mt-1 text-xs text-muted-foreground pl-[72px] truncate">{p.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>

      {showModal && (
        <ProjectPlanningModal
          onClose={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
