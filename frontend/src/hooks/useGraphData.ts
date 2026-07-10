import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { useGraphStore, GraphData } from '@/store/graph';
import { mockGraph } from '@/lib/mockData';

// Module-level dedupe so multiple components calling useGraphData
// (HeroSection, MainQueryView, ExplorePage, CommunityView) don't race
// or fire redundant requests.
let inFlight: Promise<void> | null = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 30_000;

function mapResponse(data: any): GraphData {
  return {
    nodes: (data.nodes || []).map((n: any) => ({
      id: String(n.id ?? n.name),
      name: n.name,
      type: n.type,
      description: n.description,
      sourceDoc: n.source_doc,
      val: n.val ?? n.connections ?? 1,
      community: n.community,
    })),
    links: (data.links || data.edges || []).map((l: any) => ({
      source: String(l.source),
      target: String(l.target),
      type: l.type,
      confidence: l.confidence,
      description: l.description,
      sourceDoc: l.source_doc,
    })),
  };
}

function fetchGraph(setData: (d: GraphData) => void, setError: (e: string | null) => void) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { data } = await api.get('/graph/');
      setData(mapResponse(data));
      setError(null);
      lastFetchedAt = Date.now();
    } catch {
      setError('Using demo graph data (backend unavailable).');
      setData(mockGraph);
      lastFetchedAt = Date.now();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function useGraphData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setData = useGraphStore((s) => s.setData);
  const existing = useGraphStore((s) => s.data);

  useEffect(() => {
    // Skip if we already have fresh data within the TTL.
    if (existing.nodes.length > 0 && Date.now() - lastFetchedAt < CACHE_TTL_MS) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchGraph(
      (d) => !cancelled && setData(d),
      (e) => !cancelled && setError(e)
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [setData, existing.nodes.length]);

  return { loading, error };
}
