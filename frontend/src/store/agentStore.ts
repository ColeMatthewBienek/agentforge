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
      // Clear accumulated debug messages when starting a fresh debug session.
      debugSessionMessages: v ? [] : state.debugSessionMessages,
    })),
  clearDebugSession: () => set({ debugSessionMessages: [] }),
}));
