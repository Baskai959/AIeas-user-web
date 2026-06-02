import { beforeEach, describe, expect, it } from 'vitest';
import { defaultLocale } from '../i18n/messages';
import { normalizeLocale, usePreferencesStore } from './preferences';

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferencesStore.getState().resetPreferences();
  });

  it('uses Simplified Chinese by default', () => {
    expect(usePreferencesStore.getState().locale).toBe(defaultLocale);
  });

  it('persists the selected locale locally', () => {
    usePreferencesStore.getState().setLocale('en-US');

    expect(usePreferencesStore.getState().locale).toBe('en-US');
    const persisted = JSON.parse(localStorage.getItem('aieas-user-preferences') ?? '{}') as {
      state?: { locale?: string };
    };
    expect(persisted.state?.locale).toBe('en-US');
  });

  it('normalizes invalid locales to the default locale', () => {
    expect(normalizeLocale('fr-FR')).toBe(defaultLocale);

    usePreferencesStore.getState().setLocale('fr-FR');
    expect(usePreferencesStore.getState().locale).toBe(defaultLocale);
  });
});
