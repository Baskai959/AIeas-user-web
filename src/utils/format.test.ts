import { describe, expect, it } from 'vitest';
import { formatCountdown, formatMoney, getServerOffsetMs, getServerOffsetMsWithRtt, msUntil, shouldShowCountdownMilliseconds } from './format';

describe('format utilities', () => {
  it('formats cents as Chinese yuan', () => {
    expect(formatMoney(5600)).toBe('¥56.00');
    expect(formatMoney(0)).toBe('¥0.00');
  });

  it('formats countdown as mm:ss', () => {
    expect(formatCountdown(125_000)).toBe('02:05');
    expect(formatCountdown(-10)).toBe('00:00');
  });

  it('appends milliseconds only under ten seconds when requested', () => {
    expect(formatCountdown(10_000, { milliseconds: true })).toBe('00:10');
    expect(formatCountdown(9_999, { milliseconds: true })).toBe('00:09.999');
    expect(formatCountdown(9_050, { milliseconds: true })).toBe('00:09.050');
    expect(formatCountdown(9_999)).toBe('00:09');
    expect(shouldShowCountdownMilliseconds(10_000)).toBe(false);
    expect(shouldShowCountdownMilliseconds(9_999)).toBe(true);
  });

  it('calculates server clock offset and remaining time', () => {
    expect(getServerOffsetMs(1_500, 1_000)).toBe(500);
    expect(getServerOffsetMsWithRtt({ serverTimeMs: 1_500, clientSendTimeMs: 900, clientReceiveTimeMs: 1_100 })).toBe(500);
    expect(msUntil(2_500, 1_000, 500)).toBe(1_000);
  });
});
