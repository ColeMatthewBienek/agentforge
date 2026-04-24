import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import { sendNewSession } from "@/lib/agentSocket";

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex:  "Codex CLI",
  gemini: "Gemini CLI",
  ollama: "Ollama",
};

const VALID_PROVIDERS = ["claude", "codex", "gemini", "ollama"];

export function AgentSelector() {
  const { selectedAgent, selectedProvider, setSelectedProvider, connectionStatus } = useAgentStore();
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("http://localhost:8765/api/agents/providers")
      .then((r) => r.json())
      .then((d) => setAvailability((d as { available: Record<string, boolean> }).available))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleProviderChange = (provider: string) => {
    if (!availability[provider]) return;
    setSelectedProvider(provider);
    setOpen(false);
    sendNewSession(provider);
  };

  const dotColor =
    connectionStatus === "connected"   ? "bg-status-active" :
    connectionStatus === "connecting"  ? "bg-status-busy" :
    connectionStatus === "error"       ? "bg-status-error" :
                                         "bg-status-idle";

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border" ref={ref}>
      <span className={cn("w-2 h-2 rounded-full flex-shrink-0", dotColor)} />
      <span className="text-xs font-mono text-muted-foreground">{selectedAgent}</span>

      {/* Provider picker */}
      <div className="relative ml-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#21262d] text-[#484f58] hover:text-muted-foreground hover:border-border transition-colors flex items-center gap-1"
        >
          {selectedProvider}
          <span className="opacity-50">▾</span>
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-30 w-44 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl overflow-hidden">
            {VALID_PROVIDERS.map((p) => {
              const avail = availability[p] !== false; // default true if not yet fetched
              return (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  disabled={!avail}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-left transition-colors",
                    p === selectedProvider
                      ? "bg-primary/10 text-status-active"
                      : avail
                      ? "text-foreground hover:bg-secondary/50"
                      : "opacity-40 cursor-not-allowed text-[#484f58]"
                  )}
                >
                  <span className="text-[12px]">{PROVIDER_LABELS[p] ?? p}</span>
                  {p === selectedProvider && (
                    <span className="text-[10px] text-status-active">✓</span>
                  )}
                  {!avail && (
                    <span className="text-[10px] text-[#484f58]">not found</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <span
        className={cn(
          "ml-auto text-xs px-2 py-0.5 rounded-full border font-medium",
          connectionStatus === "connected"
            ? "border-status-active/40 text-status-active bg-status-active/10"
            : connectionStatus === "connecting"
            ? "border-status-busy/40 text-status-busy bg-status-busy/10"
            : "border-status-idle/40 text-status-idle bg-status-idle/10"
        )}
      >
        {connectionStatus}
      </span>
    </div>
  );
}
