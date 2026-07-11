import { Badge } from '@/components/ui/badge';
import { DocStatus } from '@/store/documents';

const MAP: Record<DocStatus, { variant: 'success' | 'warning' | 'error' | 'info' | 'default'; label: string }> = {
  COMPLETED: { variant: 'success', label: 'COMPLETED' },
  PROCESSING: { variant: 'warning', label: 'PROCESSING' },
  PENDING: { variant: 'info', label: 'PENDING' },
  FAILED: { variant: 'error', label: 'FAILED' },
};

export function StatusBadge({ status }: { status: DocStatus }) {
  const m = MAP[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
