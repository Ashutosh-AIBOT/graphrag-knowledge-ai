'use client';

import { useState, useCallback } from 'react';
import { useGraphData } from '@/hooks/useGraphData';
import { useGraphStore } from '@/store/graph';
import { EntityPanel } from '@/components/entities/EntityPanel';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { QueryTemplates } from '@/components/multihop/QueryTemplates';
import { entityColor } from '@/lib/constants';
import {
  Search, Loader2, AlertCircle, GitBranch, ArrowRight,
  ChevronRight, Copy, Check, FileText, Network, Zap
} from 'lucide-react';
import api from '@/lib/axios';

interface Hop {
  from: string;
  rel: string;
  to: string;
  doc?: string;
}

interface MultiHopResult {
  found: boolean;
  explanation: string;
  hops: Hop[];
  alternativePaths: Hop[][];
  hopCount: number;
  entityA: string;
  entityB: string;
  highlightedEntities: string[];
}

function NodeBadge({ name, isStart, isEnd }: { name: string; isStart?: boolean; isEnd?: boolean }) {
  const color = isStart ? '#22d3ee' : isEnd ? '#a78bfa' : '#60a5fa';
  const bg = isStart ? 'rgba(34,211,238,0.12)' : isEnd ? 'rgba(167,139,250,0.12)' : 'rgba(96,165,250,0.1)';
  const border = isStart ? 'rgba(34,211,238,0.4)' : isEnd ? 'rgba(167,139,250,0.4)' : 'rgba(96,165,250,0.3)';

  return (
    <div
      className="flex flex-col items-center gap-1 rounded-xl px-4 py-3 min-w-[90px] text-center"
      style={{ background: bg, border: `1.5px solid ${border}` }}
    >
      {/* Colored dot */}
      <div className="h-3 w-3 rounded-full shadow-lg" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="text-sm font-bold leading-tight" style={{ color }}>{name}</span>
      {isStart && <span className="text-[9px] uppercase tracking-widest opacity-60" style={{ color }}>Start</span>}
      {isEnd && <span className="text-[9px] uppercase tracking-widest opacity-60" style={{ color }}>End</span>}
    </div>
  );
}

function RelArrow({ rel, doc }: { rel: string; doc?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1 min-w-[80px]">
      <span className="rounded-full bg-accent-cyan/15 border border-accent-cyan/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-cyan whitespace-nowrap">
        {rel.replace(/_/g, ' ')}
      </span>
      <ChevronRight className="h-5 w-5 text-slate-500" />
      {doc && (
        <span className="flex items-center gap-0.5 text-[9px] text-text-muted truncate max-w-[100px]">
          <FileText className="h-2.5 w-2.5 shrink-0" />
          {doc.replace(/\.[^.]+$/, '')}
        </span>
      )}
    </div>
  );
}

function PathChain({ hops, label, variant = 'primary' }: { hops: Hop[]; label?: string; variant?: 'primary' | 'alt' }) {
  const isPrimary = variant === 'primary';

  // Build ordered sequence: node0 → rel0 → node1 → rel1 → node2 ...
  const allNodes: string[] = [];
  hops.forEach((h, i) => {
    if (i === 0) allNodes.push(h.from);
    allNodes.push(h.to);
  });

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      isPrimary
        ? 'border-accent-cyan/30 bg-accent-cyan/5'
        : 'border-accent-indigo/30 bg-accent-indigo/5'
    }`}>
      {label && (
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${
          isPrimary ? 'text-accent-cyan' : 'text-accent-indigo'
        }`}>{label}</p>
      )}

      {/* Visual flow chain */}
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {hops.map((hop, i) => (
          <div key={i} className="flex items-center gap-1">
            <NodeBadge
              name={hop.from}
              isStart={i === 0}
            />
            <RelArrow rel={hop.rel} doc={hop.doc} />
            {i === hops.length - 1 && (
              <NodeBadge name={hop.to} isEnd />
            )}
          </div>
        ))}
      </div>

      {/* Step-by-step numbered breakdown */}
      <div className="space-y-1.5 mt-2">
        {hops.map((hop, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg bg-bg-base/60 px-3 py-2.5">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isPrimary ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-accent-indigo/20 text-accent-indigo'
            }`}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-text-primary">{hop.from}</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                  isPrimary ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-accent-indigo/10 text-accent-indigo'
                }`}>
                  {hop.rel.replace(/_/g, ' ')}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
                <span className="text-sm font-semibold text-accent-violet">{hop.to}</span>
              </div>
              {hop.doc && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-text-muted">
                  <FileText className="h-2.5 w-2.5" />
                  Source: {hop.doc}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MultiHopPage() {
  useGraphData();
  const setHighlighted = useGraphStore((s) => s.setHighlighted);
  const data = useGraphStore((s) => s.data);

  const [query, setQuery] = useState('');
  const [entityA, setEntityA] = useState('');
  const [entityB, setEntityB] = useState('');
  const [useExplicit, setUseExplicit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MultiHopResult | null>(null);
  const [error, setError] = useState('');
  const [activePathTab, setActivePathTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const runQuery = useCallback(async () => {
    const q = useExplicit ? undefined : query.trim();
    const a = useExplicit ? entityA.trim() : undefined;
    const b = useExplicit ? entityB.trim() : undefined;

    if (!q && !(a && b)) return;

    setLoading(true);
    setResult(null);
    setError('');
    setActivePathTab(0);

    try {
      const payload: Record<string, string> = {};
      if (q) payload.query = q;
      if (a) payload.entity_a = a;
      if (b) payload.entity_b = b;

      const { data: res } = await api.post('/query/multihop/', payload);

      const mapped: MultiHopResult = {
        found: res.found,
        explanation: res.explanation || '',
        hops: (res.hops || []).map((h: any) => ({
          from: h.from || h.source || '',
          rel: h.rel || h.type || '',
          to: h.to || h.target || '',
          doc: h.doc || h.source_doc || '',
        })),
        alternativePaths: (res.alternative_paths || []).map((path: any[]) =>
          path.map((step: any) => ({
            from: step.source || step.from || '',
            rel: step.type || step.rel || '',
            to: step.target || step.to || '',
            doc: step.source_doc || step.doc || '',
          }))
        ),
        hopCount: res.hop_count || 0,
        entityA: res.entity_a || a || '',
        entityB: res.entity_b || b || '',
        highlightedEntities: res.highlighted_entities || [],
      };

      setResult(mapped);

      // Highlight on the graph
      if (mapped.highlightedEntities.length > 0) {
        const pathNodeIds: string[] = [];
        for (const hop of mapped.hops) {
          if (hop.from) pathNodeIds.push(hop.from);
          if (hop.to) pathNodeIds.push(hop.to);
        }
        setHighlighted(mapped.highlightedEntities, pathNodeIds);
      }
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      setError(backendError || 'Failed to process multi-hop query. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [query, entityA, entityB, useExplicit, setHighlighted]);

  const handleTemplateSelect = (template: string) => {
    setQuery(template);
    setUseExplicit(false);
  };

  const handleCopyPath = () => {
    if (!result) return;
    const lines = result.hops.map(h => `${h.from} --[${h.rel.replace(/_/g, ' ')}]--> ${h.to}`).join('\n');
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const allPaths = result ? [result.hops, ...result.alternativePaths] : [];

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ── LEFT PANEL ── */}
      <div className="flex w-full flex-col border-b border-border lg:w-2/5 lg:border-b-0 lg:border-r overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">

          {/* Header */}
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-accent-cyan" />
            <h1 className="text-lg font-semibold text-text-primary">Multi-Hop Reasoning</h1>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Find how entities are connected through chains of relationships in the knowledge graph.
            The reasoning path is highlighted live on the graph.
          </p>

          {/* Query Templates */}
          <QueryTemplates onSelect={handleTemplateSelect} />

          {/* Query Input Card */}
          <div className="space-y-3 rounded-xl border border-border bg-bg-surface p-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 rounded-lg bg-bg-base p-0.5">
              <button
                onClick={() => setUseExplicit(false)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                  !useExplicit
                    ? 'bg-accent-cyan text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Natural Language
              </button>
              <button
                onClick={() => setUseExplicit(true)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                  useExplicit
                    ? 'bg-accent-cyan text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Entity Pair
              </button>
            </div>

            {!useExplicit ? (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && runQuery()}
                  placeholder="e.g. Who manages the team that built the payment system?"
                  className="w-full rounded-lg border border-border bg-bg-base px-3 py-2.5 pl-9 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none focus:ring-1 focus:ring-accent-cyan/30"
                  disabled={loading}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={entityA}
                  onChange={(e) => setEntityA(e.target.value)}
                  placeholder="From entity (e.g. Sarah Chen)"
                  className="w-full rounded-lg border border-border bg-bg-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
                  disabled={loading}
                />
                <div className="flex items-center justify-center gap-2 py-0.5">
                  <div className="h-px flex-1 bg-border" />
                  <ArrowRight className="h-4 w-4 text-text-muted" />
                  <div className="h-px flex-1 bg-border" />
                </div>
                <input
                  type="text"
                  value={entityB}
                  onChange={(e) => setEntityB(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && runQuery()}
                  placeholder="To entity (e.g. Acme Corporation)"
                  className="w-full rounded-lg border border-border bg-bg-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
                  disabled={loading}
                />
              </div>
            )}

            <button
              onClick={runQuery}
              disabled={loading || (!query.trim() && !(entityA.trim() && entityB.trim()))}
              className="w-full rounded-lg bg-accent-cyan py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-accent-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Finding connection path…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Zap className="h-4 w-4" />
                  Find Connection
                </span>
              )}
            </button>
          </div>

          {/* ── ERROR ── */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── NO PATH FOUND ── */}
          {result && !result.found && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
              <p className="font-semibold text-yellow-400">No connection found</p>
              <p className="mt-1 text-text-muted">{result.explanation}</p>
            </div>
          )}

          {/* ── PATH RESULT ── */}
          {result && result.found && result.hops.length > 0 && (
            <div className="space-y-4">
              {/* Summary banner */}
              <div className="flex items-center justify-between rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-accent-cyan" />
                  <span className="text-sm font-semibold text-accent-cyan">Path Found</span>
                  <span className="rounded-full bg-accent-cyan/20 px-2 py-0.5 text-xs font-bold text-accent-cyan">
                    {result.hopCount} hop{result.hopCount !== 1 ? 's' : ''}
                  </span>
                  {result.alternativePaths.length > 0 && (
                    <span className="rounded-full bg-accent-indigo/20 px-2 py-0.5 text-xs font-bold text-accent-indigo">
                      +{result.alternativePaths.length} alt path{result.alternativePaths.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleCopyPath}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-bg-elevated hover:text-text-primary transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {/* Entity pair overview */}
              <div className="flex items-center gap-3 rounded-lg bg-bg-surface border border-border px-4 py-2.5">
                <span className="text-sm font-bold text-accent-cyan">{result.entityA}</span>
                <div className="flex-1 flex items-center gap-1">
                  <div className="h-px flex-1 bg-accent-cyan/30" />
                  <ChevronRight className="h-4 w-4 text-accent-cyan/60" />
                  <ChevronRight className="h-4 w-4 -ml-2 text-accent-cyan/30" />
                </div>
                <span className="text-sm font-bold text-accent-violet">{result.entityB}</span>
              </div>

              {/* Path tabs (if multiple paths) */}
              {allPaths.length > 1 && (
                <div className="flex gap-1 border-b border-border pb-0">
                  {allPaths.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActivePathTab(i)}
                      className={`rounded-t-md px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                        activePathTab === i
                          ? i === 0
                            ? 'border-accent-cyan text-accent-cyan'
                            : 'border-accent-indigo text-accent-indigo'
                          : 'border-transparent text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {i === 0 ? 'Primary Path' : `Alt Path ${i}`}
                    </button>
                  ))}
                </div>
              )}

              {/* Active path chain */}
              <PathChain
                hops={allPaths[activePathTab] || []}
                label={
                  allPaths.length > 1
                    ? activePathTab === 0
                      ? 'Primary Path'
                      : `Alternative Path ${activePathTab}`
                    : undefined
                }
                variant={activePathTab === 0 ? 'primary' : 'alt'}
              />

              {/* LLM Conclusion / Explanation */}
              {result.explanation && (
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-green-400">
                    <Zap className="h-3.5 w-3.5" />
                    AI Reasoning Conclusion
                  </p>
                  <p className="text-sm text-text-primary leading-relaxed">{result.explanation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Graph ── */}
      <div className="relative w-full flex-1">
        {data.nodes.length > 0 ? (
          <GraphVisualization />
        ) : (
          <div className="flex h-full items-center justify-center bg-bg-base text-sm text-text-muted">
            Graph will appear here once documents are processed.
          </div>
        )}
        <EntityPanel />
      </div>
    </div>
  );
}
