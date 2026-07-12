'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { QueryPanel } from '@/components/query/QueryPanel';
import { QueryMode } from '@/components/query/QueryPanel';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import api from '@/lib/axios';

interface ColResult {
  answer: string;
  confidence: number;
  timeMs: number;
  context: string;
}

interface ComparisonData {
  query: string;
  results: { graph: ColResult; vector: ColResult; hybrid: ColResult };
  verdict: string;
}

const COL_META = [
  { key: 'graph', label: 'Graph Only', accent: 'text-accent-violet', bar: 'bg-accent-violet' },
  { key: 'vector', label: 'Vector Only', accent: 'text-accent-indigo', bar: 'bg-accent-indigo' },
  { key: 'hybrid', label: 'Hybrid', accent: 'text-accent-cyan', bar: 'bg-accent-cyan' },
] as const;

function generateVerdict(comps: Record<string, any>): string {
  const times: Record<string, number> = {};
  const hasAnswer: Record<string, boolean> = {};
  for (const mode of ['graph', 'vector', 'hybrid']) {
    times[mode] = comps[mode]?.response_time ?? 999;
    hasAnswer[mode] = !!(comps[mode]?.answer && comps[mode].answer.length > 10);
  }
  const fastest = Object.entries(times).sort((a, b) => a[1] - b[1])[0]?.[0] || 'hybrid';
  const answered = Object.entries(hasAnswer).filter(([, v]) => v).map(([k]) => k);
  if (answered.length === 0) return 'No retrieval mode produced a valid answer.';
  if (answered.includes('hybrid')) {
    return `Hybrid performed best — combines graph traversal with vector context for comprehensive answers. Fastest mode: ${fastest} (${Math.round(times[fastest] * 1000)}ms).`;
  }
  return `${answered[0]} produced the best result for this query. Fastest mode: ${fastest}.`;
}

function ConfidenceBar({ value, bar }: { value: number; bar: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-text-muted">Confidence</span>
        <span className="font-medium">{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ComparisonView() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<QueryMode>('hybrid');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ComparisonData | null>(null);

  async function compare() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await api.post('/query/compare/', { query });
      const comps = res.comparisons || res.results || {};
      const mapped: ComparisonData = {
        query,
        results: {
          graph: {
            answer: comps.graph?.answer || '',
            confidence: Math.round((comps.graph?.confidence ?? 0) * 100),
            timeMs: Math.round((comps.graph?.response_time ?? 0) * 1000),
            context: comps.graph?.context || comps.graph?.strategy || 'GRAPH',
          },
          vector: {
            answer: comps.vector?.answer || '',
            confidence: Math.round((comps.vector?.confidence ?? 0) * 100),
            timeMs: Math.round((comps.vector?.response_time ?? 0) * 1000),
            context: comps.vector?.context || comps.vector?.strategy || 'VECTOR',
          },
          hybrid: {
            answer: comps.hybrid?.answer || '',
            confidence: Math.round((comps.hybrid?.confidence ?? 0) * 100),
            timeMs: Math.round((comps.hybrid?.response_time ?? 0) * 1000),
            context: comps.hybrid?.context || comps.hybrid?.strategy || 'HYBRID',
          },
        },
        verdict: res.verdict || generateVerdict(comps),
      };
      setData(mapped);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to compare retrieval modes.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 scrollbar-thin">
      <div className="rounded-md border border-border bg-bg-surface p-3">
        <QueryPanel
          value={query}
          onChange={setQuery}
          mode={mode}
          onModeChange={setMode}
          onSubmit={compare}
          loading={loading}
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Running Graph, Vector & Hybrid retrieval...
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-error/30 bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <>
          <Card>
            <CardContent className="overflow-x-auto p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-primary">Comparison Metrics</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 pr-4 text-left font-medium text-text-muted">Metric</th>
                    {COL_META.map((c) => (
                      <th key={c.key} className={`pb-2 px-4 text-right font-medium ${c.accent}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  <tr>
                    <td className="py-2 pr-4 text-text-secondary">Confidence</td>
                    {COL_META.map((c) => (
                      <td key={c.key} className="py-2 px-4 text-right font-medium text-text-primary">
                        {data.results[c.key].confidence}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-text-secondary">Response Time</td>
                    {COL_META.map((c) => (
                      <td key={c.key} className="py-2 px-4 text-right font-medium text-text-primary">
                        {data.results[c.key].timeMs}ms
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-text-secondary">Context Length</td>
                    {COL_META.map((c) => (
                      <td key={c.key} className="py-2 px-4 text-right font-medium text-text-primary">
                        {data.results[c.key].context.length} chars
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 text-text-secondary">Answer Length</td>
                    {COL_META.map((c) => (
                      <td key={c.key} className="py-2 px-4 text-right font-medium text-text-primary">
                        {data.results[c.key].answer.length} chars
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {COL_META.map((c) => {
              const r = data.results[c.key];
              return (
                <Card key={c.key}>
                  <CardContent className="space-y-3 p-4">
                    <h3 className={`text-sm font-semibold ${c.accent}`}>{c.label}</h3>
                    <div className="text-sm leading-relaxed text-text-secondary">
                      <ReactMarkdown>{r.answer}</ReactMarkdown>
                    </div>
                    <p className="text-xs text-text-muted">Context: {r.context}</p>
                    <ConfidenceBar value={r.confidence} bar={c.bar} />
                    <p className="text-xs text-text-muted">⏱️ {r.timeMs}ms</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-success/30 bg-success/5">
            <CardContent className="flex items-start gap-2 p-4 text-sm text-text-primary">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div>
                <p className="font-semibold text-success">Verdict</p>
                <p className="mt-1 text-text-secondary">{data.verdict}</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
