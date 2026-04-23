import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAgentStore, type TaskSpec } from "@/store/agentStore";
import { sendTaskInput } from "@/lib/agentSocket";

interface TaskDetailProps {
  task: TaskSpec;
}

export function TaskDetail({ task }: TaskDetailProps) {
  const chunks = useAgentStore((s) => s.taskChunks[task.id] ?? "");
  const [historicOutput, setHistoricOutput] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chunks, historicOutput]);

  useEffect(() => {
    if ((task.status === "complete" || task.status === "error") && !chunks) {
      fetch(`/api/tasks/${task.id}`)
        .then((r) => r.json())
        .then((d: { output?: string }) => setHistoricOutput(d.output ?? ""))
        .catch(() => setHistoricOutput(""));
    }
  }, [task.id, task.status, chunks]);

  const output = chunks || historicOutput || "";
  const canReply = task.status === "complete" || task.status === "running";

  const handleSend = () => {
    const msg = reply.trim();
    if (!msg) return;
    sendTaskInput(task.id, msg);
    setReply("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-[#30363d] bg-[#0d1117]" onClick={(e) => e.stopPropagation()}>
      {task.worktree_path && (
        <div className="px-4 py-2 text-[10px] font-mono text-muted-foreground border-b border-[#30363d] flex items-center gap-2">
          <span className="text-[#8b949e]">worktree</span>
          <span className="text-foreground">{task.worktree_path}</span>
        </div>
      )}

      <details className="px-4 py-2 border-b border-[#30363d]">
        <summary className="text-[10px] text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
          prompt
        </summary>
        <p className="mt-1 text-xs font-mono text-foreground/70 whitespace-pre-wrap leading-relaxed">{task.prompt}</p>
      </details>

      <div className="px-4 py-3">
        <p className="text-[10px] text-muted-foreground mb-1">output</p>
        <div className="agent-output bg-[#161b22] rounded border border-[#30363d] px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
          {output || <span className="text-muted-foreground italic">no output yet</span>}
          <div ref={bottomRef} />
        </div>
      </div>

      {task.error && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-red-400 mb-1">error</p>
          <p className="text-xs font-mono text-red-300 bg-red-500/5 border border-red-500/20 rounded px-3 py-2">
            {task.error}
          </p>
        </div>
      )}

      {canReply && (
        <div className="px-4 pb-3 border-t border-[#30363d] pt-3">
          <p className="text-[10px] text-muted-foreground mb-1.5">reply to agent</p>
          <div className="flex gap-2 items-end bg-[#161b22] border border-[#30363d] rounded px-3 py-2 focus-within:border-ring transition-colors">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Answer the agent's question... (Enter to send)"
              rows={1}
              className="flex-1 bg-transparent text-foreground text-xs resize-none outline-none placeholder:text-muted-foreground font-mono min-h-[1.5rem] max-h-[120px]"
            />
            <button
              onClick={handleSend}
              disabled={!reply.trim()}
              className="shrink-0 px-2.5 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
