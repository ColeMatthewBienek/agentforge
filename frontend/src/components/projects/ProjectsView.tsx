import { useEffect, useRef, useState } from "react";
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

interface EditModalProps {
  project: Project;
  onSave: (name: string, description: string) => void;
  onClose: () => void;
}

function EditModal({ project, onSave, onClose }: EditModalProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-sm font-semibold text-foreground mb-4">Edit Project</h2>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary transition-colors resize-none"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onSave(name.trim(), description.trim())}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProjectMenuProps {
  project: Project;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function ProjectMenu({ project, onEdit, onArchive, onDelete, onClose }: ProjectMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-20 w-40 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl overflow-hidden"
    >
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-secondary/50 transition-colors text-left"
      >
        <span>✎</span> Edit
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onArchive(); }}
        disabled={!!project.archived_at}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
      >
        <span>📦</span> {project.archived_at ? "Archived" : "Archive"}
      </button>
      <div className="border-t border-[#30363d] my-0.5" />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors text-left"
      >
        <span>🗑</span> Delete
      </button>
    </div>
  );
}

export function ProjectsView() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = (archived = showArchived) => {
    api.projects.list(archived)
      .then((d) => setProjects(d.projects))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleArchive = async (p: Project) => {
    setMenuOpenId(null);
    if (!confirm(`Archive "${p.name}"? Key data will be saved to memory and searchable via /recall.`)) return;
    await api.projects.archive(p.id);
    load();
  };

  const handleDelete = async (p: Project) => {
    setMenuOpenId(null);
    if (!confirm(`Permanently delete "${p.name}" and all its runs and tasks? This cannot be undone.`)) return;
    await api.projects.delete(p.id);
    load();
  };

  const handleSaveEdit = async (name: string, description: string) => {
    if (!editingProject) return;
    await api.projects.edit(editingProject.id, { name, description });
    setEditingProject(null);
    load();
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    load(next);
  };

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
        <div className="flex items-center gap-2">
          <button
            onClick={toggleArchived}
            className={cn(
              "px-2.5 py-1 text-xs rounded border transition-colors",
              showArchived
                ? "border-accent/40 text-accent bg-accent/10"
                : "border-[#30363d] text-muted-foreground hover:text-foreground"
            )}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 text-xs rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
          >
            + New Project
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <p className="text-sm">No projects yet.</p>
            <button onClick={() => setShowModal(true)} className="text-xs text-primary hover:underline">
              Start a new project →
            </button>
          </div>
        )}
        <div className="space-y-2">
          {projects.map((p) => (
            <div
              key={p.id}
              className={cn(
                "relative rounded-lg border border-[#30363d] bg-[#161b22] hover:border-[#484f58] transition-colors group",
                p.archived_at && "opacity-60"
              )}
            >
              <button
                onClick={() => { setMenuOpenId(null); setSelectedProject(p.id); }}
                className="w-full text-left px-4 py-3 pr-12"
              >
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0",
                    p.archived_at
                      ? "border-[#30363d] text-[#8b949e]"
                      : STATUS_STYLES[p.status] ?? "border-[#30363d] text-[#8b949e]"
                  )}>
                    {p.archived_at ? "archived" : p.status}
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{timeAgo(p.updated_at)}</span>
                </div>
                {p.description && (
                  <p className="mt-1 text-xs text-muted-foreground pl-[72px] truncate">{p.description}</p>
                )}
              </button>

              {/* ··· menu button */}
              <div className="absolute right-3 top-3">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === p.id ? null : p.id); }}
                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 opacity-0 group-hover:opacity-100 transition-all text-xs"
                >
                  ···
                </button>
                {menuOpenId === p.id && (
                  <ProjectMenu
                    project={p}
                    onEdit={() => { setMenuOpenId(null); setEditingProject(p); }}
                    onArchive={() => void handleArchive(p)}
                    onDelete={() => void handleDelete(p)}
                    onClose={() => setMenuOpenId(null)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <ProjectPlanningModal onClose={() => { setShowModal(false); load(); }} />
      )}
      {editingProject && (
        <EditModal
          project={editingProject}
          onSave={(n, d) => void handleSaveEdit(n, d)}
          onClose={() => setEditingProject(null)}
        />
      )}
    </div>
  );
}
