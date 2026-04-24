import { Layout } from "@/components/layout/Layout";
import { HomeScreen } from "@/components/home/HomeScreen";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MemoryBrowser } from "@/components/memory/MemoryBrowser";
import { AgentDashboard } from "@/components/agents/AgentDashboard";
import { TaskQueue } from "@/components/tasks/TaskQueue";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { ScheduleView } from "@/components/schedule/ScheduleView";
import { SettingsView } from "@/components/settings/SettingsView";
import { initSocket } from "@/lib/agentSocket";
import { useAgentStore } from "@/store/agentStore";

initSocket();

export default function App() {
  const { activeView, setActiveView } = useAgentStore();

  return (
    <Layout activeView={activeView} onNavigate={setActiveView}>
      {(view) => {
        switch (view) {
          case "home":
            return <HomeScreen onNavigate={setActiveView} />;
          case "chat":
            return <ChatPanel />;
          case "projects":
            return <ProjectsView />;
          case "tasks":
            return <TaskQueue />;
          case "agents":
            return <AgentDashboard />;
          case "schedule":
            return <ScheduleView />;
          case "memory":
            return <MemoryBrowser />;
          case "settings":
            return <SettingsView />;
          default:
            return <HomeScreen onNavigate={setActiveView} />;
        }
      }}
    </Layout>
  );
}
