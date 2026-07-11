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
  const [hoverNode, setHoverNode] = useState<FGNode | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
      fgRef.current?.zoomToFit?.(400, 40);
    };
  }, [dim]);

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
      if (dim === 3) {
        const distance = 40;
        const distRatio = 1 + distance / Math.hypot((match as any).x || 1, (match as any).y || 1, (match as any).z || 1);
        if (fgRef.current.cameraPosition) {
          fgRef.current.cameraPosition(
            { x: ((match as any).x || 0) * distRatio, y: ((match as any).y || 0) * distRatio, z: ((match as any).z || 0) * distRatio },
            match, // lookAt
            600    // transitionMs
          );
        }
      } else {
        if (fgRef.current.centerAt) {
          fgRef.current.centerAt((match as any).x, (match as any).y, 600);
        }
        if (fgRef.current.zoom) {
          fgRef.current.zoom(2.5, 600);
        }
      }
    }
  }, [searchTerm, graphData.nodes, dim]);

  return (
    <div className="graph-canvas relative h-full w-full" style={{ height }}>
      <ForceGraph2D
        ref={fgRef}
        dim={dim}
        graphData={graphData}
        width={undefined}
        backgroundColor="transparent"
        nodeId="id"
        nodeLabel={(n: any) => `${n.name} · ${n.type}`}
        nodeVal={(n: any) => (n.val || 1) * 1.4}
        nodeRelSize={5}
        nodeColor={(n: any) =>
          searchHit && (n as any).id === searchHit
            ? '#ffffff'
            : entityColor(n.type)
        }
        nodeStrokeColor={(n: any) => {
          if (highlightSet.has((n as any).name) || highlightSet.has((n as any).id) || pathSet.has((n as any).id))
            return 'hsl(188 94% 52%)';
          return 'transparent';
        }}
        nodeStrokeWidth={(n: any) =>
          highlightSet.has((n as any).name) || highlightSet.has((n as any).id) || pathSet.has((n as any).id) ? 3 : 0
        }
        nodeOpacity={(n: any) => (isDimmed(n as FGNode) ? 0.18 : 1)}
        linkColor={(l: any) =>
          isPathEdge(l as FGLink) ? 'hsl(188 94% 52%)' : 'hsl(215 20% 40%)'
        }
        linkWidth={(l: any) => {
          if (isPathEdge(l as FGLink)) return 3;
          const conf = (l as any).confidence ?? 0.8;
          return 0.5 + conf * 2;
        }}
        linkLabel={(l: any) => {
          const rel = (l as any).type || (l as any).label || '';
          const conf = (l as any).confidence;
          const confStr = conf != null ? ` (${Math.round(conf * 100)}%)` : '';
          return rel.replace(/_/g, ' ') + confStr;
        }}
        linkOpacity={(l: any) => {
          if (pathSet.size > 0) {
            return isPathEdge(l as FGLink) ? 0.4 : 0.1;
          }
          if (highlightSet.size > 0) {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            const sName = typeof l.source === 'object' ? l.source.name : undefined;
            const tName = typeof l.target === 'object' ? l.target.name : undefined;

            const sHighlighted = highlightSet.has(s) || (sName && highlightSet.has(sName));
            const tHighlighted = highlightSet.has(t) || (tName && highlightSet.has(tName));

            return sHighlighted && tHighlighted ? 0.4 : 0.08;
          }
          return 0.4;
        }}
        linkDirectionalParticles={(l: any) => (isPathEdge(l as FGLink) ? 3 : 0)}
        linkDirectionalParticleColor={() => 'hsl(188 94% 60%)'}
        linkDirectionalParticleSpeed={0.01}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        onNodeClick={(n: any) => {
          closeContextMenu();
          selectEntity(n as GraphNode);
        }}
        onNodeDoubleClick={(n: any) => {
          const node = n as GraphNode;
          setHighlighted([node.id], []);
          if (fgRef.current) {
            if (dim === 3) {
              const distance = 40;
              const distRatio = 1 + distance / Math.hypot(n.x || 1, n.y || 1, n.z || 1);
              if (fgRef.current.cameraPosition) {
                fgRef.current.cameraPosition(
                  { x: (n.x || 0) * distRatio, y: (n.y || 0) * distRatio, z: (n.z || 0) * distRatio },
                  n, // lookAt
                  600 // transitionMs
                );
              }
            } else {
              fgRef.current.centerAt((n as any).x, (n as any).y, 600);
              fgRef.current.zoom(2.5, 600);
            }
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
        cooldownTicks={80}
        d3VelocityDecay={0.3}
      />
      <GraphControls />
      <GraphLegend />
      <GraphSearch />
      {hoverNode && !contextMenu && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-md border border-border bg-bg-elevated/95 p-3 text-xs shadow-lg backdrop-blur">
          <p className="font-semibold text-text-primary">{hoverNode.name}</p>
          <p className="text-text-muted">{hoverNode.type}</p>
          {hoverNode.description && (
            <p className="mt-1 text-text-secondary">{hoverNode.description}</p>
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
