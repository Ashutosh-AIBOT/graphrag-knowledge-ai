'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/axios';
import { useDocumentPolling } from '@/hooks/useDocumentPolling';
import { useDocumentsStore, DocumentItem } from '@/store/documents';
import { useGraphStore } from '@/store/graph';
import { DocumentUpload } from '@/components/documents/DocumentUpload';
import { DocumentRow } from '@/components/documents/DocumentRow';
import { Card, CardContent } from '@/components/ui/card';
import { Search, X, Layers, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGraphData } from '@/hooks/useGraphData';

export default function DocumentsPage() {
  useGraphData(); // Keep graph data updated
  
  const documents = useDocumentsStore((s) => s.documents);
  const selectedIds = useDocumentsStore((s) => s.selectedDocumentIds);
  const toggleSelectDocument = useDocumentsStore((s) => s.toggleSelectDocument);
  const graphData = useGraphStore((s) => s.data);
  const [notice, setNotice] = useState('');
  const [selectedDetailDoc, setSelectedDetailDoc] = useState<DocumentItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const completed = documents.filter((d) => d.status === 'COMPLETED').length;

  async function deleteDocument(id: string) {
    try {
      await api.delete(`/documents/${id}/`);
      
      // Update documents list
      useDocumentsStore.getState().setDocuments(
        useDocumentsStore.getState().documents.filter((d) => d.id !== id)
      );

      // Deselect if currently selected
      const store = useDocumentsStore.getState();
      if (store.selectedDocumentIds.includes(id)) {
        store.toggleSelectDocument(id);
      }

      // Close details panel if this document was open
      if (selectedDetailDoc?.id === id) {
        setSelectedDetailDoc(null);
      }

      setNotice('Document successfully deleted.');
    } catch {
      setNotice('Could not delete the document. Please try again.');
    }
    setTimeout(() => setNotice(''), 4000);
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

  // Filter local entities and relations for the selected detail document
  const docEntities = selectedDetailDoc
    ? graphData.nodes.filter((n) => n.sourceDoc === selectedDetailDoc.name)
    : [];
  const docLinks = selectedDetailDoc
    ? graphData.links.filter((l) => l.sourceDoc === selectedDetailDoc.name)
    : [];

  const [entityQuery, setEntityQuery] = useState('');
  const [relationQuery, setRelationQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'entities' | 'relations'>('entities');

  const filteredEntities = docEntities.filter(
    (e) =>
      e.name.toLowerCase().includes(entityQuery.toLowerCase()) ||
      e.type.toLowerCase().includes(entityQuery.toLowerCase())
  );

  const filteredLinks = docLinks.filter(
    (l) =>
      l.source.toLowerCase().includes(relationQuery.toLowerCase()) ||
      l.target.toLowerCase().includes(relationQuery.toLowerCase()) ||
      l.type.toLowerCase().includes(relationQuery.toLowerCase())
  );

  // Sync selectedDetailDoc when document properties change
  useEffect(() => {
    if (selectedDetailDoc) {
      const match = documents.find((d) => d.id === selectedDetailDoc.id);
      if (match) setSelectedDetailDoc(match);
      else setSelectedDetailDoc(null);
    }
  }, [documents]);

  return (
    <div className="flex h-full gap-4 p-4 overflow-hidden">
      {/* Left side master view */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-thin pr-1">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 shrink-0">
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Upload Document</h2>
              <DocumentUpload />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md bg-bg-elevated p-3 border border-border/20">
                  <p className="text-xl font-bold text-accent-violet">{documents.length}</p>
                  <p className="text-xs text-text-muted font-medium">Total</p>
                </div>
                <div className="rounded-md bg-bg-elevated p-3 border border-border/20">
                  <p className="text-xl font-bold text-success">{completed}</p>
                  <p className="text-xs text-text-muted font-medium">Completed</p>
                </div>
                <div className="rounded-md bg-bg-elevated p-3 border border-border/20">
                  <p className="text-xl font-bold text-warning">
                    {documents.filter((d) => d.status === 'PROCESSING' || d.status === 'PENDING').length}
                  </p>
                  <p className="text-xs text-text-muted font-medium">Active</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-text-muted leading-relaxed">
                Check boxes to select source context. Click rows to view extracted entities and relationships.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1 flex flex-col min-h-0 bg-bg-surface rounded-lg border border-border p-4">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold text-text-primary">Document List</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => useDocumentsStore.getState().selectAllDocuments()}
                className="text-[11px] text-accent-violet hover:underline font-medium"
              >
                Select All
              </button>
              <span className="text-[11px] text-text-muted">|</span>
              <button
                type="button"
                onClick={() => useDocumentsStore.getState().deselectAllDocuments()}
                className="text-[11px] text-text-muted hover:underline font-medium"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin min-h-0">
            {documents.length === 0 ? (
              <p className="text-sm text-text-muted py-8 text-center">No documents uploaded yet.</p>
            ) : (
              documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedIds.includes(doc.id)}
                  onToggleSelect={toggleSelectDocument}
                  onViewDetails={setSelectedDetailDoc}
                  onDelete={setDeleteConfirmId}
                  onRetry={retryDocument}
                />
              ))
            )}
            
            {notice && (
              <div className="mt-3 p-2.5 rounded-md border border-accent-cyan/20 bg-accent-cyan/10 text-xs text-accent-cyan font-medium">
                {notice}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right side details card */}
      <Card className="w-[380px] shrink-0 hidden lg:flex flex-col h-full overflow-hidden border border-border bg-bg-surface">
        <CardContent className="p-4 flex flex-col h-full overflow-hidden min-h-0">
          {selectedDetailDoc ? (
            <div className="flex flex-col h-full overflow-hidden min-h-0">
              <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold truncate text-text-primary pr-2" title={selectedDetailDoc.name}>
                    {selectedDetailDoc.name}
                  </h3>
                  <p className="text-[10px] text-text-muted font-medium mt-0.5">Extracted graph metadata</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetailDoc(null)}
                  className="p-1 hover:bg-bg-elevated rounded transition-colors text-text-muted hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex border-b border-border text-xs mt-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('entities')}
                  className={cn(
                    'flex-1 pb-2 font-semibold border-b-2 transition-colors text-center',
                    activeTab === 'entities'
                      ? 'border-accent-violet text-accent-violet'
                      : 'border-transparent text-text-muted hover:text-text-primary'
                  )}
                >
                  Entities ({docEntities.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('relations')}
                  className={cn(
                    'flex-1 pb-2 font-semibold border-b-2 transition-colors text-center',
                    activeTab === 'relations'
                      ? 'border-accent-violet text-accent-violet'
                      : 'border-transparent text-text-muted hover:text-text-primary'
                  )}
                >
                  Relationships ({docLinks.length})
                </button>
              </div>

              <div className="flex-1 mt-3 overflow-hidden flex flex-col min-h-0">
                {activeTab === 'entities' ? (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="relative mb-2 shrink-0">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-text-muted" />
                      <input
                        type="text"
                        placeholder="Search entities..."
                        value={entityQuery}
                        onChange={(e) => setEntityQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-border bg-bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-violet text-text-primary placeholder:text-text-muted/65"
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin min-h-0">
                      {filteredEntities.length === 0 ? (
                        <p className="text-xs text-text-muted text-center py-6">No matching entities found.</p>
                      ) : (
                        filteredEntities.map((ent, i) => (
                          <div key={i} className="p-2.5 rounded bg-bg-elevated border border-border/40 text-xs">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="font-semibold text-text-primary truncate">{ent.name}</span>
                              <span className="px-1.5 py-0.5 rounded-full bg-accent-violet/15 text-accent-violet text-[9px] uppercase font-bold shrink-0">
                                {ent.type}
                              </span>
                            </div>
                            {ent.description && (
                              <p className="text-text-muted text-[11px] leading-relaxed mt-1 font-normal">{ent.description}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col h-full min-h-0">
                    <div className="relative mb-2 shrink-0">
                      <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-text-muted" />
                      <input
                        type="text"
                        placeholder="Search relationships..."
                        value={relationQuery}
                        onChange={(e) => setRelationQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-border bg-bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-violet text-text-primary placeholder:text-text-muted/65"
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin min-h-0">
                      {filteredLinks.length === 0 ? (
                        <p className="text-xs text-text-muted text-center py-6">No matching relationships found.</p>
                      ) : (
                        filteredLinks.map((link, i) => (
                          <div key={i} className="p-2.5 rounded bg-bg-elevated border border-border/40 text-xs space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] leading-relaxed">
                              <span className="font-semibold text-text-primary">{link.source}</span>
                              <span className="px-1.5 py-0.5 rounded bg-accent-cyan/15 text-accent-cyan text-[9px] font-bold shrink-0">
                                {link.type}
                              </span>
                              <span className="font-semibold text-text-primary">{link.target}</span>
                            </div>
                            {link.description && (
                              <p className="text-text-muted text-[11px] leading-relaxed mt-1 font-normal">{link.description}</p>
                            )}
                            {link.confidence !== undefined && (
                              <p className="text-[10px] text-text-muted/75 font-medium mt-1">Confidence: {link.confidence.toFixed(2)}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="w-12 h-12 rounded-full bg-accent-violet/10 flex items-center justify-center text-accent-violet mb-3 shrink-0">
                <Layers className="h-5 w-5" />
              </div>
              <h4 className="text-xs font-semibold text-text-primary mb-1">No Document Selected</h4>
              <p className="text-[11px] text-text-muted max-w-[220px] leading-relaxed">
                Click a completed document card on the left to explore its extracted entities and relationships.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-border bg-bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-error mb-4">
              <AlertCircle className="h-6 w-6" />
              <h3 className="text-lg font-bold text-text-primary">Confirm Deletion</h3>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed mb-6">
              Are you sure you want to delete this document? This will remove all its nodes and relationships from the database. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteDocument(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="rounded-md bg-error px-4 py-2 text-xs font-semibold text-white hover:bg-error/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
