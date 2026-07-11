'use client';

import { useEffect, useState } from 'react';
import { History, RotateCcw, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { useHistoryStore, HistoryItem } from '@/store/history';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

interface QueryHistoryProps {
  onSelect: (query: string, item?: HistoryItem) => void;
}

export function QueryHistory({ onSelect }: QueryHistoryProps) {
  const { items, loaded, setItems } = useHistoryStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sync fresh history from backend on mount (but items from localStorage are already shown)
  useEffect(() => {
    setLoading(true);
    api
      .get('/query/history/')
      .then(({ data }) => {
        const list = data.results || data || [];
        if (Array.isArray(list)) {
          setItems(
            list.map((item: any) => ({
              id: item.id,
              query_text: item.query_text,
              retrieval_mode: item.retrieval_mode,
              answer_text: item.answer_text,
              response_time: item.response_time,
              created_at: item.created_at,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (items.length === 0 && !loading) return null;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        Recent Queries ({items.length})
        {open ? (
          <ChevronUp className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div className="max-h-56 overflow-y-auto border-t border-border scrollbar-thin">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-xs text-text-muted">No queries yet.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item.query_text, item); setOpen(false); }}
                className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-bg-surface transition-colors group"
              >
                <RotateCcw className="mt-0.5 h-3 w-3 shrink-0 text-text-muted group-hover:text-accent-violet transition-colors" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary">{item.query_text}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className={cn(
                      'rounded px-1 py-px text-[9px] font-semibold uppercase',
                      item.retrieval_mode === 'HYBRID' ? 'bg-accent-violet/20 text-accent-violet' :
                      item.retrieval_mode === 'GRAPH' ? 'bg-accent-cyan/20 text-accent-cyan' :
                      'bg-emerald-500/20 text-emerald-400'
                    )}>
                      {item.retrieval_mode}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-text-muted">
                      <Clock className="h-2.5 w-2.5" />
                      {(item.response_time * 1000).toFixed(0)}ms
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
