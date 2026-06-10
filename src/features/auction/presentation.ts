import type { MessageKey } from '../../i18n/messages';
import { getRuntimeLocale, t } from '../../i18n/runtime';
import type { AuctionState, LiveRoom, LiveRoomLot, RankingItem } from '../../services/types';

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(getRuntimeLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatDate(value?: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(getRuntimeLocale(), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function formatDateMs(value: number): string {
  return new Intl.DateTimeFormat(getRuntimeLocale(), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function stateFromLot(lot: LiveRoomLot): AuctionState {
  return {
    auctionId: lot.auctionId,
    status: lot.status,
    currentPrice: lot.currentPrice,
    leaderBidderId: lot.leaderBidderId,
    bidCount: lot.bidCount,
    participantCount: lot.participantCount,
    endTsMs: lot.endTsMs,
    serverTsMs: Date.now()
  };
}

function finiteParticipantCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function finiteOptionalParticipantCount(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

export function participantCountForLot(lot: LiveRoomLot, state?: AuctionState): number {
  return Math.max(finiteParticipantCount(lot.participantCount), finiteParticipantCount(state?.participantCount));
}

function isUpcomingAuctionStatus(status: AuctionState['status']): boolean {
  return status === 'DRAFT' || status === 'PENDING_AUDIT' || status === 'READY' || status === 'WARMING_UP';
}

function isValidScheduledStartMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function priceLabel(lot: LiveRoomLot, state: AuctionState): string {
  if (state.status === 'CLOSED_WON' || state.status === 'SETTLED' || state.status === 'HAMMER_PENDING') return t('auction.finalPriceLabel');
  if (state.currentPrice > lot.startPrice || (state.bidCount ?? lot.bidCount ?? 0) > 0) return t('auction.currentPriceLabel');
  return t('auction.startPriceLabel');
}

export function priceValue(lot: LiveRoomLot, state: AuctionState): number {
  if (state.status === 'CLOSED_WON' || state.status === 'SETTLED' || state.status === 'HAMMER_PENDING') {
    return lot.finalPrice ?? state.currentPrice;
  }
  return state.currentPrice > 0 ? state.currentPrice : lot.startPrice;
}

export function scheduledStartText(lot: LiveRoomLot, state: AuctionState = stateFromLot(lot)): string | undefined {
  if (!isUpcomingAuctionStatus(state.status)) return undefined;
  if (!isValidScheduledStartMs(lot.startTsMs)) return undefined;
  return t('auction.scheduledStartAt', { time: formatDateMs(lot.startTsMs) });
}

export function scheduledStartTimeText(lot: LiveRoomLot, state: AuctionState = stateFromLot(lot)): string | undefined {
  if (!isUpcomingAuctionStatus(state.status)) return undefined;
  if (!isValidScheduledStartMs(lot.startTsMs)) return undefined;
  return formatDateMs(lot.startTsMs);
}

export function statusLabel(status: LiveRoom['status']): string {
  if (status === 'LIVE') return t('home.liveNow');
  if (status === 'DRAFT' || status === 'SCHEDULED') return t('auction.upcoming');
  return t('auction.closed');
}

export function lotStatusLabel(status: AuctionState['status']): string {
  const keys: Record<AuctionState['status'], MessageKey> = {
    DRAFT: 'auction.upcoming',
    PENDING_AUDIT: 'auction.upcoming',
    AUDIT_REJECTED: 'auction.closedFailed',
    READY: 'auction.upcoming',
    WARMING_UP: 'auction.upcoming',
    RUNNING: 'auction.running',
    EXTENDED: 'auction.running',
    HAMMER_PENDING: 'auction.hammerInProgress',
    CLOSED_WON: 'auction.closedWon',
    CLOSED_FAILED: 'auction.closedFailed',
    SETTLED: 'auction.settled'
  };
  return t(keys[status]);
}

export function defaultRanking(state: AuctionState): RankingItem[] {
  if (!state.leaderBidderId) return [];
  return [
    {
      rank: 1,
      bidderId: state.leaderBidderId,
      nicknameMask: t('common.demoUser'),
      price: state.currentPrice,
      bidTsMs: Date.now()
    }
  ];
}
