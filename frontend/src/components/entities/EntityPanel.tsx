'use client';

import { useEffect, useState } from 'react';
import { X, MessageSquare, ExternalLink } from 'lucide-react';
import { useGraphStore, GraphNode } from '@/store/graph';
import { entityColor } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';

interface EntityDetail {
  description?: string;
  sourceDoc?: string;
  relationships: { target: string; type: string; confidence?: number }[];
}

export function EntityPanel({
  onAsk,
}: {
  onAsk?: (name: string) => void;
}) {
  const selected = useGraphStore((s) => s.selectedEntity);
  const close = () => useGraphStore.getState().selectEntity(null);
  const [detail, setDetail] = useState<EntityDetail | null>(null);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    // Build relationships by scanning graph links
    const { data } = useGraphStore.getState();
    const rels = data.links
      .filter((l) => l.source === selected.id || l.target === selected.id)
      .map((l) => ({
        target: l.source === selected.id ? l.target : l.source,
        type: l.type,
        confidence: l.confidence,
      }));
    setDetail({
      description: selected.description,
      sourceDoc: selected.sourceDoc,
      relationships: rels,
    });
  }, [selected]);

  if (!selected) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm animate-slide-in flex-col border-l border-border bg-bg-surface shadow-2xl">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: entityColor(selected.type) }}
          />
          <span className="font-semibold">{selected.name}</span>
        </div>
        <button onClick={close} aria-label="Close" className="text-text-muted hover:text-text-primary">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        <div>
          <Badge variant="info">{selected.type}</Badge>
        </div>
        {detail?.description && (
          <p className="text-sm text-text-secondary">{detail.description}</p>
        )}
        {detail?.sourceDoc && (
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <ExternalLink className="h-3.5 w-3.5" /> Source: {detail.sourceDoc}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Relationships ({detail?.relationships.length || 0})
          </p>
          <ul className="space-y-1.5">
            {detail?.relationships.map((r, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-md border border-border bg-bg-base px-3 py-2 text-sm"
              >
                <span className="font-medium text-accent-cyan">
                  {r.type.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span className="text-text-secondary">{r.target}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {onAsk && (
        <div className="border-t border-border p-4">
          <button
            onClick={() => onAsk(selected.name)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent-violet px-4 py-2 text-sm font-medium text-white hover:bg-accent-violet/90"
          >
            <MessageSquare className="h-4 w-4" /> Ask about this entity
          </button>
        </div>
      )}
    </div>
  );
}
