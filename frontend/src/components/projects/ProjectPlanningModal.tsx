import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAgentStore } from "@/store/agentStore";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  onClose: () => void;
}

// Tier badge colors for executor_tier display
export const TIER_COLORS: Record<string, string> = {
  qwen:   "border-[#30363d] text-[#8b949e]",
  haiku:  "border-blue-500/40 text-blue-400",
  sonnet: "border-green-500/40 text-green-400",
  opus:   "border-purple-500/40 text-purple-400",
};

export function ProjectPlanningModal({ onClose }: Props) {
  const [name, setName] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [planDocument, setPlanDocument] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentSessionId = useAgentStore((s) => s.currentSessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Detect plan document in assistant messages
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
      // Use the main chat agent with PM system context prepended
      const response = await fetch("http://localhost:8765/api/projects/pm-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          messages: newMessages,
          project_name: name,
        }),
      });
      const data = await response.json() as { reply: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "[Error] Could not reach backend." },
      ]);
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

  const confirmName = async () => {
    if (!name.trim()) return;
    const result = await api.projects.create(name.trim());
    setProjectId(result.project_id);
    setNameConfirmed(true);
    setMessages([{
      role: "assistant",
      content: `Hi! I'm your technical project manager for **${name}**.\n\nTell me what you want to build. I'll ask clarifying questions until we have a solid, unambiguous plan. Don't hold back — the more context you give me, the better I can help.`,
    }]);
  };

  const submitPlan = async () => {
    if (!planDocument || !projectId) return;
    setSubmitting(true);
    try {
      await api.projects.submitPlan(projectId, {
        plan_document: planDocument,
        session_id: currentSessionId,
      });
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-5xl h-[85vh] bg-[#0d1117] border border-[#30363d] rounded-xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d]">
          <div>
            <h2 className="text-sm font-semibold text-foreground">New Project</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {!nameConfirmed ? "Name your project" : `Planning: ${name}`}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-lg">×</button>
        </div>

        {!nameConfirmed ? (
          // Name entry step
          <div className="flex-1 flex items-center justify-center">
            <div className="w-96 space-y-4">
              <p className="text-sm text-muted-foreground text-center">What are you building?</p>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void confirmName()}
                placeholder="e.g. Auth System, API Gateway, Mobile App..."
                className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={() => void confirmName()}
                disabled={!name.trim()}
                className="w-full py-2.5 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Start Planning →
              </button>
            </div>
          </div>
        ) : (
          // Planning session
          <div className="flex-1 flex overflow-hidden">
            {/* Left: Chat */}
            <div className="flex-1 flex flex-col border-r border-[#30363d]">
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {messages.map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-accent/20 border border-accent/30 text-foreground"
                        : "bg-[#161b22] border border-[#30363d] text-foreground"
                    )}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-muted-foreground italic">
                      thinking…
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <div className="px-4 py-3 border-t border-[#30363d]">
                <div className="flex gap-2 items-end bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 focus-within:border-ring transition-colors">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your project… (Enter to send)"
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-foreground resize-none outline-none placeholder:text-muted-foreground min-h-[1.5rem] max-h-[120px]"
                  />
                  <button
                    onClick={() => void sendMessage()}
                    disabled={!input.trim() || loading}
                    className="shrink-0 px-3 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Plan preview */}
            <div className="w-80 flex flex-col">
              <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan Document</span>
                {planDocument && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-500/40 text-green-400">detected</span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {planDocument ? (
                  <pre className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed font-mono">
                    {planDocument}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    The plan document will appear here once Claude outputs it.
                    Tell Claude "the plan is ready" when you're satisfied.
                  </p>
                )}
              </div>
              <div className="px-4 py-3 border-t border-[#30363d]">
                <button
                  onClick={() => void submitPlan()}
                  disabled={!planDocument || submitting}
                  className={cn(
                    "w-full py-2.5 text-sm rounded-lg transition-colors",
                    planDocument
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-[#161b22] border border-[#30363d] text-muted-foreground cursor-not-allowed"
                  )}
                >
                  {submitting ? "Submitting…" : planDocument ? "Submit Plan →" : "Waiting for plan…"}
                </button>
                {!planDocument && (
                  <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                    Plan auto-detects when Claude outputs ## Project:
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
