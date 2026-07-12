import { create } from 'zustand';

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description?: string;
  sourceDoc?: string;
  val?: number;
  community?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  confidence?: number;
  description?: string;
  sourceDoc?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface GraphState {
  data: GraphData;
  highlightedEntities: string[];
  highlightedPaths: string[];
  searchTerm: string;
  visibleTypes: Record<string, boolean>;
  visibleRelationships: Record<string, boolean>;
  selectedEntity: GraphNode | null;
  dim: 2 | 3;
  setData: (data: GraphData) => void;
  setHighlighted: (entities: string[], paths?: string[]) => void;
  clearHighlighted: () => void;
  setSearchTerm: (term: string) => void;
  toggleType: (type: string) => void;
  toggleRelationship: (rel: string) => void;
  selectEntity: (entity: GraphNode | null) => void;
  setDim: (dim: 2 | 3) => void;
}

export const useGraphStore = create<GraphState>((set) => ({
  data: { nodes: [], links: [] },
  highlightedEntities: [],
  highlightedPaths: [],
  searchTerm: '',
  visibleTypes: {},
  visibleRelationships: {},
  selectedEntity: null,
  dim: 2,
  setData: (data) => set({ data }),
  setHighlighted: (entities, paths = []) =>
    set({ highlightedEntities: entities, highlightedPaths: paths }),
  clearHighlighted: () => set({ highlightedEntities: [], highlightedPaths: [] }),
  setSearchTerm: (term) => set({ searchTerm: term }),
  toggleType: (type) =>
    set((state) => ({
      visibleTypes: { ...state.visibleTypes, [type]: !state.visibleTypes[type] },
    })),
  toggleRelationship: (rel) =>
    set((state) => ({
      visibleRelationships: {
        ...state.visibleRelationships,
        [rel]: !state.visibleRelationships[rel],
      },
    })),
  selectEntity: (entity) => set({ selectedEntity: entity }),
  setDim: (dim) => set({ dim }),
}));
