import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { api, type MemoryRecord } from "@/lib/api";
import { useAgentStore } from "@/store/agentStore";

type Filter = "all" | "pinned" | "session";

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
  const truncated = record.content.length > 500;
  const display = expanded ? record.content : record.content.slice(0, 500);

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors group">
      <RoleBadge role={record.role} pinned={record.pinned} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
          {display}
          {truncated && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="ml-1 text-accent hover:underline text-xs"
            >
              show more
            </button>
          )}
          {truncated && expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="ml-1 text-accent hover:underline text-xs"
            >
              show less
            </button>
          )}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
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
            title="Unpin"
          >
            unpin
          </button>
        ) : (
          <button
            onClick={() => onPin(record.id)}
            className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-yellow-400 hover:border-yellow-500/30 transition-colors"
            title="Pin"
          >
            pin
          </button>
        )}
        <button
          onClick={() => onDelete(record.id)}
          className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-colors"
          title="Delete"
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PAGE_SIZE = 20;

  const load = useCallback(async (q: string, f: Filter, p: number) => {
    setLoading(true);
    setError(null);
    try {
      if (q.trim()) {
        const data = await api.memory.search(q.trim(), PAGE_SIZE);
        const filtered = f === "pinned" ? data.records.filter(r => r.pinned) : data.records;
        setRecords(filtered);
        setTotal(filtered.length);
      } else if (f === "session" && currentSessionId) {
        const data = await api.memory.session(currentSessionId);
        setRecords(data.records);
        setTotal(data.records.length);
      } else if (f === "pinned") {
        const data = await api.memory.list(p, PAGE_SIZE);
        const pinned = data.records.filter(r => r.pinned);
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

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(query, filter, 1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filter, load]);

  // Reload on page change
  useEffect(() => {
    load(query, filter, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePin = async (id: string) => {
    await api.memory.pin(id);
    load(query, filter, page);
  };

  const handleUnpin = async (id: string) => {
    await api.memory.unpin(id);
    load(query, filter, page);
  };

  const handleDelete = async (id: string) => {
    await api.memory.delete(id);
    setRecords(r => r.filter(m => m.id !== id));
    setTotal(t => t - 1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h1 className="text-base font-semibold text-foreground mb-3">Memory Browser</h1>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search memories semantically..."
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors font-mono"
        />
        <div className="flex items-center gap-1 mt-2">
          {(["all", "pinned", "session"] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={cn(
                "px-3 py-1 text-xs rounded-md border transition-colors",
                filter === f
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? "All memories" : f === "pinned" ? "Pinned only" : "This session"}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {loading ? "Loading..." : `${total} record${total !== 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="px-6 py-4 text-sm text-red-400">{error}</div>
        )}
        {!loading && !error && records.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {query ? "No memories match that query." : "No memories stored yet."}
          </div>
        )}
        {records.map(record => (
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
      {!query && totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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
