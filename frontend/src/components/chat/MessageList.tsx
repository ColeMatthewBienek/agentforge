import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore, type Message } from "@/store/agentStore";
import { sendDebugSummarize } from "@/lib/agentSocket";
import { api } from "@/lib/api";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Start a conversation with the Claude agent.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground italic text-xs">thinking</span>
      <span className="flex gap-0.5 items-end pb-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-muted-foreground/60"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </span>
    </span>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function RecallBubble({ content }: { content: string }) {
  let query = "";
  let initialResults: Array<{ id: string; role: string; content: string; created_at: string; pinned: boolean }> = [];
  try {
    ({ query, results: initialResults } = JSON.parse(content));
  } catch {
    return null;
  }

  const [results, setResults] = useState(initialResults);

  const pinRecord = async (id: string) => {
    await api.memory.pin(id);
    setResults(prev => prev.map(r => r.id === id ? { ...r, pinned: true } : r));
  };

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-[90%] border border-border rounded-lg overflow-hidden text-xs">
        <div className="px-3 py-2 bg-card border-b border-border flex items-center gap-2">
          <span className="text-muted-foreground font-mono">recall</span>
          <span className="text-foreground font-medium">{query}</span>
          <span className="ml-auto text-muted-foreground">{results.length} result{results.length !== 1 ? "s" : ""}</span>
        </div>
        {results.length === 0 ? (
          <div className="px-3 py-3 text-muted-foreground">No memories found.</div>
        ) : (
          results.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-3 py-2 border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
              <span className={cn(
                "shrink-0 font-mono px-1 py-0.5 rounded border mt-px text-[10px]",
                r.pinned ? "border-yellow-500/40 text-yellow-400" :
                r.role === "user" ? "border-accent/40 text-accent" : "border-primary/40 text-primary"
              )}>
                {r.pinned ? "pin" : r.role === "user" ? "user" : "asst"}
              </span>
              <p className="flex-1 text-foreground leading-relaxed line-clamp-3">{r.content}</p>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-muted-foreground">{timeAgo(r.created_at)}</span>
                {!r.pinned && (
                  <button
                    onClick={() => pinRecord(r.id)}
                    className="text-muted-foreground hover:text-yellow-400 transition-colors"
                    title="Pin this memory"
                  >
                    ⊕
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DebugPromptBubble() {
  const [handled, setHandled] = useState(false);
  if (handled) return null;

  const handleYes = () => {
    const store = useAgentStore.getState();
    const summary = store.debugSessionMessages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");
    store.addMessage("agent", "");
    store.setStreaming(true);
    sendDebugSummarize(summary);
    store.clearDebugSession();
    setHandled(true);
  };

  const handleNo = () => {
    const store = useAgentStore.getState();
    store.addMessage("agent", "Debug session discarded.");
    store.finalizeLastAgentMessage();
    store.clearDebugSession();
    setHandled(true);
  };

  return (
    <div className="flex justify-center">
      <div className="border border-red-500/30 bg-red-500/5 rounded-lg px-4 py-3 text-sm max-w-sm w-full">
        <p className="text-foreground mb-3">
          Debug session ended. Save findings to memory?
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleYes}
            className="px-3 py-1 bg-red-500/20 border border-red-500/40 rounded text-xs text-red-300 hover:bg-red-500/30 transition-colors"
          >
            Yes
          </button>
          <button
            onClick={handleNo}
            className="px-3 py-1 bg-secondary border border-border rounded text-xs text-muted-foreground hover:bg-secondary/80 transition-colors"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "debug_prompt") {
    return <DebugPromptBubble />;
  }

  if (message.role === "recall") {
    return <RecallBubble content={message.content} />;
  }

  if (message.role === "note") {
    return (
      <div className="flex justify-center">
        <div className="flex items-start gap-2 max-w-[80%] bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2 text-xs text-yellow-200/70">
          <span className="shrink-0 font-mono text-yellow-500/60 mt-px">btw</span>
          <span className="italic">{message.content}</span>
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] bg-accent/20 border border-accent/30 rounded-lg px-4 py-2 text-sm text-foreground whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const isEmpty = !message.content;

  return (
    <div className="flex justify-start">
      <div className="flex gap-3 max-w-[90%]">
        <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
          ⬡
        </div>
        <div className="agent-output bg-card border border-border rounded-lg px-4 py-3 text-foreground text-sm flex-1 min-w-0">
          {isEmpty ? (
            <ThinkingDots />
          ) : (
            <span className={cn(message.streaming && "streaming-cursor")}>
              {message.content}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
