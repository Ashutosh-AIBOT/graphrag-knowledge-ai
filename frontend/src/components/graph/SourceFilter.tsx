'use client';

import { useMemo } from 'react';
import { useGraphStore } from '@/store/graph';
import { useDocumentsStore } from '@/store/documents';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SourceFilter() {
  const data = useGraphStore((s) => s.data);
  const documents = useDocumentsStore((s) => s.documents);

  const sourceDocs = useMemo(() => {
    const docSet = new Set(data.nodes.map((n) => n.sourceDoc).filter(Boolean));
    return Array.from(docSet).sort();
  }, [data.nodes]);

  const completedDocs = useMemo(
    () => documents.filter((d) => d.status === 'COMPLETED').map((d) => d.name),
    [documents]
  );

  const allSources = useMemo(() => {
    const merged = new Set([...sourceDocs, ...completedDocs]);
    return Array.from(merged).sort();
  }, [sourceDocs, completedDocs]);

  if (allSources.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-surface p-2">
      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <FileText className="h-3.5 w-3.5" /> Sources:
      </span>
      {allSources.map((src) => {
        const count = data.nodes.filter((n) => n.sourceDoc === src).length;
        return (
          <span
            key={src}
            className="inline-flex items-center gap-1 rounded-full border border-accent-indigo/40 bg-accent-indigo/10 px-2.5 py-1 text-xs font-medium text-accent-indigo"
          >
            {src}
            {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
          </span>
        );
      })}
    </div>
  );
}
