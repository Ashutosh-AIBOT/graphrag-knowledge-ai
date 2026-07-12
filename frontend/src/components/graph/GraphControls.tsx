'use client';

import { Box, Square, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useGraphStore } from '@/store/graph';
import { graphController } from './graphController';
import { cn } from '@/lib/utils';

export function GraphControls() {
  const dim = useGraphStore((s) => s.dim);
  const setDim = useGraphStore((s) => s.setDim);

  return (
    <div className="absolute right-3 top-3 z-20 flex flex-col gap-1.5">
      <button
        onClick={() => setDim(dim === 3 ? 2 : 3)}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated shadow-sm backdrop-blur hover:text-text-primary transition-colors',
          dim === 3 ? 'text-accent-violet' : 'text-accent-cyan'
        )}
        title={dim === 3 ? 'Switch to 2D' : 'Switch to 3D'}
      >
        {dim === 3 ? <Box className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>
      <button
        onClick={() => graphController.zoomIn?.()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated text-text-secondary shadow-sm backdrop-blur hover:text-text-primary transition-colors"
        title="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <button
        onClick={() => graphController.zoomOut?.()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated text-text-secondary shadow-sm backdrop-blur hover:text-text-primary transition-colors"
        title="Zoom out"
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        onClick={() => graphController.resetView?.()}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-bg-elevated text-text-secondary shadow-sm backdrop-blur hover:text-text-primary transition-colors"
        title="Reset view"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}
