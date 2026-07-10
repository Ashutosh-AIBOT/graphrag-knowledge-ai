import { create } from 'zustand';

export interface HistoryItem {
  id: string;
  query_text: string;
  retrieval_mode: string;
  answer_text: string;
  response_time: number;
  created_at: string;
}

interface HistoryState {
  items: HistoryItem[];
  loaded: boolean;
  setItems: (items: HistoryItem[]) => void;
  addItem: (item: HistoryItem) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  items: [],
  loaded: false,
  setItems: (items) => set({ items, loaded: true }),
  addItem: (item) =>
    set((state) => ({ items: [item, ...state.items].slice(0, 50) })),
  clear: () => set({ items: [], loaded: false }),
}));
