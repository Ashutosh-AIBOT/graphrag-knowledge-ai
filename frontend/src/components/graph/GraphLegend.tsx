'use client';

import { useMemo, useState } from 'react';
import { useGraphStore } from '@/store/graph';
import { ENTITY_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function GraphLegend() {
  const data = useGraphStore((s) => s.data);
  const visibleTypes = useGraphStore((s) => s.visibleTypes);
  const toggleType = useGraphStore((s) => s.toggleType);
  const [open, setOpen] = useState(true);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data.nodes.forEach((n) => (c[n.type] = (c[n.type] || 0) + 1));
    return c;
  }, [data.nodes]);

  return (
    <div className="absolute bottom-3 left-3 max-w-[200px] rounded-md border border-border bg-bg-elevated/90 p-3 shadow-sm backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        Legend {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul className="space-y-1.5">
          {Object.entries(ENTITY_COLORS).map(([type, color]) => {
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
                    style={{ backgroundColor: color }}
                  />
                  <span className="flex-1 text-left text-text-secondary">{type}</span>
                  <span className="text-text-muted">{counts[type] || 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
