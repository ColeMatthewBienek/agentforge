import { useCallback } from "react";
import { useAgentStore } from "@/store/agentStore";
import { useAgentStream } from "@/hooks/useAgentStream";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { AgentSelector } from "./AgentSelector";

const HELP_TEXT = `Available commands:
  /clear          Clear the conversation
  /new            Start a new session (alias for /clear)
  /help           Show this help text
  /cwd <path>     Set the agent working directory
  /btw <note>     Inject context the agent sees but won't reply to`;

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
      <InputBar onSend={handleSend} onCommand={handleCommand} disabled={isStreaming} />
    </div>
  );
}
