import type { RankingItem } from '../../services/types';
import { rankingBidderFallbackName } from './shared';

const rankingBidAnimationDurationMs = 500;
const rankingSelfBidAnimationDurationMs = 1000;

export type RankingBidHint = {
  auctionId: string;
  bidderId: string;
  price: number;
  bidTsMs: number;
};

export type RankingAnimationSource = 'initial' | 'bid.accepted' | 'snapshot';
export type RankingAnimationKind = 'top-slot-to-first' | 'divider-to-first' | 'current-row-to-first' | 'price-only';
type RankingAnimationOrigin = 'top-slot' | 'divider' | 'current-row' | 'price';

export type RankingAnimation = {
  id: string;
  kind: RankingAnimationKind;
  origin: RankingAnimationOrigin;
  bidderId: string;
  fromRank?: number;
  toRank: 1;
  isSelfBid: boolean;
  durationMs: number;
  movingItem: RankingItem;
  exitItem?: RankingItem;
  shiftedIds: string[];
  enteringIds: string[];
  exitingIds: string[];
  priceUpdateIds: string[];
};

export function sortRankingItems(items: RankingItem[]): RankingItem[] {
  return [...items].sort((a, b) => a.rank - b.rank || b.price - a.price || b.bidTsMs - a.bidTsMs);
}

export function buildRankingAnimation(previousItems: RankingItem[], nextItems: RankingItem[], userId: string, lastBid?: RankingBidHint): RankingAnimation | undefined {
  if (!previousItems.length || !nextItems.length || rankingItemsEqual(previousItems, nextItems)) return undefined;
  const previousByBidder = new Map(previousItems.map((item) => [item.bidderId, item]));
  const nextByBidder = new Map(nextItems.map((item) => [item.bidderId, item]));
  const bidderId = resolveRankingAnimationBidder(previousItems, nextItems, lastBid);
  if (!bidderId) return undefined;
  const nextBidderItem = nextByBidder.get(bidderId);
  const previousBidderItem = previousByBidder.get(bidderId);
  const fallbackMovingItem: RankingItem = previousBidderItem ?? {
    rank: 1,
    bidderId,
    nicknameMask: rankingBidderFallbackName(bidderId),
    price: lastBid?.price ?? 0,
    bidTsMs: lastBid?.bidTsMs ?? Date.now()
  };
  const movingItem: RankingItem = nextBidderItem ?? {
    ...fallbackMovingItem,
    rank: 1,
    price: lastBid?.price ?? fallbackMovingItem.price
  };
  const previousTopIds = topRankingIds(previousItems);
  const nextTopIds = topRankingIds(nextItems);
  const shiftedIds = nextTopIds.filter((id) => id !== bidderId && previousByBidder.has(id) && (previousByBidder.get(id)?.rank ?? 0) < (nextByBidder.get(id)?.rank ?? 0));
  const enteringIds = nextTopIds.filter((id) => !previousTopIds.includes(id));
  const exitingIds = previousTopIds.filter((id) => !nextTopIds.includes(id));
  const previousRank = previousBidderItem?.rank;
  const nextRank = nextBidderItem?.rank;
  const rankChanged = previousRank !== undefined && nextRank !== undefined && previousRank !== nextRank;
  const membershipChanged = enteringIds.length > 0 || exitingIds.length > 0;
  const priceChanged = nextBidderItem && previousBidderItem && nextBidderItem.price !== previousBidderItem.price;
  const isSelfBid = bidderId === userId;
  const movesToFirst = nextRank === 1 && (rankChanged || membershipChanged);
  const kind: RankingAnimationKind = movesToFirst
    ? previousRank !== undefined && previousRank <= 8
      ? 'top-slot-to-first'
      : isSelfBid
        ? 'current-row-to-first'
        : 'divider-to-first'
    : 'price-only';
  if (kind === 'price-only' && !priceChanged) return undefined;
  const exitItem = kind !== 'price-only' ? sortRankingItems(previousItems).find((item) => exitingIds.includes(item.bidderId) && item.bidderId !== bidderId) : undefined;
  return {
    id: `${bidderId}-${movingItem.bidTsMs}-${movingItem.price}`,
    kind,
    origin: rankingAnimationOrigin(kind),
    bidderId,
    fromRank: previousRank,
    toRank: 1,
    isSelfBid,
    durationMs: isSelfBid && kind !== 'price-only' ? rankingSelfBidAnimationDurationMs : rankingBidAnimationDurationMs,
    movingItem,
    exitItem,
    shiftedIds,
    enteringIds,
    exitingIds,
    priceUpdateIds: kind === 'price-only' ? [bidderId] : []
  };
}

function rankingAnimationOrigin(kind: RankingAnimationKind): RankingAnimationOrigin {
  if (kind === 'top-slot-to-first') return 'top-slot';
  if (kind === 'divider-to-first') return 'divider';
  if (kind === 'current-row-to-first') return 'current-row';
  return 'price';
}

function resolveRankingAnimationBidder(previousItems: RankingItem[], nextItems: RankingItem[], lastBid?: RankingBidHint): string | undefined {
  if (lastBid?.bidderId && nextItems.some((item) => item.bidderId === lastBid.bidderId)) return lastBid.bidderId;
  const previousByBidder = new Map(previousItems.map((item) => [item.bidderId, item]));
  return sortRankingItems(nextItems).find((item) => {
    const previous = previousByBidder.get(item.bidderId);
    return previous && (item.price > previous.price || item.rank < previous.rank);
  })?.bidderId;
}

function topRankingIds(items: RankingItem[]): string[] {
  return sortRankingItems(items)
    .slice(0, 8)
    .map((item) => item.bidderId);
}

function rankingItemsEqual(previousItems: RankingItem[], nextItems: RankingItem[]): boolean {
  if (previousItems.length !== nextItems.length) return false;
  return previousItems.every((previousItem, index) => {
    const nextItem = nextItems[index];
    return nextItem && previousItem.rank === nextItem.rank && previousItem.bidderId === nextItem.bidderId && previousItem.price === nextItem.price && previousItem.bidTsMs === nextItem.bidTsMs && previousItem.avatarUrl === nextItem.avatarUrl;
  });
}
