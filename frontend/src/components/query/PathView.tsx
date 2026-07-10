'use client';

import { ChevronRight, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface Hop {
  from: string;
  rel: string;
  to: string;
  doc?: string;
}

interface PathViewProps {
  hops: Hop[];
  conclusion?: string;
  alternativePaths?: Hop[][];
}

export function PathView({ hops, conclusion, alternativePaths = [] }: PathViewProps) {
  if (!hops || hops.length === 0) return null;

  const renderChain = (chain: Hop[], index?: number) => (
    <div key={index ?? 'main'} className="space-y-2">
      {index !== undefined && (
        <p className="text-xs font-medium text-text-muted">Path {index + 1}</p>
      )}
      <div
        className={cn(
          'flex flex-wrap items-stretch gap-1.5 overflow-x-auto rounded-md border border-border bg-bg-base p-3 scrollbar-thin',
          index !== undefined && 'border-accent-indigo/30 bg-accent-indigo/5'
        )}
      >
        {chain.map((hop, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center rounded-md bg-bg-elevated px-3 py-2">
              <span className="text-sm font-semibold text-text-primary">{hop.from}</span>
              {hop.doc && <span className="text-[10px] text-text-muted">{hop.doc}</span>}
            </div>
            <div className="flex flex-col items-center px-1">
              <ChevronRight className="h-4 w-4 text-text-muted" />
              <span className="whitespace-nowrap text-[10px] font-medium uppercase text-accent-cyan">
                {hop.rel.replace(/_/g, ' ')}
              </span>
            </div>
            {i === chain.length - 1 && (
              <div className="flex flex-col items-center rounded-md bg-accent-violet/10 px-3 py-2">
                <span className="text-sm font-semibold text-accent-violet">{hop.to}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 rounded-md border border-accent-cyan/30 bg-accent-cyan/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-accent-cyan">
        <GitBranch className="h-4 w-4" /> Multi-Hop Reasoning Path
      </div>

      {renderChain(hops)}

      {alternativePaths.length > 0 &&
        alternativePaths.map((p, i) => renderChain(p, i + 1))}

      {conclusion && (
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-text-primary">
          <span className="font-semibold text-success">✓ Conclusion: </span>
          {conclusion}
        </div>
      )}
    </div>
  );
}
