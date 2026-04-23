import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const VIEW_TITLES: Record<string, string> = {
  chat: "Chat",
  projects: "Projects",
  tasks: "Task Queue",
  agents: "Agents",
  schedule: "Schedule",
  memory: "Memory",
};

interface LayoutProps {
  activeView: string;
  onNavigate: (view: string) => void;
  children: (view: string) => ReactNode;
}

export function Layout({ activeView, onNavigate, children }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar title={VIEW_TITLES[activeView] ?? activeView} />
        <main className="flex-1 overflow-hidden">{children(activeView)}</main>
      </div>
    </div>
  );
}
