'use client';

import { ChevronRight, GitBranch, ArrowRight, Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useState } from 'react';

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
  hopCount?: number;
  entityA?: string;
  entityB?: string;
  standalone?: boolean;
}

export function PathView({
  hops,
  conclusion,
  alternativePaths = [],
  hopCount,
  entityA,
  entityB,
  standalone = false,
}: PathViewProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  if (!hops || hops.length === 0) return null;

  const totalHops = hopCount ?? hops.length;

  const handleCopy = () => {
    const text = hops
      .map((h) => `${h.from} --[${h.rel.replace(/_/g, ' ')}]--> ${h.to}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderChain = (chain: Hop[], index?: number) => (
    <div key={index ?? 'main'} className="space-y-2">
      {index !== undefined && (
        <p className="text-xs font-medium text-text-muted">Alternative Path {index + 1}</p>
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

  const renderStandalone = () => (
    <div className="space-y-4 rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-accent-cyan">
          <GitBranch className="h-4 w-4" /> Multi-Hop Reasoning Path
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">{totalHops} hop{totalHops !== 1 ? 's' : ''}</Badge>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Entity pair header */}
      {entityA && entityB && (
        <div className="flex items-center gap-2 rounded-md bg-bg-elevated px-3 py-2">
          <span className="text-sm font-medium text-text-primary">{entityA}</span>
          <ArrowRight className="h-4 w-4 text-text-muted" />
          <span className="text-sm font-medium text-accent-violet">{entityB}</span>
        </div>
      )}

      {/* Vertical timeline layout */}
      <div className="space-y-0">
        {hops.map((hop, i) => (
          <div key={i} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-cyan/20 text-xs font-bold text-accent-cyan">
                {i + 1}
              </div>
              {i < hops.length - 1 && (
                <div className="w-0.5 flex-1 bg-accent-cyan/20" />
              )}
            </div>
            {/* Hop content */}
            <div className="flex-1 pb-4">
              <div className="rounded-md border border-border bg-bg-base p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-text-primary">{hop.from}</span>
                  <span className="rounded-md bg-accent-cyan/10 px-2 py-0.5 text-[10px] font-medium uppercase text-accent-cyan">
                    {hop.rel.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm font-semibold text-accent-violet">{hop.to}</span>
                </div>
                {hop.doc && (
                  <p className="mt-1 text-[10px] text-text-muted">Source: {hop.doc}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alternative paths tabs */}
      {alternativePaths.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-2 border-b border-border">
            <button
              onClick={() => setActiveTab(0)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors',
                activeTab === 0
                  ? 'border-accent-cyan text-accent-cyan'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              )}
            >
              Primary Path
            </button>
            {alternativePaths.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i + 1)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium border-b-2 transition-colors',
                  activeTab === i + 1
                    ? 'border-accent-indigo text-accent-indigo'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                )}
              >
                Path {i + 2}
              </button>
            ))}
          </div>
          {activeTab === 0 && renderChain(hops)}
          {activeTab > 0 && renderChain(alternativePaths[activeTab - 1], activeTab)}
        </div>
      )}

      {/* Conclusion */}
      {conclusion && (
        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-text-primary">
          <span className="font-semibold text-success">Conclusion: </span>
          {conclusion}
        </div>
      )}
    </div>
  );

  // Compact mode (default — used in Query page)
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
          <span className="font-semibold text-success">Conclusion: </span>
          {conclusion}
        </div>
      )}
    </div>
  );
}
