import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const VIEW_TITLES: Record<string, string> = {
  chat: "Chat",
  tasks: "Tasks",
  agents: "Agents",
  schedule: "Schedule",
  memory: "Memory",
};

interface LayoutProps {
  children: (view: string) => ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [activeView, setActiveView] = useState("chat");

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar title={VIEW_TITLES[activeView] ?? activeView} />
        <main className="flex-1 overflow-hidden">{children(activeView)}</main>
      </div>
    </div>
  );
}
