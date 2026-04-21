const BASE_URL = "http://localhost:8765";

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  },
  health: () => api.get<{ status: string }>("/api/health"),
  agents: () => api.get<{ agents: AgentInfo[] }>("/api/agents"),
};

export interface AgentInfo {
  slot_id: number;
  name: string;
  status: string;
}
