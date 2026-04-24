import { cn } from "@/lib/utils";

// ── SVG icons ────────────────────────────────────────────────────────────────

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HomeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...iconProps}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function AgentsIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <circle cx="15" cy="10" r="1.5" />
      <path d="M9 15h6" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

// ── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "home",     label: "Home",     icon: <HomeIcon /> },
  { id: "chat",     label: "Chat",     icon: <ChatIcon /> },
  { id: "projects", label: "Projects", icon: <FolderIcon /> },
  { id: "agents",   label: "Agents",   icon: <AgentsIcon /> },
  { id: "tasks",    label: "Tasks",    icon: <TasksIcon /> },
  { id: "schedule", label: "Schedule", icon: <ClockIcon /> },
  { id: "memory",   label: "Memory",   icon: <MemoryIcon /> },
];

// ── Component ────────────────────────────────────────────────────────────────

interface IconRailProps {
  active: string;
  onNavigate: (id: string) => void;
}

export function IconRail({ active, onNavigate }: IconRailProps) {
  return (
    <div className="w-14 flex-shrink-0 bg-background border-r border-border flex flex-col items-center py-3 gap-0.5 h-screen">
      {/* Logo */}
      <div
        title="Home"
        onClick={() => onNavigate("home")}
        className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-primary to-[#1a6b2b] flex items-center justify-center text-white text-base font-bold cursor-pointer mb-3 select-none"
      >
        ⬡
      </div>

      {/* Nav icons */}
      {NAV_ITEMS.map((item) => (
        <div
          key={item.id}
          title={item.label}
          onClick={() => onNavigate(item.id)}
          className={cn(
            "w-[38px] h-[38px] rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150",
            active === item.id
              ? "bg-secondary text-foreground"
              : "text-[#484f58] hover:text-muted-foreground hover:bg-secondary/50"
          )}
        >
          {item.icon}
        </div>
      ))}

      <div className="flex-1" />

      {/* Settings */}
      <div
        title="Settings"
        onClick={() => onNavigate("settings")}
        className={cn(
          "w-[38px] h-[38px] rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150",
          active === "settings"
            ? "bg-secondary text-foreground"
            : "text-[#484f58] hover:text-muted-foreground hover:bg-secondary/50"
        )}
      >
        <SettingsIcon />
      </div>
    </div>
  );
}
