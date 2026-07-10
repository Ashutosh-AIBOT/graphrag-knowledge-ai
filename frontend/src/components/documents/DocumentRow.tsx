import { FileText, AlertCircle, RotateCcw } from 'lucide-react';
import { DocumentItem } from '@/store/documents';
import { StatusBadge } from './StatusBadge';
import { ProcessingSteps } from './ProcessingSteps';
import { cn } from '@/lib/utils';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function DocumentRow({
  doc,
  onFilter,
  onRetry,
}: {
  doc: DocumentItem;
  onFilter?: (name: string) => void;
  onRetry?: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-bg-surface p-3',
        doc.status === 'COMPLETED' && 'cursor-pointer hover:border-accent-violet/40'
      )}
      onClick={() => doc.status === 'COMPLETED' && onFilter?.(doc.name)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-text-muted" />
          <span className="truncate text-sm font-medium text-text-primary">{doc.name}</span>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      {doc.status === 'PROCESSING' ? (
        <div className="mt-2">
          <ProcessingSteps currentStep={doc.processingStep} />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
          {doc.entities !== undefined && <span>{doc.entities} entities</span>}
          {doc.relationships !== undefined && <span>{doc.relationships} relations</span>}
          <span>{formatDate(doc.uploadedAt)}</span>
        </div>
      )}

      {doc.status === 'FAILED' && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-error/10 px-2 py-1.5 text-xs text-error">
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {doc.error || 'Processing failed'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.(doc.id);
            }}
            className="inline-flex items-center gap-1 font-medium hover:underline"
          >
            <RotateCcw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}
    </div>
  );
}
