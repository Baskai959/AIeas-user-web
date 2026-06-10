import type { MyAuctionTabKey, Order } from '../../services/types';

const closedOrderStatuses = new Set(['TIMEOUT', 'TIMED_OUT', 'CANCELLED', 'CANCELED', 'CLOSED', 'EXPIRED', 'PAY_TIMEOUT', 'PAYMENT_TIMEOUT']);
const closedPayStatuses = new Set(['TIMEOUT', 'TIMED_OUT', 'CANCELLED', 'CANCELED', 'CLOSED', 'EXPIRED', 'FAILED']);

function normalizeOrderState(value?: string): string {
  return String(value ?? '').trim().toUpperCase();
}

function isClosedOrder(order?: Order): boolean {
  if (!order) return false;
  return closedOrderStatuses.has(normalizeOrderState(order.status)) || closedPayStatuses.has(normalizeOrderState(order.payStatus));
}

export function isPendingPayOrder(order?: Order): boolean {
  if (!order) return false;
  if (isClosedOrder(order)) return false;
  const status = normalizeOrderState(order.status);
  const payStatus = normalizeOrderState(order.payStatus);
  return payStatus === 'UNPAID' || payStatus === 'PENDING' || status === 'PENDING_PAY' || status === 'CREATED';
}

export function isPaidOrder(order?: Order): boolean {
  if (!order) return false;
  return normalizeOrderState(order.payStatus) === 'PAID' || normalizeOrderState(order.status) === 'PAID';
}

export function orderTabFromOrder(order?: Order): MyAuctionTabKey {
  if (isPendingPayOrder(order)) return 'pendingPay';
  if (isPaidOrder(order) && order?.fulfillmentStatus === 'UNSHIPPED') return 'pendingShipment';
  if (isPaidOrder(order) && order?.fulfillmentStatus === 'SHIPPED') return 'pendingReceipt';
  if (isPaidOrder(order) && order?.fulfillmentStatus === 'RECEIVED') return 'completed';
  return 'all';
}
