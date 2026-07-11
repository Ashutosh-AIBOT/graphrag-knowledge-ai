'use client';

import { Plus, Minus, Maximize, Crosshair } from 'lucide-react';
import { graphController } from './graphController';
import { useGraphStore } from '@/store/graph';

export function GraphControls() {
  const dim = useGraphStore((s) => s.dim);
  const setDim = useGraphStore((s) => s.setDim);

  return (
    <div className="absolute right-3 top-3 flex flex-col gap-1.5">
      <button
        onClick={() => setDim(dim === 2 ? 3 : 2)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated/90 text-xs font-bold text-accent-cyan shadow-sm backdrop-blur hover:bg-bg-surface hover:text-text-primary transition-all duration-200"
        aria-label="Toggle 2D/3D"
      >
        {dim === 2 ? '3D' : '2D'}
      </button>
      <button
        onClick={() => graphController.zoomIn?.()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated/90 text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
        aria-label="Zoom in"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        onClick={() => graphController.zoomOut?.()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated/90 text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
        aria-label="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => graphController.resetView?.()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated/90 text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
        aria-label="Reset view"
      >
        <Maximize className="h-4 w-4" />
      </button>
      <button
        onClick={() => graphController.resetView?.()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated/90 text-text-secondary shadow-sm backdrop-blur hover:text-text-primary"
        aria-label="Center"
      >
        <Crosshair className="h-4 w-4" />
      </button>
    </div>
  );
}
