import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LoginResult, User } from '../services/types';

interface SessionState {
  accessToken: string;
  refreshToken: string;
  user?: User;
  setSession: (session: LoginResult) => void;
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
