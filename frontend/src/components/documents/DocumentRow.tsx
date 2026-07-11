import { FileText, AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
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
  isSelected,
  onToggleSelect,
  onViewDetails,
  onDelete,
  onRetry,
}: {
  doc: DocumentItem;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onViewDetails?: (doc: DocumentItem) => void;
  onDelete?: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-border bg-bg-surface p-3 transition-colors',
        doc.status === 'COMPLETED' && 'hover:border-accent-violet/30 cursor-pointer'
      )}
      onClick={() => doc.status === 'COMPLETED' && onViewDetails?.(doc)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {doc.status === 'COMPLETED' ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.(doc.id);
              }}
              className="h-4 w-4 rounded border-border bg-bg-surface text-accent-violet focus:ring-accent-violet cursor-pointer"
            />
          ) : (
            <div className="w-4 h-4 shrink-0" /> // Spacer to preserve alignment
          )}
          <FileText className="h-4 w-4 shrink-0 text-text-muted" />
          <span className="truncate text-sm font-medium text-text-primary">{doc.name}</span>
        </div>
        
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={doc.status} />
          <button
            type="button"
            onClick={() => onDelete?.(doc.id)}
            className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-error transition-colors"
            title="Delete document"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {doc.status === 'PROCESSING' ? (
        <div className="mt-2 pl-6">
          <ProcessingSteps currentStep={doc.processingStep} status={doc.status} />
        </div>
      ) : (
        <div className="mt-2 pl-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
          {doc.entities !== undefined && <span>{doc.entities} entities</span>}
          {doc.relationships !== undefined && <span>{doc.relationships} relations</span>}
          <span>{formatDate(doc.uploadedAt)}</span>
        </div>
      )}

      {doc.status === 'FAILED' && (
        <div className="mt-2 ml-6 flex items-center justify-between gap-2 rounded-md bg-error/10 px-2 py-1.5 text-xs text-error">
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {doc.error || 'Processing failed'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.(doc.id);
            }}
            className="inline-flex items-center gap-1 font-medium hover:underline text-error"
          >
            <RotateCcw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}
    </div>
  );
}
