'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/axios';

interface Stats {
  nodes: number;
  edges: number;
  types: number;
  documents: number;
}

function Counter({ value, suffix, decimals = 0 }: { value: number; suffix: string; decimals?: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        let start = 0;
        const dur = 1200;
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min((t - t0) / dur, 1);
          setN(value * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        obs.disconnect();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);
  return (
    <span ref={ref}>
      {n.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export function StatsCounter() {
  const [stats, setStats] = useState<Stats>({ nodes: 0, edges: 0, types: 0, documents: 0 });

  useEffect(() => {
    Promise.all([
      api.get('/graph/stats/').catch(() => ({ data: { nodes_count: 0, edges_count: 0, type_distribution: [] } })),
      api.get('/documents/').catch(() => ({ data: { count: 0 } })),
    ]).then(([graphRes, docsRes]) => {
      setStats({
        nodes: graphRes.data.nodes_count || 0,
        edges: graphRes.data.edges_count || 0,
        types: (graphRes.data.type_distribution || []).length,
        documents: docsRes.data.count || (docsRes.data.results || []).length || 0,
      });
    });
  }, []);

  const STAT_ITEMS = [
    { label: 'Graph Nodes', value: stats.nodes, suffix: '' },
    { label: 'Relationships', value: stats.edges, suffix: '' },
    { label: 'Entity Types', value: stats.types, suffix: '' },
    { label: 'Documents', value: stats.documents, suffix: '' },
  ];

  if (stats.nodes === 0 && stats.documents === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-center text-sm uppercase tracking-wide text-text-muted">
        Knowledge Graph Statistics
      </p>
      <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {STAT_ITEMS.map((s) => (
          <div key={s.label} className="text-center">
            <p className="bg-gradient-to-r from-accent-violet to-accent-cyan bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
              <Counter value={s.value} suffix={s.suffix} />
            </p>
            <p className="mt-1 text-sm text-text-secondary">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
