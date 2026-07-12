'use client';

import { useMemo, useState } from 'react';
import { useGraphStore } from '@/store/graph';
import { entityColor } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function GraphLegend() {
  const data = useGraphStore((s) => s.data);
  const visibleTypes = useGraphStore((s) => s.visibleTypes);
  const toggleType = useGraphStore((s) => s.toggleType);
  const [open, setOpen] = useState(true);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.nodes.forEach((n) => (counts[n.type] = (counts[n.type] || 0) + 1));
    return counts;
  }, [data.nodes]);

  const sortedTypes = useMemo(
    () => Object.entries(typeCounts).sort((a, b) => b[1] - a[1]),
    [typeCounts]
  );

  return (
    <div className="absolute bottom-3 left-3 z-20 max-w-[220px] rounded-md border border-border bg-bg-elevated/95 p-3 shadow-lg backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        Entity Types {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul className="max-h-[320px] space-y-1 overflow-y-auto scrollbar-thin">
          {sortedTypes.map(([type, count]) => {
            const hidden = visibleTypes[type] === false;
            return (
              <li key={type}>
                <button
                  onClick={() => toggleType(type)}
                  className={cn(
                    'flex w-full items-center gap-2 text-xs transition-opacity',
                    hidden && 'opacity-40'
                  )}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: entityColor(type) }}
                  />
                  <span className="flex-1 text-left text-text-secondary truncate">{type}</span>
                  <span className="shrink-0 text-text-muted">{count}</span>
                </button>
              </li>
            );
          })}
          {sortedTypes.length === 0 && (
            <li className="text-xs text-text-muted">No entities loaded</li>
          )}
        </ul>
      )}
    </div>
  );
}
