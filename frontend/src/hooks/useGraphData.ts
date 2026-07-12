import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { useGraphStore, GraphData } from '@/store/graph';
import { useDocumentsStore } from '@/store/documents';

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

export function useGraphData() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setData = useGraphStore((s) => s.setData);
  const selectedIds = useDocumentsStore((s) => s.selectedDocumentIds);
  const selectedIdsStr = selectedIds.join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const url = selectedIdsStr ? `/graph/?document_ids=${selectedIdsStr}` : '/graph/';

    api.get(url)
      .then(({ data }) => {
        if (!cancelled) {
          setData(mapResponse(data));
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Backend unavailable. Please check your connection.');
          setData({ nodes: [], links: [] });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setData, selectedIdsStr]);

  return { loading, error };
}
