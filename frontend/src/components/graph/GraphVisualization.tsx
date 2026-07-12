'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useGraphStore } from '@/store/graph';
import { entityColor } from '@/lib/constants';
import { GraphNode, GraphLink } from '@/store/graph';
import { graphController } from './graphController';
import { GraphControls } from './GraphControls';
import { GraphLegend } from './GraphLegend';
import { GraphSearch } from './GraphSearch';

const ForceGraph2D = dynamic(() => import('./ForceGraphWrapper'), { ssr: false }) as any;

interface FGNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}
interface FGLink {
  source: any;
  target: any;
  type: string;
  confidence?: number;
}

export function GraphVisualization({ height = '100%' }: { height?: string | number }) {
  const data = useGraphStore((s) => s.data);
  const highlighted = useGraphStore((s) => s.highlightedEntities);
  const paths = useGraphStore((s) => s.highlightedPaths);
  const searchTerm = useGraphStore((s) => s.searchTerm);
  const visibleTypes = useGraphStore((s) => s.visibleTypes);
  const visibleRelationships = useGraphStore((s) => s.visibleRelationships);
  const selectEntity = useGraphStore((s) => s.selectEntity);
  const setHighlighted = useGraphStore((s) => s.setHighlighted);
  const dim = useGraphStore((s) => s.dim);

  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverNode, setHoverNode] = useState<FGNode | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const [initialized, setInitialized] = useState(false);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Set up zoom controls
  useEffect(() => {
    graphController.zoomIn = () => {
      if (dim === 3) {
        const cam = fgRef.current?.camera?.();
        if (cam && fgRef.current?.cameraPosition) {
          const { x, y, z } = cam.position;
          fgRef.current.cameraPosition({ x: x * 0.75, y: y * 0.75, z: z * 0.75 }, undefined, 300);
        }
      } else {
        fgRef.current?.zoom?.(fgRef.current.zoom() * 1.4, 300);
      }
    };
    graphController.zoomOut = () => {
      if (dim === 3) {
        const cam = fgRef.current?.camera?.();
        if (cam && fgRef.current?.cameraPosition) {
          const { x, y, z } = cam.position;
          fgRef.current.cameraPosition({ x: x * 1.33, y: y * 1.33, z: z * 1.33 }, undefined, 300);
        }
      } else {
        fgRef.current?.zoom?.(fgRef.current.zoom() / 1.4, 300);
      }
    };
    graphController.resetView = () => {
      fgRef.current?.zoomToFit?.(400, 60);
    };
  }, [dim]);

  // Auto-center on data load
  useEffect(() => {
    if (data.nodes.length > 0) {
      setInitialized(false);
    }
  }, [data.nodes.length]);

  const pathSet = useMemo(() => new Set(paths), [paths]);
  const highlightSet = useMemo(() => new Set(highlighted), [highlighted]);

  const graphData = useMemo(() => {
    const typeHidden = (t: string) => visibleTypes[t] === false;
    const relHidden = (r: string) => visibleRelationships[r] === false;
    const nodes = data.nodes
      .filter((n) => !typeHidden(n.type))
      .map((n) => ({ ...n }));
    const idSet = new Set(nodes.map((n) => n.id));
    const links = data.links
      .filter((l) => idSet.has(l.source) && idSet.has(l.target))
      .filter((l) => !relHidden(l.type))
      .map((l) => ({ ...l }));
    return { nodes, links };
  }, [data, visibleTypes, visibleRelationships]);

  const isPathEdge = (l: FGLink) => {
    if (pathSet.size === 0) return false;
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    const seq = paths;
    for (let i = 0; i < seq.length - 1; i++) {
      if (
        (seq[i] === s && seq[i + 1] === t) ||
        (seq[i] === t && seq[i + 1] === s)
      ) {
        return true;
      }
    }
    return false;
  };

  const isDimmed = (n: FGNode) => {
    if (highlightSet.size === 0 && pathSet.size === 0) return false;
    if (pathSet.size > 0) return !pathSet.has(n.id);
    return !highlightSet.has(n.name) && !highlightSet.has(n.id);
  };

  const [searchHit, setSearchHit] = useState<string | null>(null);
  useEffect(() => {
    if (!searchTerm) {
      setSearchHit(null);
      return;
    }
    const match = graphData.nodes.find((n) =>
      n.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setSearchHit(match ? (match as any).id : null);
    if (match && fgRef.current) {
      if (fgRef.current.centerAt) {
        fgRef.current.centerAt((match as any).x, (match as any).y, 600);
      }
      if (fgRef.current.zoom) {
        fgRef.current.zoom(3, 600);
      }
    }
  }, [searchTerm, graphData.nodes]);

  // Custom node painter for vivid colors and glow effects
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const n = node as FGNode;
    const x = n.x ?? 0;
    const y = n.y ?? 0;

    const baseR = Math.sqrt(Math.max((n.val || 1), 1)) * 5;
    const r = Math.max(baseR, 4);

    const color = entityColor(n.type);
    const isHighlighted = highlightSet.has(n.name) || highlightSet.has(n.id) || pathSet.has(n.id);
    const isSearch = searchHit && n.id === searchHit;
    const dimmed = isDimmed(n);
    const isHovered = hoverNode?.id === n.id;

    const alpha = dimmed ? 0.2 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Glow / pulse for highlighted or hovered nodes
    if (isHighlighted || isSearch || isHovered) {
      const glowColor = isSearch ? '#ffffff' : isHighlighted ? 'hsl(188, 94%, 52%)' : color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = glowColor;

      // Outer ring
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Node fill with radial gradient for depth
    const gradient = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    gradient.addColorStop(0, lightenColor(color, 40));
    gradient.addColorStop(1, color);

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Subtle border
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label — show when zoomed in enough or when hovered/highlighted
    const fontSize = Math.max(10 / globalScale, 2);
    const showLabel = globalScale > 0.8 || isHighlighted || isSearch || isHovered;

    if (showLabel) {
      ctx.shadowBlur = 0;
      ctx.font = `${isHighlighted || isHovered ? 'bold ' : ''}${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Text background
      const textWidth = ctx.measureText(n.name).width;
      const bPad = 2 / globalScale;
      ctx.fillStyle = 'rgba(10, 12, 20, 0.85)';
      ctx.fillRect(x - textWidth / 2 - bPad, y + r + 1 / globalScale, textWidth + bPad * 2, fontSize + bPad * 2);

      // Text
      ctx.fillStyle = isHighlighted || isHovered ? '#ffffff' : 'rgba(220,220,240,0.9)';
      ctx.fillText(n.name, x, y + r + fontSize / 2 + 3 / globalScale);
    }

    ctx.restore();
  }, [highlightSet, pathSet, searchHit, hoverNode, isDimmed]);

  const nodePointerAreaPaint = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const n = node as FGNode;
    const r = Math.max(Math.sqrt(Math.max((n.val || 1), 1)) * 5, 4) + 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  return (
    <div ref={containerRef} className="graph-canvas relative h-full w-full" style={{ height }}>
      <ForceGraph2D
        fgRef={fgRef}
        dim={dim}
        graphData={graphData}
        width={undefined}
        backgroundColor="rgba(0,0,0,0)"
        nodeId="id"
        nodeLabel={(n: any) => `${n.name} · ${n.type}`}
        nodeVal={(n: any) => (n.val || 1) * 1.4}
        nodeRelSize={5}
        nodeCanvasObject={dim === 2 ? nodeCanvasObject : undefined}
        nodeCanvasObjectMode={() => dim === 2 ? 'replace' : 'after'}
        nodePointerAreaPaint={dim === 2 ? nodePointerAreaPaint : undefined}
        // 3D fallback colors
        nodeColor={(n: any) =>
          searchHit && (n as any).id === searchHit
            ? '#ffffff'
            : entityColor(n.type)
        }
        nodeOpacity={(n: any) => (isDimmed(n as FGNode) ? 0.18 : 1)}
        linkColor={(l: any) =>
          isPathEdge(l as FGLink) ? 'hsl(188, 94%, 52%)' : 'rgba(148,163,184,0.35)'
        }
        linkWidth={(l: any) => {
          if (isPathEdge(l as FGLink)) return 3;
          const conf = (l as any).confidence ?? 0.8;
          return 0.5 + conf * 1.2;
        }}
        linkLabel={(l: any) => {
          const rel = (l as any).type || (l as any).label || '';
          const conf = (l as any).confidence;
          const confStr = conf != null ? ` (${Math.round(conf * 100)}%)` : '';
          return rel.replace(/_/g, ' ') + confStr;
        }}
        linkOpacity={(l: any) => {
          if (pathSet.size > 0) {
            return isPathEdge(l as FGLink) ? 0.9 : 0.08;
          }
          if (highlightSet.size > 0) {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            const sName = typeof l.source === 'object' ? l.source.name : undefined;
            const tName = typeof l.target === 'object' ? l.target.name : undefined;
            const sHighlighted = highlightSet.has(s) || (sName && highlightSet.has(sName));
            const tHighlighted = highlightSet.has(t) || (tName && highlightSet.has(tName));
            return sHighlighted && tHighlighted ? 0.7 : 0.08;
          }
          return 0.5;
        }}
        linkDirectionalParticles={(l: any) => (isPathEdge(l as FGLink) ? 4 : 0)}
        linkDirectionalParticleColor={() => 'hsl(188, 94%, 60%)'}
        linkDirectionalParticleSpeed={0.008}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkDirectionalArrowColor={(l: any) => isPathEdge(l as FGLink) ? 'hsl(188,94%,52%)' : 'rgba(148,163,184,0.5)'}
        onNodeClick={(n: any) => {
          closeContextMenu();
          selectEntity(n as GraphNode);
        }}
        onNodeDoubleClick={(n: any) => {
          const node = n as GraphNode;
          setHighlighted([node.id], []);
          if (fgRef.current) {
            fgRef.current.centerAt?.((n as any).x, (n as any).y, 600);
            fgRef.current.zoom?.(3, 600);
          }
        }}
        onNodeHover={(n: any) => setHoverNode(n as FGNode)}
        onNodeRightClick={(n: any, e: any) => {
          e.preventDefault();
          const node = n as GraphNode;
          setContextMenu({ x: e.clientX, y: e.clientY, node });
        }}
        onBackgroundClick={() => {
          closeContextMenu();
          setHighlighted([], []);
        }}
        cooldownTicks={120}
        cooldownTime={3000}
        d3VelocityDecay={0.25}
        d3AlphaDecay={0.02}
        onEngineStop={() => {
          if (!initialized && fgRef.current && graphData.nodes.length > 0) {
            fgRef.current.zoomToFit?.(400, 60);
            setInitialized(true);
          }
        }}
      />
      <GraphControls />
      <GraphLegend />
      <GraphSearch />
      {hoverNode && !contextMenu && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-xs rounded-lg border border-border bg-bg-elevated/95 p-3 text-xs shadow-xl backdrop-blur">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: entityColor(hoverNode.type) }} />
            <p className="font-bold text-text-primary">{hoverNode.name}</p>
          </div>
          <p className="text-text-muted text-[10px] uppercase tracking-wider">{hoverNode.type}</p>
          {hoverNode.description && (
            <p className="mt-1.5 text-text-secondary leading-relaxed">{hoverNode.description}</p>
          )}
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border border-border bg-bg-elevated shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              selectEntity(contextMenu.node);
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-surface hover:text-text-primary"
          >
            View Details
          </button>
          <button
            onClick={() => {
              setHighlighted([contextMenu.node.id], []);
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-surface hover:text-text-primary"
          >
            Highlight on Graph
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('graphrag:ask-entity', { detail: contextMenu.node.name }));
              }
              closeContextMenu();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent-cyan hover:bg-bg-surface"
          >
            Ask about this entity
          </button>
        </div>
      )}
    </div>
  );
}

/** Lighten a hex color by `amount` (0–255) */
function lightenColor(hex: string, amount: number): string {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  } catch {
    return hex;
  }
}
