import { sendPrompt, sendCommand, sendDispatch } from "@/lib/agentSocket";

export function useAgentStream() {
  return { sendPrompt, sendCommand, sendDispatch };
}
