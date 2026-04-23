import { create } from "zustand";
import { generateId } from "@/lib/utils";

export type MessageRole = "user" | "agent" | "note" | "recall" | "debug_prompt";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  streaming: boolean;
}

export type MemoryStatus = "idle" | "processing" | "stored" | "error";

export interface RecentMemory {
  record_id: string;
  session_id: string;
  role: string;
  preview: string;
  created_at: string;
}

export interface PoolSlot {
  slot_id: string;
  status: "starting" | "idle" | "busy" | "stopping" | "error";
  current_task_id: string | null;
  current_task_title: string | null;
  uptime_seconds: number;
  idle_since: string | null;
}

export interface TaskSpec {
  id: string;
  session_id: string;
  title: string;
  prompt: string;
  status: "pending" | "running" | "complete" | "error" | "cancelled";
  complexity: "low" | "medium" | "high";
  dependencies: string[];
  slot_id: string | null;
  worktree_path: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BuildSession {
  id: string;
  direction: string;
  task_count: number;
  status: "running" | "complete" | "error" | "cancelled";
  created_at: string;
  completed_at: string | null;
}

interface AgentStore {
  messages: Message[];
  isStreaming: boolean;
  selectedAgent: string;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  contextNotes: string[];
  memoryStatus: MemoryStatus;
  recentMemories: RecentMemory[];
  currentSessionId: string;
  poolSlots: PoolSlot[];
  poolIdleTimeout: number;
  isDebugMode: boolean;
  debugSessionMessages: Message[];

  // Task / plan state
  activeView: string;
  activePlanSessionId: string | null;
  buildSessions: BuildSession[];
  activeTasks: TaskSpec[];
  taskChunks: Record<string, string>;

  addMessage: (role: MessageRole, content: string) => string;
  appendToLastAgentMessage: (chunk: string) => void;
  finalizeLastAgentMessage: () => void;
  setStreaming: (v: boolean) => void;
  setConnectionStatus: (s: AgentStore["connectionStatus"]) => void;
  setSelectedAgent: (name: string) => void;
  clearMessages: () => void;
  addContextNote: (note: string) => void;
  setMemoryStatus: (s: MemoryStatus) => void;
  addRecentMemory: (m: RecentMemory) => void;
  setCurrentSessionId: (id: string) => void;
  setPoolSlots: (slots: PoolSlot[], idleTimeout?: number) => void;
  setDebugMode: (v: boolean) => void;
  clearDebugSession: () => void;

  draftInput: string;
  setDraftInput: (s: string) => void;
  setActiveView: (view: string) => void;
  setPlanSession: (id: string | null) => void;
  addBuildSession: (s: BuildSession) => void;
  setTaskGraph: (session_id: string, tasks: TaskSpec[]) => void;
  updateTask: (task: Partial<TaskSpec> & { id: string }) => void;
  appendTaskChunk: (task_id: string, content: string) => void;
  clearActivePlan: () => void;

  // Project orchestration
  activeProjectId: string | null;
  activeRunId: string | null;
  projectKickBacks: string[];
  setActiveProject: (projectId: string | null, runId: string | null) => void;
  setProjectKickBacks: (questions: string[]) => void;
  planSessionWarnings: Record<string, string>;
  markPlanSessionWarning: (session_id: string, error: string) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  messages: [],
  isStreaming: false,
  selectedAgent: "claude-0",
  connectionStatus: "disconnected",
  contextNotes: [],
  memoryStatus: "idle",
  recentMemories: [],
  currentSessionId: "",
  poolSlots: [],
  poolIdleTimeout: 300,
  isDebugMode: false,
  debugSessionMessages: [],

  draftInput: "",
  setDraftInput: (s) => set({ draftInput: s }),
  activeView: "chat",
  activePlanSessionId: null,
  buildSessions: [],
  activeTasks: [],
  taskChunks: {},
  planSessionWarnings: {},

  addMessage: (role, content) => {
    const id = generateId();
    set((state) => {
      const msg: Message = { id, role, content, timestamp: new Date(), streaming: role === "agent" };
      const update: Partial<AgentStore> = { messages: [...state.messages, msg] };
      if (state.isDebugMode && (role === "user" || role === "agent")) {
        update.debugSessionMessages = [...state.debugSessionMessages, msg];
      }
      return update;
    });
    return id;
  },

  appendToLastAgentMessage: (chunk) =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "agent") {
        msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
      }
      return { messages: msgs };
    }),

  finalizeLastAgentMessage: () =>
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "agent") {
        msgs[msgs.length - 1] = { ...last, streaming: false };
      }
      return { messages: msgs };
    }),

  setStreaming: (v) => set({ isStreaming: v }),
  setConnectionStatus: (s) => set({ connectionStatus: s }),
  setSelectedAgent: (name) => set({ selectedAgent: name }),
  clearMessages: () => set({ messages: [], contextNotes: [] }),
  addContextNote: (note) =>
    set((state) => ({ contextNotes: [...state.contextNotes, note] })),
  setMemoryStatus: (s) => set({ memoryStatus: s }),
  addRecentMemory: (m) =>
    set((state) => ({
      memoryStatus: "stored",
      recentMemories: [m, ...state.recentMemories].slice(0, 10),
    })),
  setCurrentSessionId: (id) => set({ currentSessionId: id }),
  setPoolSlots: (slots, idleTimeout) =>
    set((state) => ({
      poolSlots: slots,
      poolIdleTimeout: idleTimeout ?? state.poolIdleTimeout,
    })),
  setDebugMode: (v) =>
    set((state) => ({
      isDebugMode: v,
      debugSessionMessages: v ? [] : state.debugSessionMessages,
    })),
  clearDebugSession: () => set({ debugSessionMessages: [] }),

  setActiveView: (view) => set({ activeView: view }),
  setPlanSession: (id) => set({ activePlanSessionId: id }),
  addBuildSession: (s) =>
    set((state) => ({ buildSessions: [s, ...state.buildSessions] })),
  setTaskGraph: (_session_id, tasks) => set({ activeTasks: tasks }),
  updateTask: (update) =>
    set((state) => ({
      activeTasks: state.activeTasks.map((t) =>
        t.id === update.id ? { ...t, ...update } : t
      ),
    })),
  appendTaskChunk: (task_id, content) =>
    set((state) => ({
      taskChunks: {
        ...state.taskChunks,
        [task_id]: (state.taskChunks[task_id] ?? "") + content,
      },
    })),
  clearActivePlan: () => set({ activeTasks: [], taskChunks: {} }),

  activeProjectId: null,
  activeRunId: null,
  projectKickBacks: [],
  setActiveProject: (projectId, runId) => set({ activeProjectId: projectId, activeRunId: runId }),
  setProjectKickBacks: (questions) => set({ projectKickBacks: questions }),
  markPlanSessionWarning: (session_id, error) =>
    set((state) => ({
      planSessionWarnings: { ...state.planSessionWarnings, [session_id]: error },
    })),
}));
