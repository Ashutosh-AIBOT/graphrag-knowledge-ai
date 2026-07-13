import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useHistoryStore } from './history';
import { useDocumentsStore } from './documents';

interface User {
  id: number;
  username: string;
  email: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, access: string, refresh: string) => void;
  setTokens: (access: string, refresh?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, access, refresh) =>
        set({ user, accessToken: access, refreshToken: refresh, isAuthenticated: true }),
      setTokens: (access, refresh) =>
        set((state) => ({
          accessToken: access,
          refreshToken: refresh ?? state.refreshToken,
        })),
      logout: () => {
        // Clear query history and selected documents
        useHistoryStore.getState().clear();
        useDocumentsStore.getState().clear();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('graphrag-last-session');
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    { name: 'graphrag-auth' }
  )
);
