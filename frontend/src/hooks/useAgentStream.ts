import { useCallback, useEffect, useRef } from "react";
import { useAgentStore } from "@/store/agentStore";
import { stripAnsi, generateId } from "@/lib/utils";
import type { RecentMemory } from "@/store/agentStore";

const WS_URL = "ws://localhost:8765";

export function useAgentStream() {
  const sessionId = useRef(generateId());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    addMessage,
    appendToLastAgentMessage,
    finalizeLastAgentMessage,
    setStreaming,
    setConnectionStatus,
    setMemoryStatus,
    addRecentMemory,
  } = useAgentStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");
    const ws = new WebSocket(`${WS_URL}/ws/stream/${sessionId.current}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
    };

    ws.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string) as {
        type: string;
        content?: string;
        message?: string;
        agent?: string;
        status?: string;
        record_id?: string;
        session_id?: string;
        role?: string;
        preview?: string;
        created_at?: string;
      };

      switch (data.type) {
        case "status":
          break;

        case "chunk":
          appendToLastAgentMessage(stripAnsi(data.content ?? ""));
          break;

        case "done":
          finalizeLastAgentMessage();
          setStreaming(false);
          break;

        case "error": {
          const errText = `[Error] ${data.message ?? "Unknown error"}`;
          appendToLastAgentMessage(errText);
          finalizeLastAgentMessage();
          setStreaming(false);
          break;
        }

        case "MEMORY_STORED": {
          setMemoryStatus("processing");
          addRecentMemory({
            record_id: data.record_id ?? "",
            session_id: data.session_id ?? "",
            role: data.role ?? "",
            preview: data.preview ?? "",
            created_at: data.created_at ?? "",
          });
          // Reset to idle after brief "stored" flash
          setTimeout(() => setMemoryStatus("idle"), 800);
          break;
        }
      }
    };

    ws.onclose = () => {
      setConnectionStatus("disconnected");
      setStreaming(false);
      // Reconnect after 3 seconds
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      setConnectionStatus("error");
      ws.close();
    };
  }, [addMessage, appendToLastAgentMessage, finalizeLastAgentMessage, setStreaming, setConnectionStatus, setMemoryStatus, addRecentMemory]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendPrompt = useCallback(
    (prompt: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      addMessage("user", prompt);
      addMessage("agent", "");
      setStreaming(true);
      wsRef.current.send(JSON.stringify({ type: "prompt", content: prompt }));
    },
    [addMessage, setStreaming]
  );

  const sendCommand = useCallback(
    (name: string, args: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "command", name, args }));
    },
    []
  );

  return { sendPrompt, sendCommand };
}
