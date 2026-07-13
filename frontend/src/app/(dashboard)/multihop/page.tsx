'use client';

import { useState, useCallback, useEffect } from 'react';
import { useGraphData } from '@/hooks/useGraphData';
import { useGraphStore } from '@/store/graph';
import { EntityPanel } from '@/components/entities/EntityPanel';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { QueryTemplates } from '@/components/multihop/QueryTemplates';
import { PathView } from '@/components/multihop/PathView';
import {
  Search, Loader2, AlertCircle, ArrowRight, Network, Zap
} from 'lucide-react';
import api from '@/lib/axios';

interface Hop {
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

interface MultiHopResult {
  found: boolean;
  explanation: string;
  hops: Hop[];
  alternativePaths: AlternativePath[];
  hopCount: number;
  entityA: string;
  entityB: string;
  highlightedEntities: string[];
}

export default function MultiHopPage() {
  useGraphData();
  const setHighlighted = useGraphStore((s) => s.setHighlighted);
  const clearHighlighted = useGraphStore((s) => s.clearHighlighted);
  const data = useGraphStore((s) => s.data);

  const [query, setQuery] = useState('');
  const [entityA, setEntityA] = useState('');
  const [entityB, setEntityB] = useState('');
  const [useExplicit, setUseExplicit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explainingLoading, setExplainingLoading] = useState(false);
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
          chunk_text: h.chunk_text || '',
        })),
        alternativePaths: (res.alternative_paths || []).map((alt: any) => ({
          hops: (alt.hops || []).map((step: any) => ({
            from: step.from || step.source || '',
            rel: step.rel || step.type || '',
            to: step.to || step.target || '',
            doc: step.doc || step.source_doc || '',
            chunk_text: step.chunk_text || '',
          })),
          explanation: alt.explanation || '',
        })),
        hopCount: res.hop_count || 0,
        entityA: res.entity_a || a || '',
        entityB: res.entity_b || b || '',
        highlightedEntities: res.highlighted_entities || [],
      };

      setResult(mapped);
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      setError(backendError || 'Failed to process multi-hop query. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [query, entityA, entityB, useExplicit]);

  const handleExplainPath = useCallback(async (index: number) => {
    if (!result) return;
    
    setExplainingLoading(true);
    setError('');
    try {
      const currentPath = index === 0
        ? result.hops
        : result.alternativePaths[index - 1]?.hops || [];

      // Reformat the hops payload specifically to match backend expectation:
      // [{"from": "...", "rel": "...", "to": "...", "chunk_text": "..."}]
      const hopsPayload = currentPath.map(h => ({
        from: h.from,
        rel: h.rel,
        to: h.to,
        chunk_text: h.chunk_text || ''
      }));

      const { data: res } = await api.post('/query/multihop/explain/', {
        entity_a: result.entityA,
        entity_b: result.entityB,
        hops: hopsPayload,
      });

      // Update the result object in state with the generated explanation
      setResult((prev) => {
        if (!prev) return null;
        if (index === 0) {
          return { ...prev, explanation: res.explanation };
        } else {
          const updatedAlts = [...prev.alternativePaths];
          updatedAlts[index - 1] = {
            ...updatedAlts[index - 1],
            explanation: res.explanation,
          };
          return {
            ...prev,
            alternativePaths: updatedAlts,
          };
        }
      });
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      setError(backendError || 'Failed to generate explanation for this path.');
    } finally {
      setExplainingLoading(false);
    }
  }, [result]);

  // Synchronize graph highlighting with current active tab path
  useEffect(() => {
    if (!result || !result.found) {
      clearHighlighted();
      return;
    }

    const currentHops = activePathTab === 0
      ? result.hops
      : result.alternativePaths[activePathTab - 1]?.hops || [];
    const pathNodeIds: string[] = [];
    const entityNames = new Set<string>();

    if (currentHops.length > 0) {
      const firstHop = currentHops[0];
      if (firstHop.from) {
        pathNodeIds.push(firstHop.from);
        entityNames.add(firstHop.from);
      }
      for (const hop of currentHops) {
        if (hop.to) {
          pathNodeIds.push(hop.to);
          entityNames.add(hop.to);
        }
      }
    }

    // Also include highlighted entities list from result
    if (result.highlightedEntities) {
      result.highlightedEntities.forEach((ent) => entityNames.add(ent));
    }

    setHighlighted(Array.from(entityNames), pathNodeIds);
  }, [activePathTab, result, setHighlighted, clearHighlighted]);

  const handleTemplateSelect = (template: string) => {
    setQuery(template);
    setUseExplicit(false);
  };

  const handleCopyPath = () => {
    if (!result) return;
    const currentPath = activePathTab === 0
      ? result.hops
      : result.alternativePaths[activePathTab - 1]?.hops || [];
    const lines = currentPath
      .map((h) => `${h.from} --[${h.rel.replace(/_/g, ' ')}]--> ${h.to}`)
      .join('\n');
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full flex-col lg:flex-row bg-bg-base overflow-hidden">
      {/* ── LEFT PANEL ── */}
      <div className="flex w-full shrink-0 flex-col border-b border-border lg:w-[400px] xl:w-[460px] lg:min-w-[400px] lg:h-full lg:border-b-0 lg:border-r overflow-hidden bg-bg-surface/30">
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
          <div className="space-y-3 rounded-xl border border-border/80 bg-bg-surface/75 p-4 shadow-sm backdrop-blur-sm">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 rounded-lg bg-bg-base p-0.5 border border-border/40">
              <button
                onClick={() => setUseExplicit(false)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                  !useExplicit
                    ? 'bg-accent-cyan text-white shadow-sm font-semibold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Natural Language
              </button>
              <button
                onClick={() => setUseExplicit(true)}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                  useExplicit
                    ? 'bg-accent-cyan text-white shadow-sm font-semibold'
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
                  className="w-full rounded-lg border border-border bg-bg-base px-3 py-2.5 pl-9 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none focus:ring-1 focus:ring-accent-cyan/30 transition-all"
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
                  className="w-full rounded-lg border border-border bg-bg-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none focus:ring-1 focus:ring-accent-cyan/30 transition-all"
                  disabled={loading}
                />
                <div className="flex items-center justify-center gap-2 py-0.5">
                  <div className="h-px flex-1 bg-border/60" />
                  <ArrowRight className="h-4 w-4 text-text-muted" />
                  <div className="h-px flex-1 bg-border/60" />
                </div>
                <input
                  type="text"
                  value={entityB}
                  onChange={(e) => setEntityB(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && runQuery()}
                  placeholder="To entity (e.g. Acme Corporation)"
                  className="w-full rounded-lg border border-border bg-bg-base px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none focus:ring-1 focus:ring-accent-cyan/30 transition-all"
                  disabled={loading}
                />
              </div>
            )}

            <button
              onClick={runQuery}
              disabled={loading || (!query.trim() && !(entityA.trim() && entityB.trim()))}
              className="w-full rounded-lg bg-accent-cyan py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-accent-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Finding connection path…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Find Connection
                </>
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
              <p className="mt-1 text-text-muted leading-relaxed">{result.explanation}</p>
            </div>
          )}

          {/* ── PATH RESULT (RENDER PATHVIEW) ── */}
          {result && result.found && result.hops.length > 0 && (
            <PathView
              hops={result.hops}
              alternativePaths={result.alternativePaths}
              activeTab={activePathTab}
              onTabChange={setActivePathTab}
              explanation={result.explanation}
              entityA={result.entityA}
              entityB={result.entityB}
              copied={copied}
              onCopy={handleCopyPath}
              onExplainPath={handleExplainPath}
              explainingLoading={explainingLoading}
            />
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL: Graph ── */}
      <div className="relative w-full flex-1 min-h-[400px] lg:min-h-0 lg:h-full bg-bg-base/20">
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
