import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { defaultLocale, locales, type Locale } from '../i18n/messages';

interface PreferencesState {
  locale: Locale;
  setLocale: (locale: string) => void;
  resetPreferences: () => void;
}

const localeSet = new Set<string>(locales);

export function normalizeLocale(locale: string | undefined): Locale {
  return locale && localeSet.has(locale) ? (locale as Locale) : defaultLocale;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: defaultLocale,
      setLocale: (locale) => set({ locale: normalizeLocale(locale) }),
      resetPreferences: () => set({ locale: defaultLocale })
    }),
    {
      name: 'aieas-user-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ locale: state.locale }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<PreferencesState> | undefined;
        return {
          ...current,
          locale: normalizeLocale(persistedState?.locale)
        };
      }
    }
  )
);
