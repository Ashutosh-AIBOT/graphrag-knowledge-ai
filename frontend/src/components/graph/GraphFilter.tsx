'use client';

import { useMemo } from 'react';
import { useGraphStore } from '@/store/graph';
import { cn } from '@/lib/utils';

export function GraphFilter() {
  const data = useGraphStore((s) => s.data);
  const visibleRelationships = useGraphStore((s) => s.visibleRelationships);
  const toggleRelationship = useGraphStore((s) => s.toggleRelationship);

  const relTypes = useMemo(() => {
    const types = new Set(data.links.map((l) => l.type));
    return Array.from(types).sort();
  }, [data.links]);

  const relCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.links.forEach((l) => (counts[l.type] = (counts[l.type] || 0) + 1));
    return counts;
  }, [data.links]);

  if (relTypes.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-surface p-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Relationships:
      </span>
      {relTypes.map((rel) => {
        const hidden = visibleRelationships[rel] === false;
        return (
          <button
            key={rel}
            onClick={() => toggleRelationship(rel)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              hidden
                ? 'border-border bg-transparent text-text-muted line-through'
                : 'border-accent-violet/40 bg-accent-violet/10 text-accent-violet'
            )}
          >
            {rel.replace(/_/g, ' ')} ({relCounts[rel] || 0})
          </button>
        );
      })}
    </div>
  );
}
