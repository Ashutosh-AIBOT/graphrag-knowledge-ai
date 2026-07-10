'use client';

import { useEffect, useState } from 'react';
import { Network, FileText, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useGraphData } from '@/hooks/useGraphData';
import { GraphVisualization } from '@/components/graph/GraphVisualization';
import { useGraphStore } from '@/store/graph';
import api from '@/lib/axios';

interface Community {
  id: number;
  label: string;
  entityCount: number;
  relationshipCount: number;
  summary: string;
  keyEntities: string[];
}

export function CommunityView() {
  const { error: graphError } = useGraphData();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [docSummary, setDocSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tab, setTab] = useState('cards');
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const setHighlighted = useGraphStore((s) => s.setHighlighted);

  useEffect(() => {
    setLoading(true);
    api
      .get('/graph/communities/')
      .then(({ data }) => {
        const c = data.communities || data.results || data;
        if (Array.isArray(c) && c.length) {
          setCommunities(
            c.map((x: any) => ({
              id: x.id,
              label: x.label || `Community ${x.id}`,
              entityCount: x.member_count ?? x.entity_count ?? x.entityCount ?? 0,
              relationshipCount: x.relationship_count ?? x.relationshipCount ?? 0,
              summary: x.summary || '',
              keyEntities: x.members ?? x.key_entities ?? x.keyEntities ?? [],
            }))
          );
          setDocSummary(data.document_summary || data.summary || '');
        }
        setFetchError(null);
      })
      .catch(() => setFetchError('Failed to load communities. Backend may be unavailable.'))
      .finally(() => setLoading(false));
  }, []);

  function expand(id: number) {
    const c = communities.find((x) => x.id === id);
    if (c && c.keyEntities.length) {
      setHighlighted(c.keyEntities, []);
      setTab('graph');
    }
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="cards">Cards</TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
        </TabsList>
      </div>

      {graphError && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{graphError}</span>
        </div>
      )}

      {fetchError && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-error/30 bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {docSummary && (
        <Card className="mb-4">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-text-secondary">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyan" />
            <span>{docSummary}</span>
          </CardContent>
        </Card>
      )}

      <TabsContent value="cards" className="mt-0 flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-text-muted">Loading communities...</div>
        ) : communities.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-text-muted">No communities found. Upload documents to generate communities.</div>
        ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {communities.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-accent-violet" />
                  <h3 className="font-semibold">{c.label}</h3>
                </div>
                <div className="flex gap-3 text-xs text-text-muted">
                  <span>{c.entityCount} entities</span>
                  <span>{c.relationshipCount} relationships</span>
                </div>
                <p className="flex-1 text-sm text-text-secondary">{c.summary}</p>
                <div className="flex flex-wrap gap-1">
                  {c.keyEntities.map((e) => (
                    <span
                      key={e}
                      className="rounded bg-bg-elevated px-2 py-0.5 text-xs text-text-secondary"
                    >
                      {e}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => expand(c.id)}
                  className="self-start rounded-md border border-accent-violet/40 px-3 py-1.5 text-xs font-medium text-accent-violet hover:bg-accent-violet/10"
                >
                  Expand Graph ▶
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
        )}
      </TabsContent>

      <TabsContent value="graph" className="mt-0 min-h-0 flex-1">
        <div className="relative h-full rounded-md border border-border bg-bg-base">
          <GraphVisualization height="100%" />
        </div>
      </TabsContent>
    </Tabs>
  );
}
