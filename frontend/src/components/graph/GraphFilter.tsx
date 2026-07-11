'use client';

import { useGraphStore } from '@/store/graph';
import { RELATIONSHIP_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function GraphFilter() {
  const visibleRelationships = useGraphStore((s) => s.visibleRelationships);
  const toggleRelationship = useGraphStore((s) => s.toggleRelationship);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-surface p-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Relationships:
      </span>
      {RELATIONSHIP_TYPES.map((rel) => {
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
            {rel.replace(/_/g, ' ')}
          </button>
        );
      })}
    </div>
  );
}
