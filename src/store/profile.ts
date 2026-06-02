import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { UserProfile } from '../services/types';

interface ProfileState {
  profileOverride?: Partial<UserProfile>;
  setProfileOverride: (profile: Partial<UserProfile>) => void;
  clearProfileOverride: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      setProfileOverride: (profile) =>
        set((state) => ({
          profileOverride: {
            ...(state.profileOverride ?? {}),
            ...profile
          }
        })),
      clearProfileOverride: () => set({ profileOverride: undefined })
    }),
    {
      name: 'aieas-user-profile',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ profileOverride: state.profileOverride })
    }
  )
);

export function mergeProfile(base: UserProfile, override?: Partial<UserProfile>): UserProfile {
  return {
    ...base,
    ...(override ?? {})
  };
}
