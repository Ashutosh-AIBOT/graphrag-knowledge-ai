'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { useGraphStore } from '@/store/graph';
import { entityColor } from '@/lib/constants';
import { HubEntities } from './HubEntities';

export function GraphStats() {
  const data = useGraphStore((s) => s.data);

  const typeData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.nodes.forEach((n) => (counts[n.type] = (counts[n.type] || 0) + 1));
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [data.nodes]);

  return (
    <div className="space-y-4 rounded-md border border-border bg-bg-surface p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-bg-elevated p-3 text-center">
          <p className="text-2xl font-bold text-accent-violet">{data.nodes.length}</p>
          <p className="text-xs text-text-muted">Nodes</p>
        </div>
        <div className="rounded-md bg-bg-elevated p-3 text-center">
          <p className="text-2xl font-bold text-accent-cyan">{data.links.length}</p>
          <p className="text-xs text-text-muted">Edges</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
          By Type
        </p>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={typeData} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="type"
                width={80}
                tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(215 28% 11%)',
                  border: '1px solid hsl(215 20% 15%)',
                  fontSize: 12,
                }}
                cursor={{ fill: 'hsl(215 28% 15%)' }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {typeData.map((d) => (
                  <Cell key={d.type} fill={entityColor(d.type)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <HubEntities />
    </div>
  );
}
