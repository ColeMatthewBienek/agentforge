import { Layout } from "@/components/layout/Layout";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { MemoryBrowser } from "@/components/memory/MemoryBrowser";

function PlaceholderView({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      {name} — coming in Phase 2
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      {(view) => {
        switch (view) {
          case "chat":
            return <ChatPanel />;
          case "tasks":
            return <PlaceholderView name="Task Queue" />;
          case "agents":
            return <PlaceholderView name="Agent Dashboard" />;
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
