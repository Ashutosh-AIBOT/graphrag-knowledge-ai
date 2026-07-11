'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useGraphData } from '@/hooks/useGraphData';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { useGraphStore } from '@/store/graph';
import { ArrowRight, Play } from 'lucide-react';

export function HeroSection() {
  useGraphData();
  const data = useGraphStore((s) => s.data);

  return (
    <section className="relative flex min-h-[80vh] items-center overflow-hidden">
      {/* Animated graph background */}
      <div className="absolute inset-0 opacity-40">
        {data.nodes.length > 0 && <GraphVisualization height="100%" />}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-bg-base/40 via-bg-base/70 to-bg-base" />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Unlock Insights from Your Documents with{' '}
          <span className="bg-gradient-to-r from-accent-violet via-accent-indigo to-accent-cyan bg-clip-text text-transparent">
            Knowledge Graph AI
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-text-secondary sm:text-lg">
          Build intelligent knowledge graphs from your documents. Query with natural language.
          Get graph-grounded answers with multi-hop reasoning.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-md bg-accent-violet px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent-violet/20 hover:bg-accent-violet/90"
          >
            Get Started Free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-bg-surface px-5 py-2.5 text-sm font-medium text-text-primary hover:bg-bg-elevated"
          >
            <Play className="h-4 w-4" /> Watch Demo
          </Link>
        </div>
      </div>
    </section>
  );
}
