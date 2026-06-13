import { describe, expect, it } from 'vitest';
import { bidRuleFromLot, minBidIntervalMsForLot, minIncrementForLot } from './bidRules';
import type { AuctionState, LiveRoomLot } from '../../services/types';

const baseLot: LiveRoomLot = {
  id: 'lot_1',
  auctionId: 'auc_1',
  roomId: 'room_1',
  title: 'Test lot',
  status: 'RUNNING',
  startPrice: 1000,
  currentPrice: 1500,
  endTsMs: 1_000_000,
  ruleSnapshot: {
    capPrice: 5000,
    minBidIntervalMs: 1800,
    incrementRule: {
      type: 'fixed',
      amount: 100,
      maxBidSteps: 2
    }
  }
};

const baseState: AuctionState = {
  auctionId: 'auc_1',
  status: 'RUNNING',
  currentPrice: 1500,
  endTsMs: 1_000_000,
  serverTsMs: 900_000
};

describe('bidRules', () => {
  it('forwards the lot minBidIntervalMs into the quick-bid rule', () => {
    expect(minBidIntervalMsForLot(baseLot)).toBe(1800);
    expect(bidRuleFromLot(baseLot, baseState)).toMatchObject({
      currentPrice: 1500,
      minIncrement: 100,
      capPrice: 5000,
      maxBidSteps: 2,
      minBidIntervalMs: 1800
    });
  });

  it('supports ladder increment rules based on the current price', () => {
    const ladderLot: LiveRoomLot = {
      ...baseLot,
      ruleSnapshot: {
        incrementRule: {
          type: 'ladder',
          maxBidSteps: 3,
          steps: [
            { min: 0, max: 2000, amount: 100 },
            { min: 2000, amount: 300 }
          ]
        }
      }
    };

    expect(minIncrementForLot(ladderLot, { ...baseState, currentPrice: 1500 })).toBe(100);
    expect(minIncrementForLot(ladderLot, { ...baseState, currentPrice: 2500 })).toBe(300);
  });

  it('supports fixed increment rules by using the configured amount', () => {
    expect(minIncrementForLot(baseLot, baseState)).toBe(100);
  });
});
