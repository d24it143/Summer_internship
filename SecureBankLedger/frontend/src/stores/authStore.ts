/*
 * SecureBank Ledger — frontend/src/stores/authStore.ts
 * Zustand auth store with JWT persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  role: string | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, userId: string, role: string) => void;
  logout: () => void;
  updateAccessToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      role: null,
      isAuthenticated: false,

      login: (accessToken, refreshToken, userId, role) =>
        set({ accessToken, refreshToken, userId, role, isAuthenticated: true }),

      logout: () =>
        set({ accessToken: null, refreshToken: null, userId: null, role: null, isAuthenticated: false }),

      updateAccessToken: (token) => set({ accessToken: token }),
    }),
    {
      name: 'securebank-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userId: state.userId,
        role: state.role,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
