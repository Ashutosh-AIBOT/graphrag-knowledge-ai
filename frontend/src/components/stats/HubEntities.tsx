'use client';

import { useMemo } from 'react';
import { useGraphStore } from '@/store/graph';
import { entityColor } from '@/lib/constants';

export function HubEntities() {
  const data = useGraphStore((s) => s.data);

  const hubs = useMemo(() => {
    const degree: Record<string, number> = {};
    data.links.forEach((l) => {
      degree[l.source] = (degree[l.source] || 0) + 1;
      degree[l.target] = (degree[l.target] || 0) + 1;
    });
    return data.nodes
      .map((n) => ({
        name: n.name,
        type: n.type,
        degree: degree[n.id] || 0,
      }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 10);
  }, [data]);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Top 10 Hub Entities
      </p>
      <ol className="space-y-1.5">
        {hubs.map((h, i) => (
          <li
            key={h.name}
            className="flex items-center gap-2 rounded-md border border-border bg-bg-base px-2.5 py-1.5 text-sm"
          >
            <span className="w-4 text-xs font-semibold text-text-muted">{i + 1}</span>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entityColor(h.type) }}
            />
            <span className="flex-1 truncate text-text-secondary">{h.name}</span>
            <span className="text-xs font-medium text-text-muted">{h.degree}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
