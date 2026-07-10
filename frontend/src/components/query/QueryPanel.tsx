'use client';

import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { DocumentFilterDropdown } from './DocumentFilterDropdown';

export type QueryMode = 'graph' | 'vector' | 'hybrid';

const MODES: { value: QueryMode; label: string }[] = [
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'graph', label: 'Graph' },
  { value: 'vector', label: 'Vector' },
];

interface QueryPanelProps {
  value: string;
  onChange: (v: string) => void;
  mode: QueryMode;
  onModeChange: (m: QueryMode) => void;
  onSubmit: () => void;
  loading?: boolean;
}

export function QueryPanel({
  value,
  onChange,
  mode,
  onModeChange,
  onSubmit,
  loading,
}: QueryPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Mode
          </span>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => onModeChange(m.value)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  mode === m.value
                    ? 'bg-accent-violet text-white'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <DocumentFilterDropdown />
      </div>

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !loading && onSubmit()}
          placeholder="Ask anything about your documents..."
          className="h-11"
        />
        <Button onClick={onSubmit} disabled={loading || !value.trim()} className="h-11 px-4">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Submit</span>
        </Button>
      </div>
    </div>
  );
}
