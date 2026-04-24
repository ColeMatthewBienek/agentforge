import { useAgentStore } from "@/store/agentStore";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold text-[#484f58] uppercase tracking-widest px-3.5 pt-3 pb-1.5">
      {children}
    </div>
  );
}

function PinIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-accent flex-shrink-0 mt-px">
      <path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

interface ContextPanelProps {
  visible: boolean;
  onClose: () => void;
}

const QUICK_ACTIONS = ["/plan", "/build", "/recall", "/remember"];

export function ContextPanel({ visible, onClose }: ContextPanelProps) {
  const recentMemories = useAgentStore((s) => s.recentMemories);
  const poolSlots = useAgentStore((s) => s.poolSlots);
  const activeProjectId = useAgentStore((s) => s.activeProjectId);

  if (!visible) return null;

  return (
    <div className="w-[280px] flex-shrink-0 bg-background border-l border-[#21262d] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-3 border-b border-[#21262d] flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">Context</span>
        <button
          onClick={onClose}
          className="text-[#484f58] hover:text-muted-foreground text-base leading-none transition-colors"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Project */}
        {activeProjectId && (
          <>
            <SectionLabel>Project</SectionLabel>
            <div className="px-3.5 pb-2">
              <div className="p-2.5 rounded-lg border border-[#21262d] bg-card">
                <p className="text-xs text-foreground font-medium truncate">{activeProjectId}</p>
                <p className="text-[11px] text-[#484f58] mt-0.5">executing</p>
              </div>
            </div>
          </>
        )}

        {/* Injected Memory */}
        <SectionLabel>Injected Memory</SectionLabel>
        <div className="px-3.5 pb-2 space-y-1.5">
          {recentMemories.slice(0, 5).length === 0 ? (
            <p className="text-[11px] text-[#484f58] italic">No recent memories</p>
          ) : (
            recentMemories.slice(0, 5).map((m) => (
              <div key={m.record_id} className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-card border border-[#21262d]">
                <PinIcon />
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{m.preview}</p>
                  <p className="text-[10px] text-[#30363d] mt-0.5">{m.role}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Agents */}
        <SectionLabel>Agents</SectionLabel>
        <div className="px-3.5 pb-2 space-y-1">
          {poolSlots.length === 0 ? (
            <p className="text-[11px] text-[#484f58] italic">No agents running</p>
          ) : (
            poolSlots.map((slot) => (
              <div key={slot.slot_id} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${slot.status === "busy" ? "bg-status-busy" : slot.status === "idle" ? "bg-status-idle" : "bg-status-error"}`} />
                  <span className="text-[11px] font-mono text-muted-foreground">{slot.slot_id}</span>
                </div>
                <span className="text-[10px] text-[#484f58]">{slot.status}</span>
              </div>
            ))
          )}
        </div>

        {/* Quick Actions */}
        <SectionLabel>Quick Actions</SectionLabel>
        <div className="px-3.5 pb-4 flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((cmd) => (
            <span
              key={cmd}
              className="px-2 py-1.5 rounded text-[11px] font-mono text-muted-foreground bg-card border border-[#21262d] cursor-pointer hover:text-foreground transition-colors"
            >
              {cmd}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
