'use client';

import { useState, useCallback } from 'react';
import { useGraphData } from '@/hooks/useGraphData';
import { useGraphStore } from '@/store/graph';
import { PathView, Hop } from '@/components/query/PathView';
import { EntityPanel } from '@/components/entities/EntityPanel';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { QueryTemplates } from '@/components/multihop/QueryTemplates';
import { Search, Loader2, AlertCircle, GitBranch } from 'lucide-react';
import api from '@/lib/axios';

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

export default function MultiHopPage() {
  useGraphData();
  const setHighlighted = useGraphStore((s) => s.setHighlighted);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const data = useGraphStore((s) => s.data);

  const [query, setQuery] = useState('');
  const [entityA, setEntityA] = useState('');
  const [entityB, setEntityB] = useState('');
  const [useExplicit, setUseExplicit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MultiHopResult | null>(null);
  const [error, setError] = useState('');

  const runQuery = useCallback(async () => {
    const q = useExplicit ? undefined : query.trim();
    const a = useExplicit ? entityA.trim() : undefined;
    const b = useExplicit ? entityB.trim() : undefined;

    if (!q && !(a && b)) return;

    setLoading(true);
    setResult(null);
    setError('');

    try {
      const payload: Record<string, string> = {};
      if (q) payload.query = q;
      if (a) payload.entity_a = a;
      if (b) payload.entity_b = b;

      const { data: res } = await api.post('/query/multihop/', payload);

      const mapped: MultiHopResult = {
        found: res.found,
        explanation: res.explanation || '',
        hops: res.hops || [],
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

      // Highlight entities on the graph
      if (mapped.highlightedEntities.length > 0) {
        const pathNodeIds: string[] = [];
        for (const hop of mapped.hops) {
          pathNodeIds.push(hop.from, hop.to);
        }
        setHighlighted(mapped.highlightedEntities, pathNodeIds);
      }
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      setError(backendError || 'Failed to process multi-hop query. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [query, entityA, entityB, useExplicit, setHighlighted]);

  const handleTemplateSelect = (template: string) => {
    setQuery(template);
    setUseExplicit(false);
  };

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left Panel: Query + Results */}
      <div className="flex w-full flex-col border-b border-border lg:w-2/5 lg:border-b-0 lg:border-r">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
          {/* Header */}
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-accent-cyan" />
            <h1 className="text-lg font-semibold text-text-primary">Multi-Hop Reasoning</h1>
          </div>
          <p className="text-xs text-text-muted">
            Find how entities are connected through chains of relationships in the knowledge graph.
          </p>

          {/* Query Templates */}
          <QueryTemplates onSelect={handleTemplateSelect} />

          {/* Query Input */}
          <div className="space-y-3 rounded-lg border border-border bg-bg-surface p-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUseExplicit(false)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  !useExplicit
                    ? 'bg-accent-cyan/15 text-accent-cyan'
                    : 'text-text-muted hover:bg-bg-elevated'
                }`}
              >
                Natural Language
              </button>
              <button
                onClick={() => setUseExplicit(true)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  useExplicit
                    ? 'bg-accent-cyan/15 text-accent-cyan'
                    : 'text-text-muted hover:bg-bg-elevated'
                }`}
              >
                Entity Pair
              </button>
            </div>

            {!useExplicit ? (
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && runQuery()}
                  placeholder="e.g. Who manages the team that built the payment system?"
                  className="w-full rounded-md border border-border bg-bg-base px-3 py-2 pl-9 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
                  disabled={loading}
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={entityA}
                  onChange={(e) => setEntityA(e.target.value)}
                  placeholder="From entity (e.g. John Smith)"
                  className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
                  disabled={loading}
                />
                <div className="flex items-center justify-center text-text-muted">
                  <GitBranch className="h-4 w-4 rotate-90" />
                </div>
                <input
                  type="text"
                  value={entityB}
                  onChange={(e) => setEntityB(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !loading && runQuery()}
                  placeholder="To entity (e.g. Payment Service)"
                  className="w-full rounded-md border border-border bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
                  disabled={loading}
                />
              </div>
            )}

            <button
              onClick={runQuery}
              disabled={loading || (!query.trim() && !(entityA.trim() && entityB.trim()))}
              className="w-full rounded-md bg-accent-cyan px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-cyan/90 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Finding path...
                </span>
              ) : (
                'Find Connection'
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/10 p-3 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Result */}
          {result && !result.found && (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-text-primary">
              <p className="font-medium text-warning">No path found</p>
              <p className="mt-1 text-text-muted">{result.explanation}</p>
            </div>
          )}

          {result && result.found && result.hops.length > 0 && (
            <PathView
              hops={result.hops}
              conclusion={result.explanation}
              alternativePaths={result.alternativePaths}
              hopCount={result.hopCount}
              entityA={result.entityA}
              entityB={result.entityB}
              standalone
            />
          )}
        </div>
      </div>

      {/* Right Panel: Graph */}
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
