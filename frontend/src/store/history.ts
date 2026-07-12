import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface HistoryItem {
  id: string;
  query_text: string;
  retrieval_mode: string;
  answer_text: string;
  answer_preview?: string;
  response_time: number;
  created_at: string;
}

interface HistoryState {
  items: HistoryItem[];
  loaded: boolean;
  setItems: (items: HistoryItem[]) => void;
  addItem: (item: HistoryItem) => void;
  clear: () => void;
  resetLoaded: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      items: [],
      loaded: false,
      setItems: (items) => set({ items, loaded: true }),
      addItem: (item) =>
        set((state) => ({ items: [item, ...state.items].slice(0, 50), loaded: true })),
      clear: () => set({ items: [], loaded: false }),
      resetLoaded: () => set({ loaded: false }),
    }),
    {
      name: 'graphrag-query-history',
    }
  )
);
