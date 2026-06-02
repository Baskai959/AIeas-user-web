import { describe, expect, it } from 'vitest';
import { defaultLocale, getMessage, locales, messages } from './messages';

describe('messages', () => {
  it('keeps zh-CN and en-US keys aligned', () => {
    expect(Object.keys(messages['zh-CN']).sort()).toEqual(Object.keys(messages['en-US']).sort());
  });

  it('uses Simplified Chinese as the default locale', () => {
    expect(defaultLocale).toBe('zh-CN');
    expect(locales).toContain('en-US');
  });

  it('returns a localized message by key', () => {
    expect(getMessage('app.title')).toBe('实时竞拍大师');
    expect(getMessage('app.title', 'en-US')).toBe('Live Auction Master');
  });
});
