import type { AuctionState, AuctionStatus, LiveRoom, LiveRoomLot, MyAuctionTabKey, Order, UserAuctionRecord } from './types';

export const myAuctionTabKeys: MyAuctionTabKey[] = ['all', 'pendingBid', 'pendingPay', 'pendingShipment', 'pendingReceipt', 'completed'];

const paidDepositStatuses = new Set(['PAID', 'FROZEN', 'APPLIED', 'RELEASED', 'REFUNDED']);
const pendingBidStatuses = new Set<AuctionStatus>(['READY', 'WARMING_UP', 'RUNNING', 'EXTENDED']);
const runningLotStatuses = new Set<AuctionStatus>(['RUNNING', 'EXTENDED']);
const upcomingLotStatuses = new Set<AuctionStatus>(['READY', 'WARMING_UP']);

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
  if (!hasPaidDeposit(record)) return undefined;
  if (!record.order && pendingBidStatuses.has(record.lot.status)) return 'pendingBid';
  if (isPendingPayOrder(record.order)) return 'pendingPay';
  if (isPaidOrder(record.order) && record.order?.fulfillmentStatus === 'UNSHIPPED') return 'pendingShipment';
  if (isPaidOrder(record.order) && record.order?.fulfillmentStatus === 'SHIPPED') return 'pendingReceipt';
  if (isPaidOrder(record.order) && record.order?.fulfillmentStatus === 'RECEIVED') return 'completed';
  return 'all';
}

export function hasPaidDeposit(record: UserAuctionRecord): boolean {
  const status = record.depositStatus.trim().toUpperCase();
  return record.depositAmount > 0 || paidDepositStatuses.has(status);
}

export function selectCurrentRunningLot(room: LiveRoom, lots: LiveRoomLot[], states: Record<string, AuctionState> = {}): LiveRoomLot | undefined {
  const roomLots = lots.filter((lot) => lot.roomId === room.id);
  if (room.activeAuctionId) {
    const activeLot = roomLots.find((lot) => lot.auctionId === room.activeAuctionId);
    if (activeLot && runningLotStatuses.has(lotRuntimeStatus(activeLot, states))) return activeLot;
  }
  return roomLots.find((lot) => runningLotStatuses.has(lotRuntimeStatus(lot, states)));
}

export function selectPreviewLot(roomId: string, lots: LiveRoomLot[]): LiveRoomLot | undefined {
  const roomLots = lots.filter((lot) => lot.roomId === roomId);
  return roomLots.find((lot) => runningLotStatuses.has(lot.status)) ?? roomLots.find((lot) => upcomingLotStatuses.has(lot.status));
}

export function previewLotStatusKind(lot: LiveRoomLot): PreviewLotStatusKind {
  return runningLotStatuses.has(lot.status) ? 'running' : 'upcoming';
}

function isPendingPayOrder(order?: Order): boolean {
  if (!order) return false;
  return order.payStatus === 'UNPAID' || order.status === 'PENDING_PAY';
}

function isPaidOrder(order?: Order): boolean {
  if (!order) return false;
  return order.payStatus === 'PAID' || order.status === 'PAID';
}

function lotRuntimeStatus(lot: LiveRoomLot, states: Record<string, AuctionState>): AuctionStatus {
  return states[lot.auctionId]?.status ?? lot.status;
}
