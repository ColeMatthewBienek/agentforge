import { useAgentStore } from "@/store/agentStore";
import { stripAnsi, generateId } from "@/lib/utils";
import type { PoolSlot, RecentMemory, TaskSpec } from "@/store/agentStore";

const WS_URL = "ws://localhost:8765";
const SESSION_ID = generateId();

let _ws: WebSocket | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (
    _ws &&
    (_ws.readyState === WebSocket.OPEN ||
      _ws.readyState === WebSocket.CONNECTING ||
      _ws.readyState === WebSocket.CLOSING)
  ) return;

  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }

  const store = useAgentStore.getState();
  store.setConnectionStatus("connecting");

  const ws = new WebSocket(`${WS_URL}/ws/stream/${SESSION_ID}`);
  _ws = ws;

  ws.onopen = () => {
    if (_ws !== ws) return;
    useAgentStore.getState().setConnectionStatus("connected");
    useAgentStore.getState().setCurrentSessionId(SESSION_ID);
    // Any active plan from before the reconnect is stale — the backend
    // marks those tasks as error on startup, so clear them from the store.
    useAgentStore.getState().clearActivePlan();
    useAgentStore.getState().setPlanSession(null);
  };

  ws.onmessage = (event: MessageEvent) => {
    if (_ws !== ws) return;
    const data = JSON.parse(event.data as string) as {
      type: string;
      content?: string;
      message?: string;
      record_id?: string;
      session_id?: string;
      role?: string;
      preview?: string;
      created_at?: string;
      query?: string;
      scope?: string;
      message?: string;
      results?: Array<{
        id: string;
        role: string;
        content: string;
        created_at: string;
        pinned: boolean;
        source: string;
      }>;
      slots?: PoolSlot[];
      idle_timeout_seconds?: number;
      // plan/task events
      session_id?: string;
      direction?: string;
      tasks?: unknown[];
      task?: unknown;
      task_id?: string;
      slot_id?: string;
      total?: number;
      succeeded?: number;
      failed?: number;
      error?: string;
      run_id?: string;
      questions?: unknown[];
      column?: string;
      tier?: string;
      model?: string;
      reason?: string;
    };

    const s = useAgentStore.getState();

    switch (data.type) {
      case "status":
        break;

      case "chunk":
        s.appendToLastAgentMessage(stripAnsi(data.content ?? ""));
        break;

      case "done":
      case "dispatch_done":
        s.finalizeLastAgentMessage();
        s.setStreaming(false);
        break;

      case "interrupted":
        s.appendToLastAgentMessage("\n[interrupted]");
        s.finalizeLastAgentMessage();
        s.setStreaming(false);
        break;

      case "error": {
        const errText = `[Error] ${data.message ?? "Unknown error"}`;
        s.appendToLastAgentMessage(errText);
        s.finalizeLastAgentMessage();
        s.setStreaming(false);
        break;
      }

      case "recall_results": {
        const payload = JSON.stringify({
          query: data.query,
          results: data.results ?? [],
          scope: data.scope,
        });
        useAgentStore.getState().addMessage("recall", payload);
        break;
      }

      case "AGENT_POOL_UPDATE":
        s.setPoolSlots((data.slots ?? []) as PoolSlot[], data.idle_timeout_seconds);
        break;

      case "build_started":
        s.clearActivePlan();
        s.setPlanSession(data.session_id ?? null);
        s.setActiveView("tasks");
        if (data.session_id) {
          s.addBuildSession({
            id: data.session_id as string,
            direction: (data.direction as string) ?? "",
            task_count: 0,
            status: "running",
            created_at: new Date().toISOString(),
            completed_at: null,
          });
        }
        break;

      case "task_graph":
        if (data.session_id && data.tasks) {
          s.setTaskGraph(data.session_id as string, data.tasks as TaskSpec[]);
        }
        break;

      case "task_update":
        if (data.task) {
          s.updateTask(data.task as Partial<TaskSpec> & { id: string });
        }
        break;

      case "task_chunk":
        if (data.task_id && data.content) {
          s.appendTaskChunk(data.task_id as string, stripAnsi(data.content ?? ""));
        }
        break;

      case "build_complete":
        s.setPlanSession(null);
        s.clearActivePlan();
        if (data.summary) {
          s.addMessage("agent", data.summary as string);
          s.finalizeLastAgentMessage();
        }
        break;

      case "execution_started":
        if (data.project_id && data.run_id) {
          s.setActiveProject(data.project_id as string, data.run_id as string);
          s.setActiveView("projects");
        }
        break;

      case "em_kick_backs":
        if (data.questions) {
          s.setProjectKickBacks(data.questions as string[]);
        }
        break;

      case "kanban_update":
        // handled by ProjectWorkspace polling for now
        break;

      case "decomposer_error":
        if (data.session_id) {
          useAgentStore.getState().markPlanSessionWarning(
            data.session_id as string,
            (data.error as string) ?? "Unknown decomposer error"
          );
        }
        break;

      case "MEMORY_STORED": {
        const memory: RecentMemory = {
          record_id: data.record_id ?? "",
          session_id: data.session_id ?? "",
          role: data.role ?? "",
          preview: data.preview ?? "",
          created_at: data.created_at ?? "",
        };
        s.addRecentMemory(memory);
        setTimeout(() => useAgentStore.getState().setMemoryStatus("idle"), 800);
        break;
      }
    }
  };

  ws.onclose = () => {
    if (_ws !== ws) return;
    _ws = null;
    useAgentStore.getState().setConnectionStatus("disconnected");
    useAgentStore.getState().setStreaming(false);
    _reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    if (_ws !== ws) return;
    useAgentStore.getState().setConnectionStatus("error");
    ws.close();
  };
}

export function initSocket() {
  connect();
}

export function sendPrompt(prompt: string) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  const s = useAgentStore.getState();
  s.addMessage("user", prompt);
  s.addMessage("agent", "");
  s.setStreaming(true);
  _ws.send(JSON.stringify({ type: "prompt", content: prompt }));
}

export function sendCommand(name: string, args: string) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({ type: "command", name, args }));
}

export function sendDispatch(tasks: Array<{ prompt: string; title?: string; workdir?: string; task_id?: string }>) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({ type: "dispatch", tasks }));
}

export function sendInterrupt() {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({ type: "interrupt" }));
}

export function sendDebugSummarize(content: string) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({ type: "command", name: "debug_summarize", args: content }));
}

export function sendTaskInput(taskId: string, message: string) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({ type: "command", name: "task_input", args: `${taskId}|||${message}` }));
}

export function sendBuild(prompt: string, baseDir?: string) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  _ws.send(JSON.stringify({
    type: "build",
    prompt,
    base_dir: baseDir,
    task_id: `build-${Date.now()}`,
  }));
}

export function getSessionId(): string {
  return SESSION_ID;
}

export function _resetForTesting() {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = null;
  if (_ws) {
    _ws.onclose = null;
    _ws.onerror = null;
    _ws.onopen = null;
    _ws.onmessage = null;
    _ws.close();
    _ws = null;
  }
}
