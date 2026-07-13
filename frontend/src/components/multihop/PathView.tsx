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
  chunk_text?: string;
}

interface AlternativePath {
  hops: Hop[];
  explanation: string;
}

interface PathViewProps {
  hops: Hop[];
  alternativePaths: AlternativePath[];
  activeTab: number;
  onTabChange: (index: number) => void;
  explanation: string;
  entityA: string;
  entityB: string;
  copied: boolean;
  onCopy: () => void;
  onExplainPath?: (index: number) => void;
  explainingLoading?: boolean;
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

function StepRow({ hop, index }: { hop: Hop; index: number }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className="flex flex-col gap-2 rounded-xl bg-bg-base/70 px-4 py-3 border border-border/40 hover:border-accent-cyan/30 transition-all hover:bg-bg-base/90"
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/35 shadow-sm">
          {index + 1}
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
          
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {hop.doc && (
              <div className="flex items-center gap-1 text-[11px] text-text-muted bg-bg-surface/50 px-2 py-0.5 rounded border border-border/40">
                <FileText className="h-3 w-3 text-accent-cyan" />
                <span>Source Document: <strong className="text-text-secondary">{hop.doc}</strong></span>
              </div>
            )}
            
            {hop.chunk_text && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[11px] font-semibold text-accent-cyan hover:text-accent-cyan/80 bg-accent-cyan/10 border border-accent-cyan/20 px-2 py-0.5 rounded transition-all"
              >
                <Zap className="h-3 w-3" />
                {expanded ? 'Hide Ingested Chunk' : 'View Ingested Text Chunk'}
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && hop.chunk_text && (
        <div className="mt-2 ml-9 rounded-lg border border-accent-cyan/25 bg-bg-surface/80 p-3 text-xs leading-relaxed text-text-secondary max-h-40 overflow-y-auto scrollbar-thin shadow-inner animate-fade-in">
          <p className="font-semibold text-[10px] uppercase tracking-wider text-accent-cyan mb-1.5 flex items-center gap-1">
            <Info className="h-3 w-3" /> Verbatim Ingested Text Chunk
          </p>
          <div className="whitespace-pre-wrap font-mono text-[11px] bg-black/25 p-2 rounded border border-white/5 text-text-primary/90 select-text">
            {hop.chunk_text}
          </div>
        </div>
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
  onExplainPath,
  explainingLoading,
}: PathViewProps) {
  const pathsList = [
    { hops, explanation },
    ...alternativePaths
  ];

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

  const currentPath = pathsList[activeTab]?.hops || [];
  const currentExplanation = pathsList[activeTab]?.explanation || '';

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

      {/* ── STICKY PATH CONTROLLER ── */}
      <div className="sticky top-0 z-20 -mx-4 px-4 bg-bg-base/95 backdrop-blur-md pb-4 pt-1 border-b border-border/40 space-y-3 shadow-md">
        {/* ── PATH TABS (IF MULTIPLE PATHS EXIST) ── */}
        {pathsList.length > 1 && (
          <div className="flex flex-wrap gap-1 bg-bg-base/60 p-1 rounded-xl border border-border/40 backdrop-blur-sm shadow-inner">
            {pathsList.map((_, i) => {
              const isActive = activeTab === i;
              return (
                <button
                  key={i}
                  onClick={() => onTabChange(i)}
                  className={`flex-1 min-w-[120px] rounded-lg px-3 py-2 text-xs font-bold transition-all duration-150 flex items-center justify-center gap-1.5 ${
                    isActive
                      ? i === 0
                        ? 'bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan shadow-sm font-extrabold'
                        : 'bg-accent-indigo/15 border border-accent-indigo/30 text-accent-indigo shadow-sm font-extrabold'
                      : 'bg-transparent border border-transparent text-text-muted hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  {i === 0 ? 'Path 1 (Primary)' : `Path ${i + 1} (Alternative)`}
                </button>
              );
            })}
          </div>
        )}

        {/* ── ACTIVE PATH SUMMARY BREADCRUMB ── */}
        <div className="rounded-xl border border-border/60 bg-bg-surface/35 p-3 flex flex-col gap-2 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Active Graph Pathway: {activeTab === 0 ? 'Primary Route' : `Alternative Route ${activeTab}`}
            </span>
            <span className="flex items-center gap-1 rounded bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Highlighted on Graph
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-sm font-semibold text-white/95 select-none">
            {(() => {
              const nodesList: string[] = [];
              if (currentPath.length > 0) {
                nodesList.push(currentPath[0].from);
                for (const h of currentPath) {
                  nodesList.push(h.to);
                }
              }
              return nodesList.map((n, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-accent-cyan/60 animate-pulse shrink-0" />}
                  <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-[11px] font-bold text-white hover:text-accent-cyan transition-colors">
                    {n}
                  </span>
                </React.Fragment>
              ));
            })()}
          </div>
        </div>
      </div>

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
            <StepRow key={i} hop={hop} index={i} />
          ))}
        </div>
      </div>

      {/* ── AI CONCLUSION CARD ── */}
      {currentExplanation ? (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 shadow-sm backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 h-24 w-24 bg-green-500/10 rounded-full blur-2xl -mr-8 -mt-8" />
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-green-400">
            <Zap className="h-4 w-4 animate-pulse text-green-400" />
            AI Reasoning Explanation ({activeTab === 0 ? 'Primary Path' : `Alt Path ${activeTab}`})
          </p>
          <p className="text-sm text-text-secondary leading-relaxed bg-black/10 p-3 rounded-lg border border-white/5 font-medium">
            {currentExplanation}
          </p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-green-400/80 bg-green-500/5 px-2.5 py-1.5 rounded-lg border border-green-500/20">
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-green-400" />
              Pathway loaded & visualized on graph
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider bg-green-500/15 px-1.5 py-0.5 rounded border border-green-500/25">
              Active
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-bg-surface/50 p-6 text-center space-y-4 shadow-sm backdrop-blur-md animate-fade-in">
          <Zap className="h-8 w-8 text-accent-indigo mx-auto animate-pulse" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white">Generate Path-Specific Explanation</h4>
            <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
              Generate a custom LLM summary explaining the connection path between <strong className="text-text-primary">{entityA}</strong> and <strong className="text-text-primary">{entityB}</strong> using this path&apos;s specific document chunks.
            </p>
          </div>
          <button
            onClick={() => onExplainPath?.(activeTab)}
            disabled={explainingLoading}
            className="rounded-lg bg-accent-indigo hover:bg-accent-indigo/90 px-4.5 py-2 text-xs font-semibold text-white transition-all shadow-md disabled:opacity-40 flex items-center gap-1.5 mx-auto"
          >
            {explainingLoading ? (
              <>
                <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                Generating Answer...
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                Generate Answer using Path {activeTab} Chunks
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
