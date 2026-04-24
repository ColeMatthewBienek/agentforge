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

function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function MemoryIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

const TYPE_COLORS: Record<string, string> = {
  fact:       "text-accent",
  preference: "text-status-busy",
  plan:       "text-purple-400",
  task:       "text-status-active",
};

const TYPE_BADGE: Record<string, string> = {
  fact:       "border-accent/30 text-accent",
  preference: "border-status-busy/30 text-status-busy",
  plan:       "border-purple-500/30 text-purple-400",
  task:       "border-status-active/30 text-status-active",
};

function TypeBadge({ role, pinned }: { role: string; pinned: boolean }) {
  if (pinned) {
    return (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-yellow-500/40 text-yellow-400">
        pinned
      </span>
    );
  }
  const style = TYPE_BADGE[role] ?? "border-border text-muted-foreground";
  return (
    <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border", style)}>
      {role === "user" ? "user" : role === "assistant" ? "asst" : role}
    </span>
  );
}

function MemoryCard({
  record,
  onPin,
  onUnpin,
  onDelete,
}: {
  record: MemoryRecord;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = record.content.length > 400;
  const display = expanded ? record.content : record.content.slice(0, 400);
  const iconColor = TYPE_COLORS[record.role] ?? "text-[#484f58]";

  return (
    <div className="px-4 py-3 rounded-lg border border-[#21262d] bg-background flex items-start gap-3 group hover:border-border transition-colors">
      <MemoryIcon className={cn(iconColor, "mt-0.5 flex-shrink-0")} size={14} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-[#c9d1d9] leading-relaxed whitespace-pre-wrap break-words">
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
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[10px]">
          <TypeBadge role={record.role} pinned={record.pinned} />
          <span className="text-[#484f58]">{record.source}</span>
          <span className="text-[#30363d]">·</span>
          <span className="text-[#484f58]">{timeAgo(record.created_at)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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
          className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-status-error hover:border-status-error/30 transition-colors"
        >
          del
        </button>
      </div>
      {record.pinned && <span className="text-[13px] flex-shrink-0">📌</span>}
    </div>
  );
}

const FILTER_LABELS: Record<Filter, string> = {
  all:     "All",
  pinned:  "Pinned",
  session: "This session",
  plan:    "Plan sessions",
};

export function MemoryBrowser() {
  const currentSessionId = useAgentStore((s) => s.currentSessionId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planSessionIds, setPlanSessionIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 20;

  useEffect(() => {
    api.tasks.sessions().then(({ sessions }) => {
      setPlanSessionIds(new Set(sessions.map((s) => s.id)));
    }).catch(() => {});
  }, []);

  const load = useCallback(async (q: string, f: Filter, p: number) => {
    setLoading(true);
    setError(null);
    try {
      if (f === "plan") {
        const { sessions } = await api.tasks.sessions();
        const planIds = sessions.map((s) => s.id);
        const details = await Promise.all(
          sessions.slice(0, 20).map((s) =>
            api.tasks.sessionDetail(s.id).catch(() => ({ tasks: [] }))
          )
        );
        const tids: string[] = [];
        for (const d of details) for (const t of (d.tasks ?? [])) tids.push(t.id);
        const allIds = [...planIds, ...tids];
        if (allIds.length === 0) { setRecords([]); setTotal(0); return; }
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

  const handlePin    = async (id: string) => { await api.memory.pin(id);    load(query, filter, page); };
  const handleUnpin  = async (id: string) => { await api.memory.unpin(id);  load(query, filter, page); };
  const handleDelete = async (id: string) => {
    await api.memory.delete(id);
    setRecords((r) => r.filter((m) => m.id !== id));
    setTotal((t) => t - 1);
  };

  void planSessionIds; // used only for badge classification, kept for future wiring

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between flex-shrink-0">
        <div className="text-[14px] font-semibold text-foreground">Memory</div>
        <span className="text-[11px] text-[#484f58]">{loading ? "…" : `${total} record${total !== 1 ? "s" : ""}`}</span>
      </div>

      {/* Search bar */}
      <div className="px-5 py-3 border-b border-[#21262d]">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card">
          <SearchIcon size={14} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Semantic search across all memories..."
            className="flex-1 bg-transparent text-[13px] text-[#484f58] placeholder:text-[#484f58] outline-none"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 mt-2.5 flex-wrap">
          {(["all", "pinned", "session", "plan"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={cn(
                "px-2.5 py-1 text-[11px] rounded-md border transition-colors",
                filter === f
                  ? f === "plan"
                    ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                    : "border-accent/50 bg-accent/10 text-accent"
                  : "border-[#21262d] text-[#484f58] hover:text-muted-foreground"
              )}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {error && <div className="text-sm text-status-error px-1">{error}</div>}
        {!loading && !error && records.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-[#484f58]">
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
          />
        ))}
      </div>

      {/* Pagination */}
      {!query && filter !== "plan" && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#21262d]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-xs border border-[#21262d] rounded-md text-[#484f58] hover:text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-[11px] text-[#484f58]">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-xs border border-[#21262d] rounded-md text-[#484f58] hover:text-muted-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
