import { t } from '../../i18n/runtime';

export function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    if (text) return text;
  }
  return undefined;
}

export function rankingBidderFallbackName(bidderId: string): string {
  const suffix = bidderId.replace(/[^\p{L}\p{N}]/gu, '').slice(-2).toUpperCase();
  return suffix ? `用户*${suffix}` : t('common.demoUser');
}
