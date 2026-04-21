import { create } from "zustand";
import { generateId } from "@/lib/utils";

export type MessageRole = "user" | "agent" | "note" | "recall";

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

interface AgentStore {
  messages: Message[];
  isStreaming: boolean;
  selectedAgent: string;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  contextNotes: string[];
  memoryStatus: MemoryStatus;
  recentMemories: RecentMemory[];

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
}

export const useAgentStore = create<AgentStore>((set) => ({
  messages: [],
  isStreaming: false,
  selectedAgent: "claude-0",
  connectionStatus: "disconnected",
  contextNotes: [],
  memoryStatus: "idle",
  recentMemories: [],

  addMessage: (role, content) => {
    const id = generateId();
    set((state) => ({
      messages: [
        ...state.messages,
        { id, role, content, timestamp: new Date(), streaming: role === "agent" },
      ],
    }));
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
}));
