'use client';

import { useState } from 'react';
import { Network, Type, Layers, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SourceToggleProps {
  method: string;
  entityCount: number;
  chunkCount: number;
}

export function SourceToggle({ method, entityCount, chunkCount }: SourceToggleProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border bg-bg-surface px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
              method === 'Graph'
                ? 'bg-accent-violet/15 text-accent-violet'
                : method === 'Vector'
                ? 'bg-accent-indigo/15 text-accent-indigo'
                : 'bg-accent-cyan/15 text-accent-cyan'
            )}
          >
            {method} used
          </span>
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Network className="h-3.5 w-3.5" /> {entityCount} entities
          </span>
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <Type className="h-3.5 w-3.5" /> {chunkCount} chunks
          </span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <Layers className="h-3.5 w-3.5" /> Context
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-md border border-border bg-bg-base p-3 text-xs text-text-secondary">
          <p className="mb-1 font-medium text-text-primary">Retrieval context</p>
          <p>
            GRAPH CONTEXT: {entityCount} entities and their relationships were traversed in Neo4j.
          </p>
          <p>
            TEXT CONTEXT: {chunkCount} semantically similar text chunks were retrieved from the vector store.
          </p>
        </div>
      )}
    </div>
  );
}
