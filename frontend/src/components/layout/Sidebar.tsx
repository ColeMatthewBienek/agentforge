import { cn } from "@/lib/utils";

interface NavItem {
  icon: string;
  label: string;
  id: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: "💬", label: "Chat", id: "chat" },
  { icon: "📋", label: "Tasks", id: "tasks" },
  { icon: "🤖", label: "Agents", id: "agents" },
  { icon: "⏰", label: "Schedule", id: "schedule" },
  { icon: "🧠", label: "Memory", id: "memory" },
];

interface SidebarProps {
  activeView: string;
  onNavigate: (id: string) => void;
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside className="w-56 flex-shrink-0 bg-sidebar border-r border-border flex flex-col h-full">
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-accent text-xl">⬡</span>
          <span className="font-semibold text-foreground tracking-tight">AgentForge</span>
        </div>
      </div>

      <nav className="flex-1 py-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left",
              activeView === item.id
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="border-t border-border py-2">
        <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors text-left">
          <span>⚙</span>
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
