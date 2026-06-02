import { describe, expect, it } from 'vitest';
import { previewLotStatusKind, selectCurrentRunningLot, selectPreviewLot, groupAuctionRecords } from './auctionViews';
import type { LiveRoom, LiveRoomLot, Order, UserAuctionRecord } from './types';

const baseLot: LiveRoomLot = {
  id: 'lot_base',
  auctionId: 'auction_base',
  roomId: 'room_1',
  title: 'Base Lot',
  status: 'UPCOMING',
  startPrice: 1000,
  currentPrice: 1000,
  endTsMs: 1
};

function lot(id: string, status: LiveRoomLot['status']): LiveRoomLot {
  return {
    ...baseLot,
    id,
    auctionId: `auction_${id}`,
    status
  };
}

describe('auction view helpers', () => {
  it('groups my auction records by deposit, auction, payment, and fulfillment state', () => {
    const records = [
      record('pending_bid_upcoming', 'UPCOMING'),
      record('pending_bid_running', 'RUNNING'),
      record('lost_only_all', 'CLOSED_FAILED', { depositStatus: 'RELEASED' }),
      record('pending_pay', 'CLOSED_WON', { order: order('pending_pay', 'PENDING_PAY', 'UNPAID') }),
      record('pending_shipment', 'CLOSED_WON', { order: order('pending_shipment', 'PAID', 'PAID', 'UNSHIPPED') }),
      record('pending_receipt', 'SETTLED', { order: order('pending_receipt', 'PAID', 'PAID', 'SHIPPED') }),
      record('completed', 'SETTLED', { order: order('completed', 'PAID', 'PAID', 'RECEIVED') }),
      record('no_deposit_ignored', 'RUNNING', { depositAmount: 0, depositStatus: '' })
    ];

    const grouped = groupAuctionRecords(records);

    expect(grouped.all.map((item) => item.id)).toEqual([
      'pending_bid_upcoming',
      'pending_bid_running',
      'lost_only_all',
      'pending_pay',
      'pending_shipment',
      'pending_receipt',
      'completed'
    ]);
    expect(grouped.pendingBid.map((item) => item.id)).toEqual(['pending_bid_upcoming', 'pending_bid_running']);
    expect(grouped.pendingPay.map((item) => item.id)).toEqual(['pending_pay']);
    expect(grouped.pendingShipment.map((item) => item.id)).toEqual(['pending_shipment']);
    expect(grouped.pendingReceipt.map((item) => item.id)).toEqual(['pending_receipt']);
    expect(grouped.completed.map((item) => item.id)).toEqual(['completed']);
  });

  it('selects one current running lot for the live room and respects runtime state', () => {
    const room: LiveRoom = {
      id: 'room_1',
      title: 'Room',
      merchantName: 'Merchant',
      status: 'LIVE',
      onlineCount: 10,
      watcherCount: 99,
      activeAuctionId: 'auction_preferred'
    };
    const lots = [lot('fallback', 'RUNNING'), lot('preferred', 'UPCOMING'), lot('other_room', 'RUNNING')].map((item) =>
      item.id === 'lot_other_room' ? { ...item, roomId: 'room_2' } : item
    );

    expect(selectCurrentRunningLot(room, lots)?.id).toBe('fallback');
    expect(
      selectCurrentRunningLot(room, lots, {
        auction_preferred: { auctionId: 'auction_preferred', status: 'RUNNING', currentPrice: 1000, endTsMs: 1, serverTsMs: 1 }
      })?.id
    ).toBe('preferred');
    expect(selectCurrentRunningLot({ ...room, id: 'room_3', activeAuctionId: undefined }, lots)).toBeUndefined();
  });

  it('selects preview lots with running first, upcoming fallback, and no ended fallback', () => {
    const running = lot('running', 'RUNNING');
    const upcoming = lot('upcoming', 'UPCOMING');
    const ended = lot('ended', 'CLOSED_WON');

    expect(selectPreviewLot('room_1', [upcoming, running])?.id).toBe('running');
    expect(previewLotStatusKind(running)).toBe('running');
    expect(selectPreviewLot('room_1', [ended, upcoming])?.id).toBe('upcoming');
    expect(previewLotStatusKind(upcoming)).toBe('upcoming');
    expect(selectPreviewLot('room_1', [ended])).toBeUndefined();
  });
});

function record(
  id: string,
  lotStatus: LiveRoomLot['status'],
  options: {
    depositAmount?: number;
    depositStatus?: string;
    order?: Order;
  } = {}
): UserAuctionRecord {
  return {
    id,
    userId: 'u1',
    lot: lot(`lot_${id}`, lotStatus),
    order: options.order,
    depositAmount: options.depositAmount ?? 5000,
    depositStatus: options.depositStatus ?? 'FROZEN'
  } as UserAuctionRecord;
}

function order(id: string, status: Order['status'], payStatus: string, fulfillmentStatus?: Order['fulfillmentStatus']): Order {
  return {
    id: `order_${id}`,
    auctionId: `auction_lot_${id}`,
    buyerId: 'u1',
    amount: 1000,
    status,
    payStatus,
    fulfillmentStatus
  };
}
