import { useEffect } from "react";
import { toast } from "sonner";
import { useAgentStore } from "@/store/agentStore";

interface InboxMessage {
  id: string;
  from_source: string;
  priority: "urgent" | "high" | "normal";
  message: string;
  data: string | null;
  session_id: string | null;
  created_at: string;
}

const BASE_URL = "http://localhost:8765";
const POLL_INTERVAL_MS = 5000;

export function useInbox() {
  const currentSessionId = useAgentStore((s) => s.currentSessionId);
  const injectSystemMessage = useAgentStore((s) => s.injectSystemMessage);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const params = currentSessionId ? `?session_id=${currentSessionId}` : "";
        const res = await fetch(`${BASE_URL}/api/inbox/drain${params}`);
        if (!res.ok) return;
        const { messages } = (await res.json()) as { messages: InboxMessage[] };

        for (const msg of messages) {
          injectSystemMessage({
            id: msg.id,
            from_source: msg.from_source,
            priority: msg.priority,
            content: msg.message,
            created_at: msg.created_at,
          });

          if (msg.priority === "urgent") {
            toast.error(msg.message, {
              duration: Infinity,
              description: msg.from_source,
              closeButton: true,
            });
          } else if (msg.priority === "high") {
            toast.warning(msg.message, {
              duration: 8000,
              description: msg.from_source,
              closeButton: true,
            });
          }
        }
      } catch {
        // silently retry on next interval
      }
    }

    void poll(); // immediate first poll
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentSessionId, injectSystemMessage]);
}
