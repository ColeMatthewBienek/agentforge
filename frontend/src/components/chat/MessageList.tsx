import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAgentStore, type Message, type SystemMessage } from "@/store/agentStore";
import { sendDebugSummarize } from "@/lib/agentSocket";
import { api } from "@/lib/api";

interface MessageListProps {
  messages: Message[];
}

const SYSTEM_STYLES: Record<SystemMessage["priority"], string> = {
  urgent: "border-l-4 border-red-500 bg-red-950/20 text-red-300",
  high:   "border-l-4 border-yellow-500 bg-yellow-950/20 text-yellow-300",
  normal: "border-l-4 border-gray-700 bg-gray-900/30 text-gray-500",
};

function SystemMessageBubble({ msg }: { msg: SystemMessage }) {
  return (
    <div className={cn("mx-0 my-1 px-3 py-2 rounded text-xs font-mono", SYSTEM_STYLES[msg.priority])}>
      <span className="opacity-50 mr-2">[{msg.from_source}]</span>
      {msg.content}
    </div>
  );
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const systemMessages = useAgentStore((s) => s.systemMessages);

  // Merge chat messages and system messages by timestamp for interleaving
  type ChatItem =
    | { kind: "chat"; ts: number; msg: Message }
    | { kind: "system"; ts: number; msg: SystemMessage };

  const items: ChatItem[] = [
    ...messages.map((m) => ({ kind: "chat" as const, ts: m.timestamp.getTime(), msg: m })),
    ...systemMessages.map((m) => ({
      kind: "system" as const,
      ts: new Date(m.created_at).getTime(),
      msg: m,
    })),
  ].sort((a, b) => a.ts - b.ts);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Start a conversation with the Claude agent.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {items.map((item) =>
        item.kind === "system" ? (
          <SystemMessageBubble key={`sys-${item.msg.id}`} msg={item.msg} />
        ) : (
          <MessageBubble key={item.msg.id} message={item.msg} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function ThinkingDots() {
  const selectedAgent = useAgentStore((s) => s.selectedAgent);
  return (
    <div className="flex gap-2.5 items-center">
      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-[12px] text-status-active flex-shrink-0">
        ⬡
      </div>
      <div className="flex gap-1 items-center">
        {([0.8, 0.5, 0.3] as number[]).map((op, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-status-active" style={{ opacity: op }} />
        ))}
        <span className="text-[11px] text-[#484f58] ml-1.5">{selectedAgent} is typing...</span>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

type RecallResult = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  pinned: boolean;
  session_id?: string;
};

function sessionTypeBadge(sessionId: string | undefined, planIds: Set<string>, taskIds: Set<string>) {
  if (!sessionId) return null;
  if (planIds.has(sessionId)) {
    return <span className="font-mono px-1 py-0.5 rounded border text-[9px] border-purple-500/40 text-purple-400">plan</span>;
  }
  if (taskIds.has(sessionId)) {
    return <span className="font-mono px-1 py-0.5 rounded border text-[9px] border-green-500/40 text-green-400">task</span>;
  }
  return <span className="font-mono px-1 py-0.5 rounded border text-[9px] border-blue-500/30 text-blue-400/70">chat</span>;
}

function RecallBubble({ content }: { content: string }) {
  let query = "";
  let scope = "current";
  let initialResults: RecallResult[] = [];
  try {
    ({ query, results: initialResults, scope } = JSON.parse(content) as { query: string; results: RecallResult[]; scope?: string });
  } catch {
    return null;
  }

  const [results, setResults] = useState(initialResults);
  const buildSessions = useAgentStore((s) => s.buildSessions);
  const activeTasks = useAgentStore((s) => s.activeTasks);

  const planIds = new Set(buildSessions.map((s) => s.id));
  const taskIds = new Set(activeTasks.map((t) => t.id));

  const pinRecord = async (id: string) => {
    await api.memory.pin(id);
    setResults((prev) => prev.map((r) => r.id === id ? { ...r, pinned: true } : r));
  };

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-[90%] border border-border rounded-lg overflow-hidden text-xs">
        <div className="px-3 py-2 bg-card border-b border-border flex items-center gap-2">
          <span className="text-muted-foreground font-mono">recall</span>
          <span className="text-foreground font-medium">{query}</span>
          {scope && scope !== "current" && (
            <span className="text-[9px] font-mono px-1 py-0.5 rounded border border-muted text-muted-foreground">{scope}</span>
          )}
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
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {sessionTypeBadge(r.session_id, planIds, taskIds)}
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
        <div className="max-w-[65%] px-3.5 py-2.5 rounded-[12px_12px_4px_12px] bg-accent/10 border border-accent/20 text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  const isEmpty = !message.content;

  return (
    <div className="flex justify-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-[12px] text-status-active flex-shrink-0 mt-0.5">
        ⬡
      </div>
      <div className="flex flex-col gap-2 max-w-[75%]">
        <div className="agent-output text-[13px] text-[#c9d1d9] leading-[1.55] flex-1 min-w-0">
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
