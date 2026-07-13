'use client';

import { useEffect, useState } from 'react';
import { History, RotateCcw, ChevronDown, ChevronUp, Clock, Trash2, Loader2 } from 'lucide-react';
import { useHistoryStore, HistoryItem } from '@/store/history';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

interface QueryHistoryProps {
  onSelect: (query: string, item?: HistoryItem) => void;
}

export function QueryHistory({ onSelect }: QueryHistoryProps) {
  const { items, loaded, setItems, clear } = useHistoryStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loaded) return;
    setLoading(true);
    api
      .get('/query/history/')
      .then(({ data }) => {
        const backendItems: HistoryItem[] = (data.results || data || []).map((item: any) => ({
          id: String(item.id),
          query_text: item.query_text,
          retrieval_mode: item.retrieval_mode,
          answer_text: item.answer_text,
          answer_preview: item.answer_preview,
          response_time: item.response_time,
          created_at: item.created_at,
        }));

        const currentItems = useHistoryStore.getState().items;

        const merged = [...backendItems, ...currentItems].filter(
          (item, index, self) =>
            index ===
            self.findIndex(
              (t) => t.query_text === item.query_text && t.created_at === item.created_at
            )
        );

        merged.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setItems(merged.slice(0, 50));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loaded, setItems]);

  function handleClear() {
    clear();
    api.delete('/query/history/').catch(() => {});
  }

  function formatTime(dateStr: string) {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  }

  return (
    <div className="border-t border-border">
      <div className="flex items-center">
        <button
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center gap-2 px-4 py-2 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          {loading ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Syncing...
            </span>
          ) : (
            <span>Recent Queries ({items.length})</span>
          )}
          {open ? (
            <ChevronUp className="ml-auto h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="ml-auto h-3.5 w-3.5" />
          )}
        </button>
        {items.length > 0 && open && (
          <button
            onClick={handleClear}
            className="px-3 py-2 text-text-muted hover:text-error transition-colors"
            title="Clear history"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="max-h-64 overflow-y-auto border-t border-border scrollbar-thin">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-xs text-text-muted">No queries yet.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.query_text, item);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-bg-surface transition-colors group"
              >
                <RotateCcw className="mt-0.5 h-3 w-3 shrink-0 text-text-muted group-hover:text-accent-violet transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary">
                    {item.query_text}
                  </p>
                  {(item as any).answer_preview && (
                    <p className="mt-0.5 truncate text-[10px] text-text-muted">
                      {(item as any).answer_preview}
                    </p>
                  )}
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded px-1 py-px text-[9px] font-semibold uppercase',
                        item.retrieval_mode === 'HYBRID'
                          ? 'bg-accent-violet/20 text-accent-violet'
                          : item.retrieval_mode === 'GRAPH'
                          ? 'bg-accent-cyan/20 text-accent-cyan'
                          : item.retrieval_mode === 'MULTIHOP'
                          ? 'bg-accent-indigo/25 text-accent-indigo border border-accent-indigo/20'
                          : 'bg-emerald-500/20 text-emerald-400'
                      )}
                    >
                      {item.retrieval_mode}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-text-muted">
                      <Clock className="h-2.5 w-2.5" />
                      {formatTime(item.created_at)}
                    </span>
                    <span className="text-[10px] text-text-muted">
                      {item.response_time > 0
                        ? `${(item.response_time * 1000).toFixed(0)}ms`
                        : ''}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
