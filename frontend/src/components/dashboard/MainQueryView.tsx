'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGraphData } from '@/hooks/useGraphData';
import { useGraphStore } from '@/store/graph';
import { QueryPanel, QueryMode } from '@/components/query/QueryPanel';
import { AnswerCard } from '@/components/query/AnswerCard';
import { PathView, Hop } from '@/components/query/PathView';
import { SourceToggle } from '@/components/query/SourceToggle';
import { QueryHistory } from '@/components/query/QueryHistory';
import { EntityPanel } from '@/components/entities/EntityPanel';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { Upload, Sparkles, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/axios';
import { useDocumentsStore } from '@/store/documents';
import { useHistoryStore, HistoryItem } from '@/store/history';

interface QueryResult {
  answer: string;
  confidence?: number;
  method?: string;
  citations?: { doc: string; page?: string }[];
  entities?: string[];
  paths?: string[];
  hops?: Hop[];
  context?: string;
  conclusion?: string;
}

const LAST_SESSION_KEY = 'graphrag-last-session';

function loadLastSession(): { query: string; mode: QueryMode; result: QueryResult | null } | null {
  try {
    const raw = localStorage.getItem(LAST_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLastSession(query: string, mode: QueryMode, result: QueryResult | null) {
  try {
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({ query, mode, result }));
  } catch {}
}

function clearLastSession() {
  try {
    localStorage.removeItem(LAST_SESSION_KEY);
  } catch {}
}

export function MainQueryView() {
  useGraphData();
  const setHighlighted = useGraphStore((s) => s.setHighlighted);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const data = useGraphStore((s) => s.data);
  const selectedIds = useDocumentsStore((s) => s.selectedDocumentIds);
  const addHistoryItem = useHistoryStore((s) => s.addItem);

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<QueryMode>('hybrid');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const session = loadLastSession();
    if (session) {
      setQuery(session.query);
      setMode(session.mode);
      setResult(session.result);
      if (session.result?.entities) {
        setHighlighted(session.result.entities, session.result.paths || []);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (query || result) {
      saveLastSession(query, mode, result);
    }
  }, [query, mode, result]);

  useEffect(() => {
    function handleAskEntity(e: Event) {
      const name = (e as CustomEvent).detail;
      if (name) setQuery(name);
    }
    window.addEventListener('graphrag:ask-entity', handleAskEntity);
    return () => window.removeEventListener('graphrag:ask-entity', handleAskEntity);
  }, []);

  const scrollToAnswer = useCallback(() => {
    requestAnimationFrame(() => {
      if (answerRef.current) {
        answerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, []);

  const runQuery = useCallback(async (overrideQuery?: string) => {
    const q = overrideQuery ?? query;
    if (!q.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data: res } = await api.post('/query/', {
        query: q,
        mode,
        document_ids: selectedIds.length > 0 ? selectedIds : undefined,
      });
      const mapped: QueryResult = {
        answer: res.answer,
        confidence: res.confidence,
        method: res.strategy || res.method || mode,
        citations: res.sources?.map((s: string) => ({ doc: s })) || res.citations,
        entities: res.highlighted_entities,
        paths: res.paths,
        hops: res.hops,
        context: res.context,
        conclusion: res.conclusion,
      };
      setResult(mapped);
      setHighlighted(mapped.entities || [], mapped.paths || []);

      addHistoryItem({
        id: Date.now().toString(),
        query_text: q,
        retrieval_mode: (res.strategy || mode).toUpperCase(),
        answer_text: res.answer || '',
        answer_preview: (res.answer || '').substring(0, 200),
        response_time: res.response_time ?? 0,
        created_at: new Date().toISOString(),
      });

      scrollToAnswer();
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      let errorMsg = backendError || 'Failed to process query. Please check your API keys and Neo4j connection.';

      if (err.response?.status === 401) {
        errorMsg = 'Your session has expired. Please log in again.';
      }
      setResult({ answer: `**Error:** ${errorMsg}`, method: mode });
      scrollToAnswer();
    } finally {
      setLoading(false);
    }
  }, [query, mode, selectedIds, setHighlighted, addHistoryItem, scrollToAnswer]);

  const handleNewChat = useCallback(() => {
    setQuery('');
    setResult(null);
    setHighlighted([], []);
    selectEntity(null);
    clearLastSession();
  }, [setHighlighted, selectEntity]);

  const handleHistorySelect = useCallback((queryText: string, item?: HistoryItem) => {
    setQuery(queryText);
    if (item?.answer_text) {
      const modeFromItem = (item.retrieval_mode || 'hybrid').toLowerCase() as QueryMode;
      setMode(modeFromItem);
      setResult({
        answer: item.answer_text,
        method: item.retrieval_mode,
        confidence: undefined,
      });
      scrollToAnswer();
    }
  }, [scrollToAnswer]);

  function askEntity(name: string) {
    setQuery(name);
    selectEntity(null);
    setTimeout(() => runQuery(name), 50);
  }

  const empty = data.nodes.length === 0;

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left Panel: Query + Answer */}
      <div className="flex w-full flex-col border-b border-border lg:w-2/5 lg:border-b-0 lg:border-r">
        {/* New Chat button */}
        <div className="flex items-center justify-end border-b border-border px-4 py-2">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-bg-surface hover:text-text-primary transition-colors"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            New Chat
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
          <QueryPanel
            value={query}
            onChange={setQuery}
            mode={mode}
            onModeChange={setMode}
            onSubmit={() => runQuery()}
            loading={loading}
          />

          <div ref={answerRef}>
            <AnswerCard
              answer={result?.answer || ''}
              confidence={result?.confidence}
              method={result?.method}
              citations={result?.citations}
              loading={loading}
            />
          </div>

          {result?.hops && result.hops.length > 0 && (
            <PathView
              hops={result.hops}
              conclusion={result.conclusion}
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

        <QueryHistory onSelect={handleHistorySelect} />

        {result && (
          <SourceToggle
            method={result.method || mode}
            entityCount={result.entities?.length || 0}
            chunkCount={result.citations?.length || 0}
            context={result.context}
          />
        )}
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
        <EntityPanel onAsk={askEntity} />
      </div>
    </div>
  );
}
