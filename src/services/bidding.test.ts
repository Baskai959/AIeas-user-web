import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIN_BID_INTERVAL_MS,
  QUICK_BID_MAX_STEPS,
  buildBidPlacePayload,
  formatBidAmountInput,
  getMinBidIntervalMs,
  getNextBidPrice,
  getQuickBidIntervalRemainingMs,
  getQuickBidPrice,
  isQuickBidOutdated,
  parseBidAmountToCents,
  validateBidPrice
} from './bidding';

describe('bidding helpers', () => {
  it('parses yuan input to integer cents', () => {
    expect(parseBidAmountToCents('58')).toBe(5800);
    expect(parseBidAmountToCents('58.25')).toBe(5825);
    expect(parseBidAmountToCents('abc')).toBeUndefined();
  });

  it('validates manual bids against minimum price, increment step, and cap price', () => {
    const rule = { currentPrice: 5600, minIncrement: 100, startPrice: 0, capPrice: 8800 };

    expect(getNextBidPrice(rule)).toBe(5700);
    expect(validateBidPrice(5650, rule)).toEqual({ valid: false, reason: 'belowMinimum', minPrice: 5700 });
    expect(validateBidPrice(5750, rule)).toEqual({ valid: false, reason: 'invalidStep', step: 100 });
    expect(validateBidPrice(8900, rule)).toEqual({ valid: false, reason: 'aboveCap', capPrice: 8800 });
    expect(validateBidPrice(5800, rule)).toEqual({ valid: true, price: 5800 });
  });

  it('builds bid.place payload with expected current price', () => {
    expect(buildBidPlacePayload({ auctionId: '1001', price: 5800, expectedCurrentPrice: 5600 })).toEqual({
      auctionId: '1001',
      price: 5800,
      expectedCurrentPrice: 5600
    });
  });

  it('formats cents for manual amount input', () => {
    expect(formatBidAmountInput(5700)).toBe('57.00');
  });

  it('calculates quick bid steps with a three-step cap and cap-price clamp', () => {
    const rule = { currentPrice: 85000, minIncrement: 5000, capPrice: 93000 };

    expect(QUICK_BID_MAX_STEPS).toBe(3);
    expect(getQuickBidPrice(rule, 1)).toBe(90000);
    expect(getQuickBidPrice(rule, 2)).toBe(93000);
    expect(getQuickBidPrice(rule, 4)).toBe(93000);
    expect(validateBidPrice(93000, rule)).toEqual({ valid: true, price: 93000 });
  });

  it('uses the default minimum bid interval and reports cooldown remaining time', () => {
    expect(getMinBidIntervalMs({ currentPrice: 1000, minIncrement: 100 })).toBe(DEFAULT_MIN_BID_INTERVAL_MS);
    expect(getMinBidIntervalMs({ currentPrice: 1000, minIncrement: 100, minBidIntervalMs: 1600 })).toBe(1600);
    expect(getQuickBidIntervalRemainingMs(1000, 1400, 1000)).toBe(600);
    expect(getQuickBidIntervalRemainingMs(1000, 2100, 1000)).toBe(0);
  });

  it('marks a selected quick bid as outdated once it no longer exceeds the current price', () => {
    expect(isQuickBidOutdated(150200, { currentPrice: 150100, minIncrement: 100 })).toBe(false);
    expect(isQuickBidOutdated(150200, { currentPrice: 150200, minIncrement: 100 })).toBe(true);
  });
});
