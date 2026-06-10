import type { LiveRoomLot, Order, UserAuctionRecord } from '../../services/types';

function lotFromOrder(order: Order): LiveRoomLot {
  const snapshot = order.lotSnapshot;
  const imageUrls = snapshot?.imageUrls?.filter(Boolean) ?? [];
  const imageUrl = snapshot?.coverUrl ?? imageUrls[0];
  const endTsMs = Date.parse(snapshot?.closedAt ?? order.paidAt ?? order.createdAt ?? '');
  const price = snapshot?.dealPrice ?? order.amount;
  const depositAmount = snapshot?.depositAmount ?? 0;
  const status: LiveRoomLot['status'] = order.fulfillmentStatus === 'RECEIVED' ? 'SETTLED' : 'CLOSED_WON';
  return {
    id: `order-lot-${order.auctionId}`,
    auctionId: order.auctionId,
    roomId: order.liveSessionId ?? snapshot?.liveSessionId ?? '',
    merchantId: order.merchantId ?? snapshot?.sellerId,
    categoryId: snapshot?.category,
    title: snapshot?.title ?? `订单 ${order.id}`,
    subtitle: snapshot?.category,
    description: snapshot?.description,
    imageUrl,
    imageUrls,
    status,
    startPrice: snapshot?.startPrice ?? price,
    currentPrice: price,
    finalPrice: price,
    leaderBidderId: order.buyerId,
    endTsMs: Number.isFinite(endTsMs) ? endTsMs : Date.now(),
    depositAmount
  };
}

function recordFromOrder(order: Order): UserAuctionRecord {
  const lot = lotFromOrder(order);
  return {
    id: `order-${order.id}`,
    userId: order.buyerId,
    lot,
    order,
    depositAmount: lot.depositAmount ?? 0,
    depositStatus: 'READY',
    enrolledAt: order.createdAt
  };
}

export function buildOrderByAuctionId(records: UserAuctionRecord[] = [], orders: Order[] = []): Map<string, Order> {
  const byAuctionId = new Map<string, Order>();
  orders.forEach((order) => byAuctionId.set(order.auctionId, order));
  records.forEach((record) => {
    if (record.order) byAuctionId.set(record.lot.auctionId, record.order);
  });
  return byAuctionId;
}

export function mergeAuctionRecordsWithOrders(records: UserAuctionRecord[] = [], orders: Order[] = []): UserAuctionRecord[] {
  if (!orders.length) return records;
  const byId = new Map(orders.map((order) => [order.id, order]));
  const byAuctionId = new Map(orders.map((order) => [order.auctionId, order]));
  const usedOrderIds = new Set<string>();
  const merged = records.map((record) => {
    const latestOrder =
      (record.order?.id ? byId.get(record.order.id) : undefined) ??
      (record.order || record.lot.status === 'CLOSED_WON' || record.lot.status === 'SETTLED' ? byAuctionId.get(record.lot.auctionId) : undefined);
    if (latestOrder) usedOrderIds.add(latestOrder.id);
    if (!latestOrder || latestOrder === record.order) return record;
    return { ...record, order: latestOrder };
  });
  orders.forEach((order) => {
    if (!usedOrderIds.has(order.id)) merged.push(recordFromOrder(order));
  });
  return merged;
}
