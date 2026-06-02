import { describe, expect, it } from 'vitest';
import { formatCountdown, formatMoney, getServerOffsetMs, msUntil } from './format';

describe('format utilities', () => {
  it('formats cents as Chinese yuan', () => {
    expect(formatMoney(5600)).toBe('¥56.00');
    expect(formatMoney(0)).toBe('¥0.00');
  });

  it('formats countdown as mm:ss', () => {
    expect(formatCountdown(125_000)).toBe('02:05');
    expect(formatCountdown(-10)).toBe('00:00');
  });

  it('calculates server clock offset and remaining time', () => {
    expect(getServerOffsetMs(1_500, 1_000)).toBe(500);
    expect(msUntil(2_500, 1_000, 500)).toBe(1_000);
  });
});
