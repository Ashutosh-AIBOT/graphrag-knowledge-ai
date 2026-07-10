'use client';

import { useState, useEffect } from 'react';
import { useGraphData } from '@/hooks/useGraphData';
import { useGraphStore } from '@/store/graph';
import { QueryPanel, QueryMode } from '@/components/query/QueryPanel';
import { AnswerCard } from '@/components/query/AnswerCard';
import { PathView, Hop } from '@/components/query/PathView';
import { SourceToggle } from '@/components/query/SourceToggle';
import { QueryHistory } from '@/components/query/QueryHistory';
import { EntityPanel } from '@/components/entities/EntityPanel';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { Upload, Sparkles } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/axios';
import { useDocumentsStore } from '@/store/documents';

interface QueryResult {
  answer: string;
  confidence?: number;
  method?: string;
  citations?: { doc: string; page?: string }[];
  entities?: string[];
  paths?: string[];
  hops?: Hop[];
}

export function MainQueryView() {
  useGraphData();
  const setHighlighted = useGraphStore((s) => s.setHighlighted);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const data = useGraphStore((s) => s.data);

  const selectedIds = useDocumentsStore((s) => s.selectedDocumentIds);

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<QueryMode>('hybrid');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  // Listen for right-click "Ask about entity" events from graph
  useEffect(() => {
    function handleAskEntity(e: Event) {
      const name = (e as CustomEvent).detail;
      if (name) {
        setQuery(name);
      }
    }
    window.addEventListener('graphrag:ask-entity', handleAskEntity);
    return () => window.removeEventListener('graphrag:ask-entity', handleAskEntity);
  }, []);

  async function runQuery() {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data: res } = await api.post('/query/', {
        query,
        mode,
        document_ids: selectedIds.length > 0 ? selectedIds : undefined
      });
      const mapped: QueryResult = {
        answer: res.answer,
        confidence: res.confidence,
        method: res.strategy || res.method || mode,
        citations: res.sources?.map((s: string) => ({ doc: s })) || res.citations,
        entities: res.highlighted_entities,
        paths: res.paths,
        hops: res.hops,
      };
      setResult(mapped);
      setHighlighted(mapped.entities || [], mapped.paths || []);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to process query. Please check your API keys and Neo4j connection.';
      setResult({
        answer: `**Error:** ${errorMsg}`,
        method: mode,
      });
    } finally {
      setLoading(false);
    }
  }

  function askEntity(name: string) {
    setQuery(name);
    selectEntity(null);
    setTimeout(runQuery, 50);
  }

  const empty = data.nodes.length === 0;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <div className="flex w-full flex-col border-b border-border lg:w-2/5 lg:border-b-0 lg:border-r">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
          <QueryPanel
            value={query}
            onChange={setQuery}
            mode={mode}
            onModeChange={setMode}
            onSubmit={runQuery}
            loading={loading}
          />

          <AnswerCard
            answer={result?.answer || ''}
            confidence={result?.confidence}
            method={result?.method}
            citations={result?.citations}
            loading={loading}
          />

          {result?.hops && result.hops.length > 0 && (
            <PathView
              hops={result.hops}
              conclusion="The query resolves through the management chain above, connecting the person to the team that built the Payment Service."
            />
          )}

          {empty && !loading && (
            <div className="rounded-md border border-dashed border-border bg-bg-surface p-6 text-center">
              <Sparkles className="mx-auto mb-2 h-6 w-6 text-accent-cyan" />
              <p className="text-sm font-medium text-text-primary">Your graph is empty</p>
              <p className="mt-1 text-xs text-text-muted">
                Upload documents to build your knowledge graph.
              </p>
              <Link
                href="/documents"
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-accent-violet px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-violet/90"
              >
                <Upload className="h-3.5 w-3.5" /> Upload Document
              </Link>
            </div>
          )}
        </div>

        {!empty && <QueryHistory onSelect={setQuery} />}

        {result && (
          <SourceToggle
            method={result.method || mode}
            entityCount={result.entities?.length || 0}
            chunkCount={result.citations?.length || 0}
          />
        )}
      </div>

      <div className="relative w-full flex-1">
        {data.nodes.length > 0 ? (
          <GraphVisualization />
        ) : (
          <div className="flex h-full items-center justify-center bg-bg-base text-sm text-text-muted">
            Graph will appear here once documents are processed.
          </div>
        )}
        <EntityPanel onAsk={askEntity} />
      </div>
    </div>
  );
}
