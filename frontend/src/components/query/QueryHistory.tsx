'use client';

import { useEffect, useState } from 'react';
import { History, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { useHistoryStore, HistoryItem } from '@/store/history';
import api from '@/lib/axios';

interface QueryHistoryProps {
  onSelect: (query: string) => void;
}

export function QueryHistory({ onSelect }: QueryHistoryProps) {
  const { items, loaded, setItems } = useHistoryStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loaded) return;
    setLoading(true);
    api
      .get('/query/history/')
      .then(({ data }) => {
        const list = data.results || data || [];
        if (Array.isArray(list)) {
          setItems(list.map((item: any) => ({
            id: item.id,
            query_text: item.query_text,
            retrieval_mode: item.retrieval_mode,
            answer_text: item.answer_text,
            response_time: item.response_time,
            created_at: item.created_at,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loaded, setItems]);

  if (!loaded && !loading) return null;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        Recent Queries ({items.length})
        {open ? <ChevronDown className="ml-auto h-3.5 w-3.5" /> : <ChevronUp className="ml-auto h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto border-t border-border scrollbar-thin">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-xs text-text-muted">No queries yet.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item.query_text); setOpen(false); }}
                className="flex w-full items-start gap-2 px-4 py-2 text-left hover:bg-bg-surface transition-colors"
              >
                <RotateCcw className="mt-0.5 h-3 w-3 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary">{item.query_text}</p>
                  <p className="text-[10px] text-text-muted">
                    {item.retrieval_mode} · {(item.response_time * 1000).toFixed(0)}ms
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
