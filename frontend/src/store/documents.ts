import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type DocStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface DocumentItem {
  id: string;
  name: string;
  status: DocStatus;
  entities?: number;
  relationships?: number;
  uploadedAt: string;
  error?: string;
  source?: string;
  processingStep?: string | null;
  processingProgress?: number;
}

interface DocumentsState {
  documents: DocumentItem[];
  activeJobs: number;
  selectedDocumentIds: string[];
  setDocuments: (docs: DocumentItem[]) => void;
  upsertDocument: (doc: DocumentItem) => void;
  setActiveJobs: (n: number) => void;
  toggleSelectDocument: (id: string) => void;
  setSelectedDocumentIds: (ids: string[]) => void;
  selectAllDocuments: () => void;
  deselectAllDocuments: () => void;
  clear: () => void;
}

export const useDocumentsStore = create<DocumentsState>()(
  persist(
    (set) => ({
      documents: [],
      activeJobs: 0,
      selectedDocumentIds: [],
      setDocuments: (documents) => set({ documents }),
      upsertDocument: (doc) =>
        set((state) => {
          const idx = state.documents.findIndex((d) => d.id === doc.id);
          if (idx >= 0) {
            const next = [...state.documents];
            next[idx] = doc;
            return { documents: next };
          }
          return { documents: [doc, ...state.documents] };
        }),
      setActiveJobs: (activeJobs) => set({ activeJobs }),
      toggleSelectDocument: (id) =>
        set((state) => {
          const isSel = state.selectedDocumentIds.includes(id);
          const next = isSel
            ? state.selectedDocumentIds.filter((x) => x !== id)
            : [...state.selectedDocumentIds, id];
          return { selectedDocumentIds: next };
        }),
      setSelectedDocumentIds: (selectedDocumentIds) => set({ selectedDocumentIds }),
      selectAllDocuments: () =>
        set((state) => {
          const completedIds = state.documents
            .filter((d) => d.status === 'COMPLETED')
            .map((d) => d.id);
          return { selectedDocumentIds: completedIds };
        }),
      deselectAllDocuments: () => set({ selectedDocumentIds: [] }),
      clear: () => set({ documents: [], activeJobs: 0, selectedDocumentIds: [] }),
    }),
    {
      name: 'graphrag-selected-documents',
      partialize: (state) => ({ selectedDocumentIds: state.selectedDocumentIds }),
    }
  )
);

