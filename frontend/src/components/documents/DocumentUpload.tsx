'use client';

import { useState, useEffect } from 'react';
import { UploadCloud, FileUp, CheckCircle2 } from 'lucide-react';
import api from '@/lib/axios';
import { useDocumentsStore } from '@/store/documents';
import { useAuthStore } from '@/store/auth';

export function DocumentUpload() {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const documents = useDocumentsStore((s) => s.documents);
  const upsertDocument = useDocumentsStore((s) => s.upsertDocument);
  const isAuthed = useAuthStore((s) => s.isAuthenticated);

  // Track real processing progress from the document store
  const liveDoc = uploadedDocId ? documents.find((d) => d.id === uploadedDocId) : null;
  const liveProgress = liveDoc?.processingProgress ?? 0;
  const liveStep = liveDoc?.processingStep || null;

  // Clear upload state when document completes or fails
  useEffect(() => {
    if (liveDoc && (liveDoc.status === 'COMPLETED' || liveDoc.status === 'FAILED')) {
      const timer = setTimeout(() => {
        setUploading(false);
        setUploadedDocId(null);
        setUploadError(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDoc?.status]);

  const ALLOWED_EXTS = new Set(['.pdf', '.txt', '.md', '.docx', '.doc', '.csv', '.json', '.html', '.xml']);
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;

  async function uploadFile(file: File) {
    if (!isAuthed) {
      alert('Please log in to upload documents.');
      return;
    }

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      setUploadError(`File type "${ext}" is not supported. Allowed: ${Array.from(ALLOWED_EXTS).join(', ')}`);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setUploadError(`File exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB).`);
      return;
    }
    if (file.size === 0) {
      setUploadError('Empty files are not allowed.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadedDocId(null);

    const form = new FormData();
    form.append('file', file);
    if (source.trim()) {
      form.append('source', source.trim());
    }
    try {
      const { data } = await api.post('/documents/upload/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const doc = data.document;
      upsertDocument({
        id: doc.id,
        name: doc.name,
        status: doc.status,
        uploadedAt: doc.uploaded_at ?? new Date().toISOString(),
        processingStep: doc.processing_step ?? null,
        processingProgress: doc.processing_progress ?? 0,
      });
      setUploadedDocId(doc.id);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Upload failed.';
      setUploadError(msg);
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-xs font-medium text-text-muted">Document Source (optional)</label>
        <input
          type="text"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="e.g. research-paper, company-docs, internal-wiki"
          className="w-full rounded-md border border-border bg-bg-base px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) uploadFile(f);
        }}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? 'border-accent-cyan bg-accent-cyan/5' : 'border-border bg-bg-base'
        }`}
      >
        <UploadCloud className="mb-2 h-8 w-8 text-accent-cyan" />
        <p className="text-sm font-medium text-text-primary">Drop files here or browse</p>
        <p className="mt-1 text-xs text-text-muted">
          Supports: PDF, TXT, DOCX, Markdown, CSV, JSON, HTML, XML · Max 10MB
        </p>
        <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent-violet px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-violet/90">
          <FileUp className="h-3.5 w-3.5" /> Browse
          <input
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.docx,.doc,.csv,.json,.html,.xml"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
            }}
          />
        </label>
      </div>

      {uploadError && (
        <div className="rounded-md border border-error/30 bg-error/5 p-3 text-xs text-error">
          {uploadError}
        </div>
      )}

      {uploading && (
        <div className="rounded-md border border-border bg-bg-surface p-3">
          <p className="mb-2 text-xs font-medium text-text-secondary">
            {liveDoc?.status === 'COMPLETED' ? (
              <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Processing complete</span>
            ) : liveStep ? (
              <>{liveStep}...</>
            ) : (
              <>Uploading...</>
            )}
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg-elevated">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${liveProgress}%`,
                backgroundColor: liveDoc?.status === 'COMPLETED' ? 'hsl(var(--success))' : 'hsl(var(--accent-cyan) / 0.8)'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
