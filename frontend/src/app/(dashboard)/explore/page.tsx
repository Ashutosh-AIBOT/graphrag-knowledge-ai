'use client';

import { useGraphData } from '@/hooks/useGraphData';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { GraphFilter } from '@/components/graph/GraphFilter';
import { SourceFilter } from '@/components/graph/SourceFilter';
import { GraphStats } from '@/components/stats/GraphStats';

export default function ExplorePage() {
  useGraphData();
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        {/* Full screen graph */}
        <div className="relative min-w-0 flex-1">
          <GraphVisualization />
        </div>

        {/* Statistics sidebar */}
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-bg-base p-4 scrollbar-thin lg:block">
          <GraphStats />
        </aside>
      </div>

      {/* Filter bars */}
      <div className="space-y-2 border-t border-border bg-bg-surface p-3">
        <SourceFilter />
        <GraphFilter />
      </div>
    </div>
  );
}
