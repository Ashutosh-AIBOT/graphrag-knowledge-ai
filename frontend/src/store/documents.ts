import { create } from 'zustand';

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
}

interface DocumentsState {
  documents: DocumentItem[];
  activeJobs: number;
  setDocuments: (docs: DocumentItem[]) => void;
  upsertDocument: (doc: DocumentItem) => void;
  setActiveJobs: (n: number) => void;
}

export const useDocumentsStore = create<DocumentsState>((set) => ({
  documents: [],
  activeJobs: 0,
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
}));
