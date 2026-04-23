import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api, type MemoryRecord } from "@/lib/api";
import { useAgentStore } from "@/store/agentStore";

type Filter = "all" | "pinned" | "session" | "plan";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RoleBadge({ role, pinned }: { role: string; pinned: boolean }) {
  return (
    <span className={cn(
      "shrink-0 font-mono px-1.5 py-0.5 rounded border text-[10px]",
      pinned
        ? "border-yellow-500/40 text-yellow-400 bg-yellow-500/5"
        : role === "user"
        ? "border-accent/40 text-accent"
        : "border-primary/40 text-primary"
    )}>
      {pinned ? "pin" : role === "user" ? "user" : "asst"}
    </span>
  );
}

function SessionTypeBadge({ sessionId, planSessionIds, taskIds }: {
  sessionId: string;
  planSessionIds: Set<string>;
  taskIds: Set<string>;
}) {
  if (planSessionIds.has(sessionId)) {
    return (
      <span className="font-mono px-1 py-0.5 rounded border text-[9px] border-purple-500/40 text-purple-400 bg-purple-500/5">
        plan
      </span>
    );
  }
  if (taskIds.has(sessionId)) {
    return (
      <span className="font-mono px-1 py-0.5 rounded border text-[9px] border-green-500/40 text-green-400 bg-green-500/5">
        task
      </span>
    );
  }
  return (
    <span className="font-mono px-1 py-0.5 rounded border text-[9px] border-blue-500/30 text-blue-400/70">
      chat
    </span>
  );
}

function MemoryCard({
  record,
  onPin,
  onUnpin,
  onDelete,
  planSessionIds,
  taskIds,
}: {
  record: MemoryRecord;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onDelete: (id: string) => void;
  planSessionIds: Set<string>;
  taskIds: Set<string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = record.content.length > 500;
  const display = expanded ? record.content : record.content.slice(0, 500);

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors group">
      <RoleBadge role={record.role} pinned={record.pinned} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {display}
          {truncated && !expanded && (
            <button onClick={() => setExpanded(true)} className="ml-1 text-accent hover:underline text-xs">
              show more
            </button>
          )}
          {truncated && expanded && (
            <button onClick={() => setExpanded(false)} className="ml-1 text-accent hover:underline text-xs">
              show less
            </button>
          )}
        </p>
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
          <SessionTypeBadge sessionId={record.session_id} planSessionIds={planSessionIds} taskIds={taskIds} />
          <span className="font-mono">{record.session_id.slice(0, 8)}</span>
          <span>{timeAgo(record.created_at)}</span>
          <span className="text-muted-foreground/60">{record.source}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {record.pinned ? (
          <button
            onClick={() => onUnpin(record.id)}
            className="px-2 py-1 text-[11px] rounded border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 transition-colors"
          >
            unpin
          </button>
        ) : (
          <button
            onClick={() => onPin(record.id)}
            className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-yellow-400 hover:border-yellow-500/30 transition-colors"
          >
            pin
          </button>
        )}
        <button
          onClick={() => onDelete(record.id)}
          className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-colors"
        >
          del
        </button>
      </div>
    </div>
  );
}

export function MemoryBrowser() {
  const currentSessionId = useAgentStore((s) => s.currentSessionId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Classification sets for session type badges
  const [planSessionIds, setPlanSessionIds] = useState<Set<string>>(new Set());
  const [taskIds, setTaskIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 20;

  // Fetch plan/task session IDs for badge classification
  useEffect(() => {
    api.tasks.sessions().then(({ sessions }) => {
      const planIds = new Set(sessions.map((s) => s.id));
      setPlanSessionIds(planIds);
      // Collect task IDs from each plan session
      Promise.all(
        sessions.slice(0, 10).map((s) =>
          api.tasks.sessionDetail(s.id).catch(() => ({ tasks: [] }))
        )
      ).then((details) => {
        const tids = new Set<string>();
        for (const d of details) {
          for (const t of d.tasks ?? []) tids.add(t.id);
        }
        setTaskIds(tids);
      });
    }).catch(() => {});
  }, []);

  const load = useCallback(async (q: string, f: Filter, p: number) => {
    setLoading(true);
    setError(null);
    try {
      if (f === "plan") {
        // Fetch plan + task session IDs, then search scoped to them
        const { sessions } = await api.tasks.sessions();
        const planIds = sessions.map((s) => s.id);
        // Also get task IDs
        const details = await Promise.all(
          sessions.slice(0, 20).map((s) =>
            api.tasks.sessionDetail(s.id).catch(() => ({ tasks: [] }))
          )
        );
        const tids: string[] = [];
        for (const d of details) for (const t of (d.tasks ?? [])) tids.push(t.id);
        const allIds = [...planIds, ...tids];
        if (allIds.length === 0) {
          setRecords([]);
          setTotal(0);
          return;
        }
        const searchQ = q.trim() || "plan task";
        const data = await api.memory.searchScoped(searchQ, allIds, PAGE_SIZE);
        setRecords(data.records);
        setTotal(data.records.length);
      } else if (q.trim()) {
        const data = await api.memory.search(q.trim(), PAGE_SIZE);
        const filtered = f === "pinned" ? data.records.filter((r) => r.pinned) : data.records;
        setRecords(filtered);
        setTotal(filtered.length);
      } else if (f === "session" && currentSessionId) {
        const data = await api.memory.session(currentSessionId);
        setRecords(data.records);
        setTotal(data.records.length);
      } else if (f === "pinned") {
        const data = await api.memory.list(p, PAGE_SIZE);
        const pinned = data.records.filter((r) => r.pinned);
        setRecords(pinned);
        setTotal(pinned.length);
      } else {
        const data = await api.memory.list(p, PAGE_SIZE);
        setRecords(data.records);
        setTotal(data.total);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(query, filter, 1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filter, load]);

  useEffect(() => {
    load(query, filter, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePin = async (id: string) => { await api.memory.pin(id); load(query, filter, page); };
  const handleUnpin = async (id: string) => { await api.memory.unpin(id); load(query, filter, page); };
  const handleDelete = async (id: string) => {
    await api.memory.delete(id);
    setRecords((r) => r.filter((m) => m.id !== id));
    setTotal((t) => t - 1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const FILTER_LABELS: Record<Filter, string> = {
    all: "All memories",
    pinned: "Pinned only",
    session: "This session",
    plan: "Plan sessions",
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border">
        <h1 className="text-base font-semibold text-foreground mb-3">Memory Browser</h1>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memories semantically..."
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors font-mono"
        />
        <div className="flex items-center gap-1 mt-2 flex-wrap">
          {(["all", "pinned", "session", "plan"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={cn(
                "px-3 py-1 text-xs rounded-md border transition-colors",
                filter === f
                  ? f === "plan"
                    ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                    : "border-accent/50 bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {loading ? "Loading..." : `${total} record${total !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <div className="px-6 py-4 text-sm text-red-400">{error}</div>}
        {!loading && !error && records.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {query ? "No memories match that query." : filter === "plan" ? "No plan session memories found." : "No memories stored yet."}
          </div>
        )}
        {records.map((record) => (
          <MemoryCard
            key={record.id}
            record={record}
            onPin={handlePin}
            onUnpin={handleUnpin}
            onDelete={handleDelete}
            planSessionIds={planSessionIds}
            taskIds={taskIds}
          />
        ))}
      </div>

      {!query && filter !== "plan" && totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
