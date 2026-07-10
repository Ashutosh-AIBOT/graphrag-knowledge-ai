'use client';

import { useEffect, useRef, useState } from 'react';

const STATS = [
  { label: 'Documents Indexed', value: 10000, suffix: '+' },
  { label: 'Entities Extracted', value: 500, suffix: '+' },
  { label: 'Uptime', value: 99.9, suffix: '%', decimals: 1 },
  { label: 'Avg Response', value: 50, suffix: 'ms' },
];

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
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <p className="text-center text-sm uppercase tracking-wide text-text-muted">
        Trusted by researchers and teams
      </p>
      <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <p className="bg-gradient-to-r from-accent-violet to-accent-cyan bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
              <Counter value={s.value} suffix={s.suffix} decimals={s.decimals} />
            </p>
            <p className="mt-1 text-sm text-text-secondary">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
