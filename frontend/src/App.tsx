import { useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MemoryBrowser } from "@/components/memory/MemoryBrowser";
import { AgentDashboard } from "@/components/agents/AgentDashboard";
import { TaskQueue } from "@/components/tasks/TaskQueue";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { initSocket } from "@/lib/agentSocket";
import { useAgentStore } from "@/store/agentStore";

initSocket();

function PlaceholderView({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      {name} — coming soon
    </div>
  );
}

export default function App() {
  const { activeView, setActiveView } = useAgentStore();

  return (
    <Layout activeView={activeView} onNavigate={setActiveView}>
      {(view) => {
        switch (view) {
          case "chat":
            return <ChatPanel />;
          case "projects":
            return <ProjectsView />;
          case "tasks":
            return <TaskQueue />;
          case "agents":
            return <AgentDashboard />;
          case "schedule":
            return <PlaceholderView name="Schedule Manager" />;
          case "memory":
            return <MemoryBrowser />;
          default:
            return <ChatPanel />;
        }
      }}
    </Layout>
  );
}
