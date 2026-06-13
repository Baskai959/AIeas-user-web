import type { AuctionState, LiveRoomLot } from '../../services/types';
import type { BidRuleInput } from '../../services/bidding';

export function bidRuleFromLot(lot: LiveRoomLot, state: AuctionState): BidRuleInput {
  return {
    currentPrice: state.currentPrice,
    minIncrement: minIncrementForLot(lot, state),
    startPrice: lot.startPrice,
    capPrice: capPriceForLot(lot),
    maxBidSteps: maxBidStepsForLot(lot),
    minBidIntervalMs: minBidIntervalMsForLot(lot)
  };
}

export function minIncrementForLot(lot: LiveRoomLot, state: AuctionState): number {
  const rule = lot.ruleSnapshot?.incrementRule;
  if (!rule) return 100;
  if (rule.type === 'fixed' && typeof rule.amount === 'number' && rule.amount > 0) return rule.amount;
  if (rule.type === 'ladder' && Array.isArray(rule.steps)) {
    const step = rule.steps.find((item) => {
      const min = Number(item.min);
      const max = item.max === undefined ? undefined : Number(item.max);
      return state.currentPrice >= min && (max === undefined || state.currentPrice < max);
    });
    if (step && Number(step.amount) > 0) return Number(step.amount);
  }
  return 100;
}

export function capPriceForLot(lot: LiveRoomLot): number | undefined {
  const capPrice = lot.ruleSnapshot?.capPrice;
  return typeof capPrice === 'number' && capPrice > 0 ? capPrice : undefined;
}

export function maxBidStepsForLot(lot: LiveRoomLot): number | undefined {
  const maxBidSteps = Number(lot.ruleSnapshot?.incrementRule?.maxBidSteps);
  return Number.isFinite(maxBidSteps) && maxBidSteps > 0 ? Math.floor(maxBidSteps) : undefined;
}

export function minBidIntervalMsForLot(lot: LiveRoomLot): number | undefined {
  const minBidIntervalMs = Number(lot.ruleSnapshot?.minBidIntervalMs);
  return Number.isFinite(minBidIntervalMs) && minBidIntervalMs > 0 ? Math.floor(minBidIntervalMs) : undefined;
}
