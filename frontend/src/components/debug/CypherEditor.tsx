'use client';

import { useState } from 'react';
import { Play, Terminal, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import api from '@/lib/axios';

interface CypherResult {
  cypher: string;
  explanation: string;
  records: Record<string, any>[];
  success: boolean;
  error?: string;
}

export function CypherEditor() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CypherResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function runQuery() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/graph/cypher/', { query });
      setResult(data);
    } catch (err: any) {
      setResult({
        cypher: query,
        explanation: '',
        records: [],
        success: false,
        error: err.response?.data?.error || 'Failed to execute query.',
      });
    } finally {
      setLoading(false);
    }
  }

  function copyCypher() {
    if (result?.cypher) {
      navigator.clipboard.writeText(result.cypher);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Terminal className="h-4 w-4 text-accent-cyan" /> Cypher Query Editor
      </div>

      <div className="flex-1">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="MATCH (n:Entity) RETURN n.name, n.type LIMIT 10"
          className="h-40 w-full resize-none rounded-md border border-border bg-bg-base p-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              runQuery();
            }
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={runQuery}
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-cyan px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-cyan/90 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" /> {loading ? 'Running...' : 'Run Query'}
          </button>
          <span className="text-[10px] text-text-muted">Ctrl+Enter to run</span>
        </div>
      </div>

      {result && (
        <Card>
          <CardContent className="space-y-3 p-4">
            {result.success ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-success">Generated Cypher</p>
                  <button
                    onClick={copyCypher}
                    className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-md bg-bg-base p-3 font-mono text-xs text-accent-cyan">
                  {result.cypher}
                </pre>
                {result.explanation && (
                  <p className="text-xs text-text-secondary">{result.explanation}</p>
                )}
                {result.records.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-text-muted">
                      Results ({result.records.length} rows)
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            {Object.keys(result.records[0]).map((key) => (
                              <th key={key} className="px-2 py-1 text-left font-medium text-text-muted">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {result.records.map((row, i) => (
                            <tr key={i}>
                              {Object.values(row).map((val, j) => (
                                <td key={j} className="px-2 py-1 text-text-secondary">
                                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-error">
                <p className="font-semibold">Query Failed</p>
                <p className="mt-1">{result.error}</p>
                {result.cypher && (
                  <pre className="mt-2 overflow-x-auto rounded-md bg-bg-base p-2 font-mono">{result.cypher}</pre>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
