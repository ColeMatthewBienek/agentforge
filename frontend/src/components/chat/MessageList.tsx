import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { type Message } from "@/store/agentStore";

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

function MessageBubble({ message }: { message: Message }) {
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
