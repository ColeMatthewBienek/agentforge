import { type ReactNode, useState } from "react";
import { Toaster } from "sonner";
import { IconRail } from "./IconRail";
import { ThreadList } from "./ThreadList";
import { AgentStatusBar } from "./AgentStatusBar";
import { ContextPanel } from "@/components/chat/ContextPanel";
import { useInbox } from "@/hooks/useInbox";
import { useAgentStore } from "@/store/agentStore";

const VIEW_TITLES: Record<string, string> = {
  home:     "Home",
  chat:     "Chat",
  projects: "Projects",
  tasks:    "Task Queue",
  agents:   "Agents",
  schedule: "Schedule",
  memory:   "Memory",
};

interface LayoutProps {
  activeView: string;
  onNavigate: (view: string) => void;
  children: (view: string) => ReactNode;
}

export function Layout({ activeView, onNavigate, children }: LayoutProps) {
  useInbox();
  const contextPanelVisible = useAgentStore((s) => s.contextPanelVisible);
  const [activeThreadId, setActiveThreadId] = useState<string | null>("t1");

  const handleSelectThread = (id: string) => {
    setActiveThreadId(id);
    onNavigate("chat");
  };

  const handleNewThread = () => {
    setActiveThreadId(null);
    onNavigate("chat");
    useAgentStore.getState().clearMessages();
  };

  void VIEW_TITLES; // used by consumers if needed

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Icon Rail — 56px */}
      <IconRail active={activeView} onNavigate={onNavigate} />

      {/* Thread List — 260px */}
      <ThreadList
        activeId={activeView === "chat" ? activeThreadId : null}
        onSelect={handleSelectThread}
        onNew={handleNewThread}
      />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Agent Status Bar */}
        <AgentStatusBar />

        {/* Content row */}
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-hidden">
            {children(activeView)}
          </main>

          {/* Context Panel — chat only */}
          {activeView === "chat" && (
            <ContextPanel
              visible={contextPanelVisible}
              onClose={() => useAgentStore.getState().toggleContextPanel()}
            />
          )}
        </div>
      </div>

      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{ style: { fontFamily: "monospace", fontSize: "12px" } }}
      />
    </div>
  );
}
