import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAgentStore } from "@/store/agentStore";

// --- MockWebSocket -----------------------------------------------------------

interface MockWSInstance {
  url: string;
  readyState: number;
  sentMessages: string[];
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
  simulateOpen: () => void;
  simulateMessage: (data: object) => void;
  simulateClose: () => void;
  simulateError: () => void;
}

let wsInstances: MockWSInstance[] = [];

class MockWebSocket implements MockWSInstance {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  simulateError() {
    this.onerror?.();
  }
}

// ---------------------------------------------------------------------------

const storeInitial = {
  messages: [],
  isStreaming: false,
  connectionStatus: "disconnected" as const,
  contextNotes: [],
  memoryStatus: "idle" as const,
  recentMemories: [],
  currentSessionId: "",
  poolSlots: [],
  poolIdleTimeout: 300,
};

beforeEach(async () => {
  wsInstances = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", MockWebSocket);
  // Reset store to initial state
  useAgentStore.setState(storeInitial);
  // Reset the singleton state between tests
  const mod = await import("@/lib/agentSocket");
  mod._resetForTesting();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe("initSocket", () => {
  it("creates a WebSocket to the correct URL", async () => {
    const { initSocket } = await import("@/lib/agentSocket");
    initSocket();
    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].url).toMatch(/^ws:\/\/localhost:8765\/ws\/stream\//);
  });

  it("sets connectionStatus to connecting before open", async () => {
    const { initSocket } = await import("@/lib/agentSocket");
    initSocket();
    expect(useAgentStore.getState().connectionStatus).toBe("connecting");
  });

  it("sets connectionStatus to connected and stores session ID on open", async () => {
    const { initSocket } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    expect(useAgentStore.getState().connectionStatus).toBe("connected");
    expect(useAgentStore.getState().currentSessionId).toBeTruthy();
  });

  it("does not open a second WebSocket when already OPEN", async () => {
    const { initSocket } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    initSocket();
    expect(wsInstances).toHaveLength(1);
  });

  it("does not open a second WebSocket when still CONNECTING", async () => {
    const { initSocket } = await import("@/lib/agentSocket");
    initSocket();
    initSocket();
    expect(wsInstances).toHaveLength(1);
  });
});

describe("onclose reconnect", () => {
  it("sets connectionStatus to disconnected on close", async () => {
    const { initSocket } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    // Manually trigger close without going through MockWebSocket.close
    // to avoid triggering the reconnect-induced second open right away
    wsInstances[0].readyState = MockWebSocket.CLOSED;
    wsInstances[0].onclose?.();
    expect(useAgentStore.getState().connectionStatus).toBe("disconnected");
  });

  it("reconnects automatically after 3 seconds", async () => {
    const { initSocket } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    wsInstances[0].readyState = MockWebSocket.CLOSED;
    wsInstances[0].onclose?.();
    expect(wsInstances).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(wsInstances).toHaveLength(2);
  });

  it("cancels pending reconnect on _resetForTesting", async () => {
    const { initSocket, _resetForTesting } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    wsInstances[0].readyState = MockWebSocket.CLOSED;
    wsInstances[0].onclose?.();
    _resetForTesting();
    vi.advanceTimersByTime(3000);
    // Should not have created a new connection after reset
    expect(wsInstances).toHaveLength(1);
  });
});

describe("onmessage handlers", () => {
  async function setupOpenSocket() {
    const mod = await import("@/lib/agentSocket");
    mod.initSocket();
    wsInstances[0].simulateOpen();
    return wsInstances[0];
  }

  it("chunk appends to last agent message", async () => {
    const ws = await setupOpenSocket();
    useAgentStore.getState().addMessage("agent", "");
    ws.simulateMessage({ type: "chunk", content: "hello" });
    const msgs = useAgentStore.getState().messages;
    expect(msgs[msgs.length - 1].content).toBe("hello");
  });

  it("done finalizes last agent message and clears isStreaming", async () => {
    const ws = await setupOpenSocket();
    useAgentStore.setState({ isStreaming: true });
    useAgentStore.getState().addMessage("agent", "some text");
    ws.simulateMessage({ type: "done" });
    const msgs = useAgentStore.getState().messages;
    expect(msgs[msgs.length - 1].streaming).toBe(false);
    expect(useAgentStore.getState().isStreaming).toBe(false);
  });

  it("error appends error text and clears isStreaming", async () => {
    const ws = await setupOpenSocket();
    useAgentStore.setState({ isStreaming: true });
    useAgentStore.getState().addMessage("agent", "");
    ws.simulateMessage({ type: "error", message: "something went wrong" });
    const msgs = useAgentStore.getState().messages;
    expect(msgs[msgs.length - 1].content).toContain("something went wrong");
    expect(useAgentStore.getState().isStreaming).toBe(false);
  });

  it("recall_results adds a recall message", async () => {
    const ws = await setupOpenSocket();
    ws.simulateMessage({ type: "recall_results", query: "foo", results: [] });
    const msgs = useAgentStore.getState().messages;
    const recallMsg = msgs.find((m) => m.role === "recall");
    expect(recallMsg).toBeTruthy();
    const payload = JSON.parse(recallMsg!.content) as { query: string };
    expect(payload.query).toBe("foo");
  });

  it("AGENT_POOL_UPDATE updates pool slots", async () => {
    const ws = await setupOpenSocket();
    const slots = [
      {
        slot_id: "s1",
        status: "idle",
        current_task_id: null,
        current_task_title: null,
        uptime_seconds: 0,
        idle_since: null,
      },
    ];
    ws.simulateMessage({ type: "AGENT_POOL_UPDATE", slots, idle_timeout_seconds: 120 });
    expect(useAgentStore.getState().poolSlots).toHaveLength(1);
    expect(useAgentStore.getState().poolIdleTimeout).toBe(120);
  });

  it("MEMORY_STORED updates memoryStatus and adds recent memory", async () => {
    const ws = await setupOpenSocket();
    ws.simulateMessage({
      type: "MEMORY_STORED",
      record_id: "r1",
      session_id: "s1",
      role: "user",
      preview: "test memory",
      created_at: "2024-01-01",
    });
    expect(useAgentStore.getState().recentMemories).toHaveLength(1);
    expect(useAgentStore.getState().recentMemories[0].preview).toBe("test memory");
  });

  it("MEMORY_STORED resets memoryStatus to idle after 800ms", async () => {
    const ws = await setupOpenSocket();
    ws.simulateMessage({
      type: "MEMORY_STORED",
      record_id: "r1",
      session_id: "s1",
      role: "user",
      preview: "test",
      created_at: "2024-01-01",
    });
    vi.advanceTimersByTime(800);
    expect(useAgentStore.getState().memoryStatus).toBe("idle");
  });

  it("dispatch_done finalizes last agent message and clears isStreaming", async () => {
    const ws = await setupOpenSocket();
    useAgentStore.setState({ isStreaming: true });
    useAgentStore.getState().addMessage("agent", "parallel output");
    ws.simulateMessage({ type: "dispatch_done" });
    const msgs = useAgentStore.getState().messages;
    expect(msgs[msgs.length - 1].streaming).toBe(false);
    expect(useAgentStore.getState().isStreaming).toBe(false);
  });

  it("chunk with slot_id appends to last agent message same as regular chunk", async () => {
    const ws = await setupOpenSocket();
    useAgentStore.getState().addMessage("agent", "");
    ws.simulateMessage({ type: "chunk", slot_id: "claude-0", task_title: "My Task", content: "result" });
    const msgs = useAgentStore.getState().messages;
    expect(msgs[msgs.length - 1].content).toBe("result");
  });

  it("strips ANSI codes from chunk content", async () => {
    const ws = await setupOpenSocket();
    useAgentStore.getState().addMessage("agent", "");
    ws.simulateMessage({ type: "chunk", content: "\x1b[32mhello\x1b[0m" });
    const msgs = useAgentStore.getState().messages;
    expect(msgs[msgs.length - 1].content).toBe("hello");
  });
});

describe("sendPrompt", () => {
  it("adds user and agent messages to the store and sends over WebSocket", async () => {
    const { initSocket, sendPrompt } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    sendPrompt("hello agent");
    const msgs = useAgentStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("hello agent");
    expect(msgs[1].role).toBe("agent");
    const sent = JSON.parse(wsInstances[0].sentMessages[0]) as { type: string; content: string };
    expect(sent).toEqual({ type: "prompt", content: "hello agent" });
  });

  it("sets isStreaming to true", async () => {
    const { initSocket, sendPrompt } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    sendPrompt("test");
    expect(useAgentStore.getState().isStreaming).toBe(true);
  });

  it("does nothing if WebSocket is not open", async () => {
    const { initSocket, sendPrompt } = await import("@/lib/agentSocket");
    initSocket();
    // Do NOT call simulateOpen — socket stays CONNECTING
    sendPrompt("ignored");
    expect(useAgentStore.getState().messages).toHaveLength(0);
    expect(wsInstances[0].sentMessages).toHaveLength(0);
  });
});

describe("sendCommand", () => {
  it("sends a command message over WebSocket", async () => {
    const { initSocket, sendCommand } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    sendCommand("set_workdir", "/tmp");
    const sent = JSON.parse(wsInstances[0].sentMessages[0]) as {
      type: string;
      name: string;
      args: string;
    };
    expect(sent).toEqual({ type: "command", name: "set_workdir", args: "/tmp" });
  });

  it("does nothing if WebSocket is not open", async () => {
    const { initSocket, sendCommand } = await import("@/lib/agentSocket");
    initSocket();
    sendCommand("recall", "test");
    expect(wsInstances[0].sentMessages).toHaveLength(0);
  });
});

describe("sendInterrupt", () => {
  it("sends {type: interrupt} over WebSocket", async () => {
    const { initSocket, sendInterrupt } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    sendInterrupt();
    const sent = JSON.parse(wsInstances[0].sentMessages[0]) as { type: string };
    expect(sent).toEqual({ type: "interrupt" });
  });

  it("does nothing if WebSocket is not open", async () => {
    const { initSocket, sendInterrupt } = await import("@/lib/agentSocket");
    initSocket();
    sendInterrupt();
    expect(wsInstances[0].sentMessages).toHaveLength(0);
  });
});

describe("interrupted message", () => {
  async function setupOpenSocket() {
    const mod = await import("@/lib/agentSocket");
    mod.initSocket();
    wsInstances[0].simulateOpen();
    return wsInstances[0];
  }

  it("appends [interrupted] to last agent message, finalizes, clears streaming", async () => {
    const ws = await setupOpenSocket();
    useAgentStore.setState({ isStreaming: true });
    useAgentStore.getState().addMessage("agent", "partial");
    ws.simulateMessage({ type: "interrupted" });
    const msgs = useAgentStore.getState().messages;
    expect(msgs[msgs.length - 1].content).toContain("[interrupted]");
    expect(msgs[msgs.length - 1].streaming).toBe(false);
    expect(useAgentStore.getState().isStreaming).toBe(false);
  });
});

describe("sendDebugSummarize", () => {
  it("sends a debug_summarize command over WebSocket", async () => {
    const { initSocket, sendDebugSummarize } = await import("@/lib/agentSocket");
    initSocket();
    wsInstances[0].simulateOpen();
    sendDebugSummarize("my findings");
    const sent = JSON.parse(wsInstances[0].sentMessages[0]) as {
      type: string;
      name: string;
      args: string;
    };
    expect(sent).toEqual({ type: "command", name: "debug_summarize", args: "my findings" });
  });
});
