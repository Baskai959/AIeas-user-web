import type { AuctionState, AuctionStatus, LiveRoom, LiveRoomLot, MyAuctionTabKey, Order, UserAuctionRecord } from './types';

export const myAuctionTabKeys: MyAuctionTabKey[] = ['all', 'pendingBid', 'pendingPay', 'pendingShipment', 'pendingReceipt', 'completed'];

const paidDepositStatuses = new Set(['PAID', 'FROZEN', 'APPLIED', 'CAPTURED', 'RELEASED', 'REFUNDED']);
const pendingBidStatuses = new Set<AuctionStatus>(['READY', 'WARMING_UP', 'RUNNING', 'EXTENDED']);
const activeLotStatuses = new Set<AuctionStatus>(['RUNNING', 'EXTENDED', 'HAMMER_PENDING']);
const upcomingLotStatuses = new Set<AuctionStatus>(['READY', 'WARMING_UP']);
const closedOrderStatuses = new Set(['TIMEOUT', 'TIMED_OUT', 'CANCELLED', 'CANCELED', 'CLOSED', 'EXPIRED', 'PAY_TIMEOUT', 'PAYMENT_TIMEOUT']);
const closedPayStatuses = new Set(['TIMEOUT', 'TIMED_OUT', 'CANCELLED', 'CANCELED', 'CLOSED', 'EXPIRED', 'FAILED']);

export type PreviewLotStatusKind = 'running' | 'upcoming';

export function groupAuctionRecords(records: UserAuctionRecord[]): Record<MyAuctionTabKey, UserAuctionRecord[]> {
  const grouped: Record<MyAuctionTabKey, UserAuctionRecord[]> = {
    all: [],
    pendingBid: [],
    pendingPay: [],
    pendingShipment: [],
    pendingReceipt: [],
    completed: []
  };

  records.forEach((record) => {
    const tab = classifyAuctionRecord(record);
    if (!tab) return;
    grouped.all.push(record);
    if (tab !== 'all') grouped[tab].push(record);
  });

  return grouped;
}

export function classifyAuctionRecord(record: UserAuctionRecord): MyAuctionTabKey | undefined {
  if (!record.order && !hasPaidDeposit(record)) return undefined;
  if (!record.order && pendingBidStatuses.has(record.lot.status)) return 'pendingBid';
  if (isPendingPayOrder(record.order)) return 'pendingPay';
  if (isPaidOrder(record.order) && record.order?.fulfillmentStatus === 'UNSHIPPED') return 'pendingShipment';
  if (isPaidOrder(record.order) && record.order?.fulfillmentStatus === 'SHIPPED') return 'pendingReceipt';
  if (isPaidOrder(record.order) && record.order?.fulfillmentStatus === 'RECEIVED') return 'completed';
  return 'all';
}

export function hasPaidDeposit(record: UserAuctionRecord): boolean {
  const status = record.depositStatus.trim().toUpperCase();
  if (record.depositAmount > 0 || paidDepositStatuses.has(status)) return true;
  return hasZeroDepositEnrollment(record);
}

export function hasZeroDepositEnrollment(record: UserAuctionRecord): boolean {
  return record.depositAmount === 0 && (record.lot.depositAmount ?? 0) === 0 && record.depositStatus.trim().toUpperCase() === 'READY';
}

export function selectCurrentRunningLot(room: LiveRoom, lots: LiveRoomLot[], states: Record<string, AuctionState> = {}): LiveRoomLot | undefined {
  const roomLots = lots.filter((lot) => lot.roomId === room.id);
  if (room.activeAuctionId) {
    const activeLot = roomLots.find((lot) => lot.auctionId === room.activeAuctionId);
    if (activeLot && activeLotStatuses.has(lotRuntimeStatus(activeLot, states))) return activeLot;
  }
  return roomLots.find((lot) => activeLotStatuses.has(lotRuntimeStatus(lot, states)));
}

export function selectPreviewLot(roomId: string, lots: LiveRoomLot[]): LiveRoomLot | undefined {
  const roomLots = lots.filter((lot) => lot.roomId === roomId);
  return roomLots.find((lot) => activeLotStatuses.has(lot.status)) ?? roomLots.find((lot) => upcomingLotStatuses.has(lot.status));
}

export function previewLotStatusKind(lot: LiveRoomLot): PreviewLotStatusKind {
  return activeLotStatuses.has(lot.status) ? 'running' : 'upcoming';
}

function isPendingPayOrder(order?: Order): boolean {
  if (!order) return false;
  if (isClosedOrder(order)) return false;
  const status = normalizeOrderState(order.status);
  const payStatus = normalizeOrderState(order.payStatus);
  return payStatus === 'UNPAID' || payStatus === 'PENDING' || status === 'PENDING_PAY' || status === 'PENDING_PAYMENT' || status === 'DEAL' || status === 'CREATED';
}

function isPaidOrder(order?: Order): boolean {
  if (!order) return false;
  return normalizeOrderState(order.payStatus) === 'PAID' || normalizeOrderState(order.status) === 'PAID';
}

function isClosedOrder(order?: Order): boolean {
  if (!order) return false;
  return closedOrderStatuses.has(normalizeOrderState(order.status)) || closedPayStatuses.has(normalizeOrderState(order.payStatus));
}

function normalizeOrderState(value?: string): string {
  return String(value ?? '').trim().toUpperCase();
}

function lotRuntimeStatus(lot: LiveRoomLot, states: Record<string, AuctionState>): AuctionStatus {
  return states[lot.auctionId]?.status ?? lot.status;
}
