'use client';

import React from 'react';
import { useGraphStore } from '@/store/graph';
import { entityColor } from '@/lib/constants';
import {
  GitBranch, ChevronRight, FileText, Zap, Copy, Check, Info
} from 'lucide-react';

export interface Hop {
  from: string;
  rel: string;
  to: string;
  doc?: string;
}

interface PathViewProps {
  hops: Hop[];
  alternativePaths: Hop[][];
  activeTab: number;
  onTabChange: (index: number) => void;
  explanation: string;
  entityA: string;
  entityB: string;
  copied: boolean;
  onCopy: () => void;
}

function NodeBadge({ name, isStart, isEnd }: { name: string; isStart?: boolean; isEnd?: boolean }) {
  const nodes = useGraphStore((s) => s.data.nodes);
  const foundNode = nodes.find(n => n.name === name || n.id === name);
  const type = foundNode ? foundNode.type : 'ENTITY';
  const color = entityColor(type);
  
  const bg = `${color}14`; // ~8% opacity
  const border = `${color}4D`; // ~30% opacity

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-xl px-4 py-2.5 min-w-[100px] text-center transition-all hover:scale-105 border shadow-sm backdrop-blur-sm"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70" style={{ color }}>{type}</span>
      </div>
      <span className="text-sm font-bold leading-tight text-white">{name}</span>
      {isStart && <span className="text-[9px] uppercase tracking-widest text-accent-cyan/85 font-mono">Start Node</span>}
      {isEnd && <span className="text-[9px] uppercase tracking-widest text-accent-indigo/85 font-mono">End Node</span>}
    </div>
  );
}

function RelArrow({ rel, doc }: { rel: string; doc?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 min-w-[90px] relative">
      {/* Connector Line */}
      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-accent-cyan/35 to-accent-indigo/35 -translate-y-2 z-0" />
      
      {/* Relation Type Badge */}
      <span className="relative z-10 rounded-full bg-accent-cyan/15 border border-accent-cyan/30 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-cyan whitespace-nowrap shadow-sm backdrop-blur-md">
        {rel.replace(/_/g, ' ')}
      </span>
      <ChevronRight className="h-4 w-4 text-accent-cyan relative z-10 animate-bounce-horizontal" />
      {doc && (
        <span className="flex items-center gap-0.5 text-[9px] text-text-muted truncate max-w-[95px] relative z-10 bg-bg-surface px-1 rounded border border-border/40">
          <FileText className="h-2.5 w-2.5 shrink-0 text-accent-cyan/70" />
          {doc.replace(/\.[^.]+$/, '')}
        </span>
      )}
    </div>
  );
}

export function PathView({
  hops,
  alternativePaths,
  activeTab,
  onTabChange,
  explanation,
  entityA,
  entityB,
  copied,
  onCopy,
}: PathViewProps) {
  const allPaths = [hops, ...alternativePaths];

  // Helper to generate a professional tab label indicating intermediate steps
  const getPathLabel = (pathHops: Hop[], index: number) => {
    if (pathHops.length === 0) return `Path ${index + 1}`;
    
    // Extract intermediate node names (endpoints of relationships except the last destination)
    const intermediates: string[] = [];
    for (let stepIdx = 0; stepIdx < pathHops.length - 1; stepIdx++) {
      intermediates.push(pathHops[stepIdx].to);
    }
    
    const prefix = index === 0 ? 'Primary Path' : `Alt Path ${index}`;
    if (intermediates.length > 0) {
      return `${prefix} via ${intermediates.join(', ')}`;
    }
    return `${prefix} (Direct)`;
  };

  const currentPath = allPaths[activeTab] || [];

  return (
    <div className="space-y-4">
      {/* ── PATH TITLE BANNER ── */}
      <div className="flex items-center justify-between rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-3 shadow-inner">
        <div className="flex items-center gap-2 flex-wrap">
          <GitBranch className="h-4 w-4 text-accent-cyan" />
          <span className="text-sm font-semibold text-accent-cyan">Reasoning Path Found</span>
          <span className="rounded-full bg-accent-cyan/20 px-2 py-0.5 text-xs font-bold text-accent-cyan">
            {currentPath.length} hop{currentPath.length !== 1 ? 's' : ''}
          </span>
          {alternativePaths.length > 0 && (
            <span className="rounded-full bg-accent-indigo/20 px-2 py-0.5 text-xs font-bold text-accent-indigo">
              +{alternativePaths.length} alternative path{alternativePaths.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-all border border-border/50 hover:border-accent-cyan/40"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy Path'}
        </button>
      </div>

      {/* ── PATH TABS (IF MULTIPLE PATHS EXIST) ── */}
      {allPaths.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border/60 pb-0">
          {allPaths.map((_, i) => {
            const isActive = activeTab === i;
            return (
              <button
                key={i}
                onClick={() => onTabChange(i)}
                className={`rounded-t-lg px-3.5 py-2 text-xs font-medium border-b-2 transition-all duration-150 ${
                  isActive
                    ? i === 0
                      ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/5'
                      : 'border-accent-indigo text-accent-indigo bg-accent-indigo/5'
                    : 'border-transparent text-text-muted hover:text-text-primary hover:bg-bg-elevated/40'
                }`}
              >
                {getPathLabel(allPaths[i], i)}
              </button>
            );
          })}
        </div>
      )}

      {/* ── VISUAL CHAIN DIAGRAM ── */}
      <div className="rounded-xl border border-border/80 bg-bg-surface/50 p-5 space-y-4 shadow-sm backdrop-blur-md">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-accent-cyan" />
          Interactive Visual Chain Flow
        </p>

        <div className="flex flex-row items-center overflow-x-auto py-3 scrollbar-thin gap-1">
          {currentPath.map((hop, i) => (
            <div key={i} className="flex items-center">
              <NodeBadge
                name={hop.from}
                isStart={i === 0}
              />
              <RelArrow rel={hop.rel} doc={hop.doc} />
              {i === currentPath.length - 1 && (
                <NodeBadge name={hop.to} isEnd />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP-BY-STEP DESCRIPTIVE ANNOTATION ── */}
        <div className="space-y-2 mt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Path Step Details
          </p>
          {currentPath.map((hop, i) => (
            <div
              key={i}
              className="flex items-start gap-3.5 rounded-xl bg-bg-base/70 px-4 py-3 border border-border/40 hover:border-accent-cyan/30 transition-all hover:bg-bg-base/90"
            >
              <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/35 shadow-sm">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white hover:text-accent-cyan transition-colors cursor-pointer">
                    {hop.from}
                  </span>
                  <span className="rounded bg-accent-cyan/10 border border-accent-cyan/20 px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-accent-cyan">
                    {hop.rel.replace(/_/g, ' ')}
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-muted/60" />
                  <span className="text-sm font-bold text-accent-indigo hover:text-accent-indigo/80 transition-colors cursor-pointer">
                    {hop.to}
                  </span>
                </div>
                {hop.doc && (
                  <div className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted bg-bg-surface/50 w-max px-2 py-0.5 rounded border border-border/40">
                    <FileText className="h-3 w-3 text-accent-cyan" />
                    <span>Source Document: <strong className="text-text-secondary">{hop.doc}</strong></span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── AI CONCLUSION CARD ── */}
      {explanation && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 shadow-sm backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 h-24 w-24 bg-green-500/10 rounded-full blur-2xl -mr-8 -mt-8" />
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-green-400">
            <Zap className="h-4 w-4 animate-pulse text-green-400" />
            AI Reasoning Explanation
          </p>
          <p className="text-sm text-text-secondary leading-relaxed bg-black/10 p-3 rounded-lg border border-white/5 font-medium">
            {explanation}
          </p>
        </div>
      )}
    </div>
  );
}
