import React, { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAgentStore } from "@/store/agentStore";

// ── Exported constants (imported by ProjectWorkspace) ────────────────────────

export const TIER_COLORS: Record<string, string> = {
  qwen:   "border-[#30363d] text-[#8b949e]",
  haiku:  "border-blue-500/40 text-blue-400",
  sonnet: "border-green-500/40 text-green-400",
  opus:   "border-purple-500/40 text-purple-400",
};

// ── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ProjectConfig {
  workdir: string;
  agent: "claude" | "codex" | "auto";
  isolation: "worktree" | "shared";
  description: string;
}

interface Props {
  onClose: () => void;
}

// ── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#21262d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex justify-start items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-status-active text-[12px] flex-shrink-0">
        ⬡
      </div>
      <div className="bg-card border border-[#21262d] rounded-[4px_12px_12px_12px] px-3 py-2 text-sm text-muted-foreground flex items-center gap-1.5">
        <span className="italic">thinking</span>
        <span className="flex items-end gap-[3px] pb-[1px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-[3px] h-[3px] rounded-full bg-muted-foreground/60 inline-block"
              style={{ animation: `pmBounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

// ── StepIndicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center px-6">
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all duration-300",
              i < current
                ? "bg-primary border-[1.5px] border-primary text-white"
                : i === current
                ? "bg-primary/10 border-[1.5px] border-primary text-status-active"
                : "bg-card border-[1.5px] border-[#21262d] text-[#484f58]"
            )}>
              {i < current ? "✓" : i + 1}
            </div>
            <span className={cn(
              "text-[12px] whitespace-nowrap transition-colors duration-200",
              i === current
                ? "text-foreground font-semibold"
                : i < current
                ? "text-foreground font-normal"
                : "text-[#484f58]"
            )}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              "flex-1 h-px mx-3 min-w-[24px] transition-colors duration-300",
              i < current ? "bg-primary" : "bg-[#21262d]"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Step 1: Name ─────────────────────────────────────────────────────────────

function StepName({ name, setName, onNext }: {
  name: string;
  setName: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="af-fade-in flex-1 flex items-center justify-center">
      <div className="w-[460px] text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-[#1a6b2b] flex items-center justify-center text-2xl text-white mx-auto mb-5 select-none">
          ⬡
        </div>

        <div className="text-[20px] font-semibold text-foreground mb-1.5">What are you building?</div>
        <div className="text-[13px] text-[#484f58] mb-7">Give your project a name to get started</div>

        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onNext()}
          placeholder="e.g. Auth System, API Gateway, Mobile App..."
          className="w-full px-[18px] py-[14px] rounded-[10px] border-[1.5px] border-border bg-card text-foreground text-[15px] outline-none focus:border-primary transition-colors text-center placeholder:text-[#484f58]"
        />

        <div className="flex gap-1.5 justify-center mt-3.5 flex-wrap">
          {["REST API", "CLI Tool", "Web App", "Data Pipeline", "Microservice"].map((s) => (
            <button
              key={s}
              onClick={() => setName(s)}
              className="px-3 py-1 rounded-full border border-[#21262d] bg-background text-muted-foreground text-[11px] hover:text-foreground hover:border-border transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        <button
          onClick={onNext}
          disabled={!name.trim()}
          className="w-full mt-6 py-3 rounded-[10px] text-[14px] font-medium transition-all duration-200 bg-primary text-white hover:bg-primary/90 disabled:bg-secondary disabled:text-[#484f58] disabled:cursor-not-allowed"
        >
          Start Planning →
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Configure ────────────────────────────────────────────────────────

function StepConfigure({ config, setConfig, onNext, onBack }: {
  config: ProjectConfig;
  setConfig: (fn: (prev: ProjectConfig) => ProjectConfig) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const update = <K extends keyof ProjectConfig>(k: K, v: ProjectConfig[K]) =>
    setConfig((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="af-fade-in flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-[560px] mx-auto w-full space-y-5">
          <div>
            <div className="text-[16px] font-semibold text-foreground mb-1">Configure your project</div>
            <div className="text-[12px] text-[#484f58]">Set up the workspace and agent preferences</div>
          </div>

          {/* Working Directory */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Working Directory
            </label>
            <div className="flex gap-2">
              <div className="flex-1 px-3.5 py-2.5 rounded-lg border border-[#21262d] bg-card text-[13px] font-mono flex items-center gap-2">
                <FolderIcon size={14} className="text-[#484f58]" />
                <span className={config.workdir ? "text-foreground" : "text-[#484f58]"}>
                  {config.workdir || "Select a directory..."}
                </span>
              </div>
              <button
                onClick={() => update("workdir", "~/projects/my-app")}
                className="px-4 py-2.5 rounded-lg border border-border bg-secondary text-foreground text-[12px] hover:bg-secondary/80 transition-colors"
              >
                Browse
              </button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {["~/agentforge", "~/projects/my-app", "New worktree"].map((p) => (
                <button
                  key={p}
                  onClick={() => update("workdir", p)}
                  className={cn(
                    "px-2.5 py-1 rounded border text-[11px] transition-colors",
                    config.workdir === p
                      ? "border-border bg-secondary text-muted-foreground"
                      : "border-[#21262d] bg-transparent text-[#484f58] hover:text-muted-foreground",
                    p !== "New worktree" ? "font-mono" : ""
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Agent */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Primary Agent
            </label>
            <div className="flex gap-2">
              {([
                { id: "claude", label: "Claude Code", desc: "Full-stack, reasoning-heavy tasks" },
                { id: "codex",  label: "Codex CLI",   desc: "Fast code generation and edits" },
                { id: "auto",   label: "Auto",         desc: "Let the planner decide per-task" },
              ] as const).map((a) => (
                <button
                  key={a.id}
                  onClick={() => update("agent", a.id)}
                  className={cn(
                    "flex-1 p-3 rounded-lg text-left border transition-all duration-150",
                    config.agent === a.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-[#21262d] bg-card hover:border-border"
                  )}
                >
                  <div className={cn(
                    "text-[13px] font-medium mb-0.5",
                    config.agent === a.id ? "text-status-active" : "text-foreground"
                  )}>
                    {a.label}
                  </div>
                  <div className="text-[11px] text-[#484f58]">{a.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Workspace Isolation */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Workspace Isolation
            </label>
            <div className="flex gap-2">
              {([
                { id: "worktree", label: "Git Worktrees",    desc: "Each task gets an isolated branch" },
                { id: "shared",   label: "Shared Directory",  desc: "All tasks work in the same dir" },
              ] as const).map((w) => (
                <button
                  key={w.id}
                  onClick={() => update("isolation", w.id)}
                  className={cn(
                    "flex-1 p-3 rounded-lg text-left border transition-all duration-150",
                    config.isolation === w.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-[#21262d] bg-card hover:border-border"
                  )}
                >
                  <div className={cn(
                    "text-[13px] font-medium mb-0.5",
                    config.isolation === w.id ? "text-status-active" : "text-foreground"
                  )}>
                    {w.label}
                  </div>
                  <div className="text-[11px] text-[#484f58]">{w.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1.5">
              Description{" "}
              <span className="font-normal text-[#30363d] normal-case tracking-normal">optional</span>
            </label>
            <textarea
              value={config.description}
              onChange={(e) => setConfig((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of what this project will build..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#21262d] bg-card text-foreground text-[13px] resize-none outline-none focus:border-border transition-colors placeholder:text-[#484f58]"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between px-8 py-4 border-t border-[#21262d] flex-shrink-0">
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-lg border border-[#21262d] bg-transparent text-muted-foreground text-[13px] hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 rounded-lg bg-primary text-white text-[13px] font-medium hover:bg-primary/90 transition-colors"
        >
          Continue to Planning →
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Planning Chat ────────────────────────────────────────────────────

function StepPlanning({ name, projectId, onBack, onClose }: {
  name: string;
  projectId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([{
    role: "assistant",
    content: `Hi! I'm your technical project manager for **${name}**.\n\nTell me what you want to build. I'll ask clarifying questions until we have a solid, unambiguous plan. Don't hold back — the more context you give me, the better I can help.`,
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [planDocument, setPlanDocument] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentSessionId = useAgentStore((s) => s.currentSessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (last && last.content.includes("## Project:")) {
      setPlanDocument(last.content);
    }
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    try {
      const response = await fetch("http://localhost:8765/api/projects/pm-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, messages: newMessages, project_name: name }),
      });
      const data = await response.json() as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "[Error] Could not reach backend." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const submitPlan = async () => {
    if (!planDocument) return;
    setSubmitting(true);
    try {
      await api.projects.submitPlan(projectId, { plan_document: planDocument, session_id: currentSessionId });
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="af-fade-in flex-1 flex overflow-hidden">
      {/* Left: Chat */}
      <div className="flex-1 flex flex-col border-r border-[#21262d]">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start items-start gap-2.5")}>
              {m.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-status-active text-[12px] flex-shrink-0">
                  ⬡
                </div>
              )}
              <div className={cn(
                "max-w-[85%] px-3 py-2 text-[13px] whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-accent/10 border border-accent/20 rounded-[12px_12px_4px_12px] text-foreground"
                  : "bg-card border border-[#21262d] rounded-[4px_12px_12px_12px] text-foreground"
              )}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && <ThinkingIndicator />}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-[#21262d]">
          <div className="flex gap-2 items-end bg-card border border-[#21262d] rounded-lg px-3 py-2 focus-within:border-border transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your project… (Enter to send)"
              rows={1}
              className="flex-1 bg-transparent text-[13px] text-foreground resize-none outline-none placeholder:text-[#484f58] min-h-[1.5rem] max-h-[120px]"
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || loading}
              className="shrink-0 px-3 py-1 text-xs rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Right: Plan preview */}
      <div className="w-80 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Plan Preview</span>
          {planDocument && <div className="w-1.5 h-1.5 rounded-full bg-status-active" />}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {planDocument ? (
            <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap leading-relaxed font-mono">
              {planDocument}
            </pre>
          ) : (
            <div className="text-center pt-10">
              <ClipboardIcon />
              <p className="text-[12px] text-[#484f58] leading-relaxed">
                Task breakdown will appear<br />here once the plan is ready
              </p>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#21262d] space-y-1.5">
          <button
            onClick={() => void submitPlan()}
            disabled={!planDocument || submitting}
            className={cn(
              "w-full py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200",
              planDocument
                ? "bg-primary text-white hover:bg-primary/90 cursor-pointer"
                : "bg-secondary text-[#484f58] cursor-not-allowed"
            )}
          >
            {submitting ? "Submitting…" : planDocument ? "✓ Submit Plan & Execute" : "Waiting for plan..."}
          </button>
          {!planDocument && (
            <p className="text-[10px] text-[#484f58] text-center">
              Auto-detects when Claude outputs <code className="font-mono">## Project:</code>
            </p>
          )}
        </div>
      </div>

      {/* Back button overlay */}
      <button
        onClick={onBack}
        className="absolute bottom-[72px] left-4 px-3 py-1.5 rounded-lg border border-[#21262d] text-[#484f58] text-[11px] hover:text-muted-foreground transition-colors"
      >
        ← Back
      </button>
    </div>
  );
}

// ── Main Modal ───────────────────────────────────────────────────────────────

export function ProjectPlanningModal({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [config, setConfig] = useState<ProjectConfig>({
    workdir: "",
    agent: "auto",
    isolation: "worktree",
    description: "",
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const steps = ["Name", "Configure", "Plan"];

  const modalSubtitle =
    step === 0 ? "Name your project" :
    step === 1 ? "Configure workspace" :
    `Planning: ${name}`;

  const handleNameNext = () => {
    if (name.trim()) setStep(1);
  };

  const handleConfigNext = async () => {
    setCreating(true);
    try {
      const result = await api.projects.create(
        name.trim(),
        config.description.trim() || undefined
      );
      setProjectId(result.project_id);
      setStep(2);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes pmBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes af-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes af-pulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1; }
        }
        .af-fade-in { animation: af-fade-in 0.3s ease both; }
        .af-pulse   { animation: af-pulse 1.4s ease-in-out infinite; }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="w-[90%] max-w-[900px] h-[82vh] bg-[#0d1117] border border-border rounded-[14px] flex flex-col overflow-hidden shadow-2xl relative">

          {/* Header */}
          <div className="px-6 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-[#1a6b2b] flex items-center justify-center text-[13px] text-white select-none">
                ⬡
              </div>
              <div>
                <div className="text-[14px] font-semibold text-foreground">New Project</div>
                <div className="text-[11px] text-[#484f58]">{modalSubtitle}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-[#484f58] hover:text-muted-foreground hover:bg-secondary/50 transition-colors text-[18px]"
            >
              ×
            </button>
          </div>

          {/* Step indicator */}
          <div className="py-3.5 border-b border-[#21262d] flex-shrink-0">
            <StepIndicator current={step} steps={steps} />
          </div>

          {/* Step content */}
          {step === 0 && (
            <StepName name={name} setName={setName} onNext={handleNameNext} />
          )}
          {step === 1 && (
            <StepConfigure
              config={config}
              setConfig={setConfig}
              onNext={() => void handleConfigNext()}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && projectId && (
            <StepPlanning
              name={name}
              projectId={projectId}
              onBack={() => setStep(1)}
              onClose={onClose}
            />
          )}

          {/* Creating spinner overlay on step 1→2 transition */}
          {creating && (
            <div className="absolute inset-0 bg-[#0d1117]/80 flex items-center justify-center z-10">
              <div className="text-[13px] text-[#484f58]">Creating project…</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
