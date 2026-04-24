import { useAgentStore } from "@/store/agentStore";

interface SettingRow {
  label: string;
  value: string;
}

interface SettingSection {
  title: string;
  rows: SettingRow[];
}

const SECTIONS: SettingSection[] = [
  {
    title: "Agent",
    rows: [
      { label: "Default model",       value: "claude-sonnet-4-6" },
      { label: "Max pool size",        value: "4 agents" },
      { label: "Idle timeout",         value: "300s" },
      { label: "Permissions",          value: "--dangerously-skip-permissions" },
    ],
  },
  {
    title: "Memory",
    rows: [
      { label: "Embedding model",      value: "nomic-embed-text" },
      { label: "Vector store",         value: "LanceDB (local)" },
      { label: "Memory retention",     value: "90 days" },
    ],
  },
  {
    title: "Interface",
    rows: [
      { label: "Theme",                value: "Dark (GitHub)" },
      { label: "Font size",            value: "13px" },
    ],
  },
];

export function SettingsView() {
  const { isDebugMode, setDebugMode } = useAgentStore();

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-5 py-4 border-b border-[#21262d] flex-shrink-0">
        <div className="text-[14px] font-semibold text-foreground">Settings</div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-8 py-6 max-w-[640px]">
          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-8">
              <div className="text-[11px] uppercase tracking-widest text-[#484f58] font-semibold mb-3 pb-2 border-b border-[#21262d]">
                {section.title}
              </div>
              {section.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2">
                  <span className="text-[13px] text-[#c9d1d9]">{row.label}</span>
                  <span className="px-2.5 py-1 rounded-md border border-[#21262d] bg-card text-[12px] text-muted-foreground font-mono">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          ))}

          {/* Debug toggle */}
          <div className="mb-8">
            <div className="text-[11px] uppercase tracking-widest text-[#484f58] font-semibold mb-3 pb-2 border-b border-[#21262d]">
              Developer
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-[13px] text-[#c9d1d9]">Debug mode</span>
                <p className="text-[11px] text-[#484f58] mt-0.5">Show raw prompt in chat panel</p>
              </div>
              <button
                onClick={() => setDebugMode(!isDebugMode)}
                className={`relative w-9 h-5 rounded-full transition-colors ${isDebugMode ? "bg-status-active" : "bg-[#21262d]"}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isDebugMode ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
