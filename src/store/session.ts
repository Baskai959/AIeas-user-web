import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LoginResult, RefreshResult, User } from '../services/types';

interface SessionState {
  accessToken: string;
  refreshToken: string;
  user?: User;
  setSession: (session: LoginResult) => void;
  refreshAccessToken: (session: RefreshResult) => void;
  updateUser: (patch: Partial<User>) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      accessToken: '',
      refreshToken: '',
      setSession: (session) =>
        set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: session.user
        }),
      refreshAccessToken: (session) => set({ accessToken: session.accessToken }),
      updateUser: (patch) =>
        set((state) => ({
          user: state.user
            ? {
                ...state.user,
                ...patch
              }
            : undefined
        })),
      clearSession: () => set({ accessToken: '', refreshToken: '', user: undefined })
    }),
    {
      name: 'aieas-user-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user
      })
    }
  )
);
