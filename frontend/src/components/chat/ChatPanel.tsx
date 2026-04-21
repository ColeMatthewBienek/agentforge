import { useCallback } from "react";
import { useAgentStore } from "@/store/agentStore";
import { useAgentStream } from "@/hooks/useAgentStream";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { AgentSelector } from "./AgentSelector";
import { MemoryIndicator } from "@/components/memory/MemoryIndicator";

const HELP_TEXT = `Available commands:
  /clear              Clear the conversation
  /new                Start a new session (alias for /clear)
  /help               Show this help text
  /cwd <path>         Set the agent working directory
  /btw <note>         Inject context the agent sees but won't reply to
  /remember <text>    Pin a fact to memory — always surfaces in future context
  /recall <query>     Semantic search across all stored memories`;

export function ChatPanel() {
  const { messages, isStreaming } = useAgentStore();
  const { sendPrompt, sendCommand } = useAgentStream();

  const handleSend = useCallback(
    (prompt: string) => {
      const { contextNotes } = useAgentStore.getState();
      if (contextNotes.length > 0) {
        const prefix = contextNotes.map((n) => `[Context: ${n}]`).join("\n");
        sendPrompt(`${prefix}\n\n${prompt}`);
      } else {
        sendPrompt(prompt);
      }
    },
    [sendPrompt]
  );

  const handleCommand = useCallback(
    (name: string, args: string) => {
      const store = useAgentStore.getState();
      switch (name) {
        case "clear":
        case "new":
          store.clearMessages();
          break;
        case "help":
          store.addMessage("agent", HELP_TEXT);
          store.finalizeLastAgentMessage();
          break;
        case "btw": {
          const note = args.trim();
          if (!note) {
            store.addMessage("agent", "Usage: /btw <note>");
            store.finalizeLastAgentMessage();
          } else {
            store.addContextNote(note);
            store.addMessage("note", note);
          }
          break;
        }
        case "recall": {
          const query = args.trim();
          if (!query) {
            store.addMessage("agent", "Usage: /recall <query>");
            store.finalizeLastAgentMessage();
          } else {
            sendCommand("recall", query);
          }
          break;
        }
        case "remember": {
          const text = args.trim();
          if (!text) {
            store.addMessage("agent", "Usage: /remember <text>");
            store.finalizeLastAgentMessage();
          } else {
            store.addMessage("user", `/remember ${text}`);
            store.addMessage("agent", "");
            store.setStreaming(true);
            sendCommand("remember", text);
          }
          break;
        }
        case "cwd": {
          const path = args.trim();
          if (!path) {
            store.addMessage("agent", "Usage: /cwd <path>");
            store.finalizeLastAgentMessage();
          } else {
            store.addMessage("user", `/cwd ${path}`);
            store.addMessage("agent", "");
            store.setStreaming(true);
            sendCommand("set_workdir", path);
          }
          break;
        }
        default:
          store.addMessage("agent", `Unknown command: /${name}`);
          store.finalizeLastAgentMessage();
      }
    },
    [sendCommand]
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border">
        <AgentSelector />
        <button
          onClick={() => useAgentStore.getState().clearMessages()}
          className="mr-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          New Session
        </button>
      </div>
      <MessageList messages={messages} />
      <div className="flex items-center justify-end px-4 py-1 border-t border-border/50">
        <MemoryIndicator />
      </div>
      <InputBar onSend={handleSend} onCommand={handleCommand} disabled={isStreaming} />
    </div>
  );
}
