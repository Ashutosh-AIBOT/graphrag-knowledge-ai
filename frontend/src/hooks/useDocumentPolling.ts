import { useEffect, useRef } from 'react';
import api from '@/lib/axios';
import { useDocumentsStore, DocumentItem, DocStatus } from '@/store/documents';
import { POLLING_INTERVAL_MS } from '@/lib/constants';

export function useDocumentPolling(enabled = true) {
  const setDocuments = useDocumentsStore((s) => s.setDocuments);
  const upsertDocument = useDocumentsStore((s) => s.upsertDocument);
  const setActiveJobs = useDocumentsStore((s) => s.setActiveJobs);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data } = await api.get('/documents/');
        if (cancelled) return;
        const docs: DocumentItem[] = (data.results || data || []).map((d: any) => ({
          id: String(d.id),
          name: d.name,
          status: d.status,
          entities: d.entity_count ?? d.entities_count ?? d.entities,
          relationships: d.relationship_count ?? d.relationships_count ?? d.relationships,
          uploadedAt: d.uploaded_at ?? d.created_at,
          error: d.error_message,
          source: d.source || '',
          processingStep: d.processing_step ?? d.processingStep ?? null,
          processingProgress: d.processing_progress ?? d.processingProgress ?? 0,
        }));
        if (docs.length > 0) {
          setDocuments(docs);
        } else if (useDocumentsStore.getState().documents.length > 0) {
          // Keep existing docs; don't clear them on empty response
        } else {
          setDocuments([]);
        }
      } catch {
        // keep current state on error
      }
    }

    load();
    if (!enabled) return;

    timer.current = setInterval(async () => {
      try {
        const { data } = await api.get('/documents/');
        if (cancelled) return;
        const docs: DocumentItem[] = (data.results || data || []).map((d: any) => ({
          id: String(d.id),
          name: d.name,
          status: d.status,
          entities: d.entity_count ?? d.entities_count ?? d.entities,
          relationships: d.relationship_count ?? d.relationships_count ?? d.relationships,
          uploadedAt: d.uploaded_at ?? d.created_at,
          error: d.error_message,
          source: d.source || '',
          processingStep: d.processing_step ?? d.processingStep ?? null,
          processingProgress: d.processing_progress ?? d.processingProgress ?? 0,
        }));
        const active = docs.filter(
          (d) => d.status === 'PENDING' || d.status === 'PROCESSING'
        ).length;
        setActiveJobs(active);
        setDocuments(docs);
      } catch {
        /* keep current */
      }
    }, POLLING_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [enabled, setDocuments, upsertDocument, setActiveJobs]);
}
