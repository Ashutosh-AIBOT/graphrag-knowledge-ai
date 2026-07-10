'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { useDocumentPolling } from '@/hooks/useDocumentPolling';
import { useDocumentsStore } from '@/store/documents';
import { useGraphStore } from '@/store/graph';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentRow } from '@/components/documents/DocumentRow';
import { Card, CardContent } from '@/components/ui/card';

export default function DocumentsPage() {
  useDocumentPolling();
  const documents = useDocumentsStore((s) => s.documents);
  const setHighlighted = useGraphStore((s) => s.setHighlighted);
  const graphData = useGraphStore((s) => s.data);
  const router = useRouter();
  const [notice, setNotice] = useState('');

  const completed = documents.filter((d) => d.status === 'COMPLETED').length;

  function filterToDoc(docName: string) {
    const ids = graphData.nodes
      .filter((n) => n.sourceDoc === docName)
      .map((n) => n.id);
    if (ids.length) setHighlighted(ids);
    router.push('/');
  }

  async function retryDocument(id: string) {
    try {
      await api.delete(`/documents/${id}/`);
      useDocumentsStore.getState().setDocuments(
        useDocumentsStore.getState().documents.filter((d) => d.id !== id)
      );
      setNotice('Failed document removed — please re-upload to retry.');
    } catch {
      setNotice('Could not remove the document. Please try again.');
    }
    setTimeout(() => setNotice(''), 4000);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 scrollbar-thin">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Upload Document</h2>
            <DocumentUpload />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-bg-elevated p-3">
                <p className="text-xl font-bold text-accent-violet">{documents.length}</p>
                <p className="text-xs text-text-muted">Total</p>
              </div>
              <div className="rounded-md bg-bg-elevated p-3">
                <p className="text-xl font-bold text-success">{completed}</p>
                <p className="text-xs text-text-muted">Completed</p>
              </div>
              <div className="rounded-md bg-bg-elevated p-3">
                <p className="text-xl font-bold text-warning">
                  {documents.filter((d) => d.status === 'PROCESSING' || d.status === 'PENDING').length}
                </p>
                <p className="text-xs text-text-muted">Active</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Click a completed document to filter the graph to its entities.
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Document List</h2>
        <div className="space-y-2">
          {documents.length === 0 && (
            <p className="text-sm text-text-muted">No documents yet. Upload one to begin.</p>
          )}
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onFilter={filterToDoc}
              onRetry={retryDocument}
            />
          ))}
          {notice && (
            <p className="rounded-md border border-accent-cyan/30 bg-accent-cyan/10 px-3 py-2 text-xs text-accent-cyan">
              {notice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
