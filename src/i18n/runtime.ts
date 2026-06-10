import { createTranslator, defaultLocale, type Locale, type MessageKey } from './messages';

let activeLocale: Locale = defaultLocale;
let activeTranslator = createTranslator(activeLocale);

export function setRuntimeLocale(locale: Locale): void {
  activeLocale = locale;
  activeTranslator = createTranslator(locale);
}

export function getRuntimeLocale(): Locale {
  return activeLocale;
}

export function t<Key extends MessageKey>(key: Key, params?: Record<string, string | number>): string {
  return activeTranslator(key, params);
}
