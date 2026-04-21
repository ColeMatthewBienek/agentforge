const BASE_URL = "http://localhost:8765";

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  },
  async post<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, { method: "POST" });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  },
  async del(path: string): Promise<void> {
    const res = await fetch(`${BASE_URL}${path}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
  },
  health: () => api.get<{ status: string }>("/api/health"),
  agents: () => api.get<{ agents: AgentInfo[] }>("/api/agents"),
  memory: {
    list: (page = 1, pageSize = 20) =>
      api.get<MemoryPage>(`/api/memory?page=${page}&page_size=${pageSize}`),
    search: (q: string, limit = 20) =>
      api.get<{ records: MemoryRecord[] }>(`/api/memory/search?q=${encodeURIComponent(q)}&limit=${limit}`),
    session: (sessionId: string) =>
      api.get<{ records: MemoryRecord[] }>(`/api/memory/session/${sessionId}`),
    pin: (id: string) => api.post<{ status: string }>(`/api/memory/pin/${id}`),
    unpin: (id: string) => api.post<{ status: string }>(`/api/memory/unpin/${id}`),
    delete: (id: string) => api.del(`/api/memory/${id}`),
  },
};

export interface AgentInfo {
  slot_id: number;
  name: string;
  status: string;
}

export interface MemoryRecord {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
  pinned: boolean;
  source: string;
}

export interface MemoryPage {
  records: MemoryRecord[];
  total: number;
  page: number;
  page_size: number;
}
