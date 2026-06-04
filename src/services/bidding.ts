export interface BidRuleInput {
  currentPrice: number;
  minIncrement: number;
  startPrice?: number;
  capPrice?: number;
  minBidIntervalMs?: number;
}

export interface BidPlacePayload {
  auctionId: string;
  price: number;
  expectedCurrentPrice: number;
  requestId?: string;
}

export type BidValidationResult =
  | { valid: true; price: number }
  | { valid: false; reason: 'invalidAmount' }
  | { valid: false; reason: 'belowMinimum'; minPrice: number }
  | { valid: false; reason: 'invalidStep'; step: number }
  | { valid: false; reason: 'aboveCap'; capPrice: number };

export const QUICK_BID_MAX_STEPS = 3;
export const DEFAULT_MIN_BID_INTERVAL_MS = 1000;

export function getNextBidPrice(rule: BidRuleInput): number {
  const nextPrice = rule.currentPrice + rule.minIncrement;
  if (rule.capPrice !== undefined && rule.capPrice > rule.currentPrice && nextPrice > rule.capPrice) {
    return rule.capPrice;
  }
  return nextPrice;
}

export function parseBidAmountToCents(input: string): number | undefined {
  const normalized = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const [yuan, cents = ''] = normalized.split('.');
  return Number(yuan) * 100 + Number(cents.padEnd(2, '0'));
}

export function formatBidAmountInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function validateBidPrice(price: number | undefined, rule: BidRuleInput): BidValidationResult {
  if (price === undefined || !Number.isFinite(price) || price <= 0) {
    return { valid: false, reason: 'invalidAmount' };
  }

  const minPrice = getNextBidPrice(rule);
  if (price < minPrice) {
    return { valid: false, reason: 'belowMinimum', minPrice };
  }

  if (rule.capPrice !== undefined && price > rule.capPrice) {
    return { valid: false, reason: 'aboveCap', capPrice: rule.capPrice };
  }

  if (rule.capPrice !== undefined && price === rule.capPrice && rule.capPrice > rule.currentPrice) {
    return { valid: true, price };
  }

  if ((price - rule.currentPrice) % rule.minIncrement !== 0) {
    return { valid: false, reason: 'invalidStep', step: rule.minIncrement };
  }

  return { valid: true, price };
}

export function getQuickBidPrice(rule: BidRuleInput, stepCount: number): number {
  const steps = Math.max(1, Math.min(QUICK_BID_MAX_STEPS, Math.floor(stepCount)));
  const nextPrice = rule.currentPrice + rule.minIncrement * steps;
  if (rule.capPrice !== undefined && rule.capPrice > rule.currentPrice) {
    return Math.min(nextPrice, rule.capPrice);
  }
  return nextPrice;
}

export function getMinBidIntervalMs(rule: BidRuleInput): number {
  return rule.minBidIntervalMs && rule.minBidIntervalMs > 0 ? rule.minBidIntervalMs : DEFAULT_MIN_BID_INTERVAL_MS;
}

export function getQuickBidIntervalRemainingMs(lastBidAtMs: number | undefined, nowMs: number, minBidIntervalMs: number): number {
  if (!lastBidAtMs) return 0;
  return Math.max(0, minBidIntervalMs - (nowMs - lastBidAtMs));
}

export function isQuickBidOutdated(price: number | undefined, rule: BidRuleInput): boolean {
  return price === undefined || price <= rule.currentPrice;
}

export function buildBidPlacePayload(input: BidPlacePayload): BidPlacePayload {
  return {
    auctionId: input.auctionId,
    price: input.price,
    expectedCurrentPrice: input.expectedCurrentPrice,
    requestId: input.requestId
  };
}
