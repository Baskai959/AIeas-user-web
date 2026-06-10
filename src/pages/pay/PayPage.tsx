import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from 'antd-mobile';
import { ArrowLeft } from 'lucide-react';

import { LoadingBlock } from '../../components/LoadingBlock';
import type { MessageKey } from '../../i18n/messages';
import { t } from '../../i18n/runtime';
import { isPaidOrder, isPendingPayOrder } from '../../features/order/status';
import type { ApiClient } from '../../services/api';
import type { Order, PageResult, UserAuctionRecord } from '../../services/types';

type PaymentVisualStatus = 'idle' | 'paying' | 'paid' | 'error' | 'closed';

export function PayPage({
  apiClient,
  orderId,
  auctionId,
  onBack,
  onPaid
}: {
  apiClient: ApiClient;
  orderId: string;
  auctionId?: string;
  onBack: (auctionId: string) => void;
  onPaid?: (order: Order) => void;
}) {
  const queryClient = useQueryClient();
  const [paid, setPaid] = useState(false);
  const returnTimerRef = useRef<number>();
  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiClient.getOrder(orderId),
    refetchOnMount: 'always'
  });

  useEffect(() => {
    return () => {
      if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
    };
  }, []);

  const syncPaidOrder = useCallback((paidOrder: Order) => {
    queryClient.setQueryData<Order>(['order', paidOrder.id], paidOrder);
    queryClient.setQueryData<PageResult<Order>>(['my-orders'], (current) => {
      if (!current) return current;
      const hasOrder = current.items.some((item) => item.id === paidOrder.id);
      return {
        ...current,
        items: hasOrder ? current.items.map((item) => (item.id === paidOrder.id ? paidOrder : item)) : [paidOrder, ...current.items]
      };
    });
    queryClient.setQueryData<PageResult<UserAuctionRecord>>(['my-auction-records'], (current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((record) => (record.order?.id === paidOrder.id || record.lot.auctionId === paidOrder.auctionId ? { ...record, order: paidOrder } : record))
      };
    });
    void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['my-auction-records'] });
    void queryClient.invalidateQueries({ queryKey: ['result-order', paidOrder.auctionId] });
  }, [queryClient]);

  const pay = useMutation({
    mutationFn: () => apiClient.payOrder(orderId),
    onSuccess: (paidOrder) => {
      setPaid(true);
      syncPaidOrder(paidOrder);
      if (returnTimerRef.current) window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = window.setTimeout(() => {
        onPaid?.(paidOrder);
      }, 2000);
    },
    onError: () => {
      void order.refetch();
      void queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['my-auction-records'] });
    }
  });

  const targetAuctionId = auctionId ?? order.data?.auctionId ?? 'auc_2001';
  const paymentComplete = paid || isPaidOrder(order.data);
  const paymentClosed = Boolean(order.data && !paymentComplete && !isPendingPayOrder(order.data));
  const paymentUnavailable = Boolean(order.isError && !order.data);
  const status: PaymentVisualStatus = paymentComplete ? 'paid' : pay.isPending ? 'paying' : paymentClosed ? 'closed' : pay.isError || paymentUnavailable ? 'error' : 'idle';
  const paymentMessage = paymentComplete ? t('pay.paid') : paymentClosed ? t('pay.closed') : pay.isError || paymentUnavailable ? t('pay.errorStatus') : orderId;
  const buttonLabel = paymentComplete ? t('pay.paid') : paymentClosed ? t('pay.closedStatus') : paymentUnavailable ? t('pay.errorStatus') : t('pay.submit');
  const showLoading = order.isLoading && !order.data && !paymentComplete && !paymentUnavailable;

  return (
    <section className="page-content result-page">
      <button className="back-button" onClick={() => onBack(targetAuctionId)} type="button" aria-label={t('common.back')}>
        <ArrowLeft size={18} />
      </button>
      {showLoading ? (
        <LoadingBlock />
      ) : (
        <>
          <PaymentStatusAnimation status={status} />
          <h1>{t('pay.title')}</h1>
          <p>{paymentMessage}</p>
          <Button block color="primary" loading={pay.isPending} disabled={order.isLoading || paymentComplete || paymentClosed || paymentUnavailable} onClick={() => pay.mutate()}>
            {buttonLabel}
          </Button>
        </>
      )}
    </section>
  );
}

function PaymentStatusAnimation({ status }: { status: PaymentVisualStatus }) {
  const labelKey: Record<PaymentVisualStatus, MessageKey> = {
    idle: 'pay.idleStatus',
    paying: 'pay.processingStatus',
    paid: 'pay.successStatus',
    error: 'pay.errorStatus',
    closed: 'pay.closedStatus'
  };
  const label = t(labelKey[status]);

  return (
    <div className={`payment-animation is-${status}`}>
      <svg role="img" aria-label={label} viewBox="0 0 160 160">
        <defs>
          <linearGradient id={`payment-gradient-${status}`} x1="22" y1="20" x2="138" y2="140" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff8aa6" />
            <stop offset="1" stopColor="#ff2d55" />
          </linearGradient>
        </defs>
        <circle className="payment-halo" cx="80" cy="80" r="58" />
        {status === 'paid' ? (
          <path className="payment-check" d="M48 82l21 22 45-50" />
        ) : status === 'error' || status === 'closed' ? (
          <g className="payment-error-mark">
            <path d="M58 58l44 44" />
            <path d="M102 58L58 102" />
          </g>
        ) : (
          <g className="payment-wallet">
            <rect x="40" y="52" width="80" height="58" rx="14" />
            <path d="M40 70h80" />
            <circle cx="104" cy="91" r="5" />
            <path className="payment-flow" d="M50 42c19-13 42-13 62 0" />
            {status === 'paying' ? <circle className="payment-spinner" cx="80" cy="80" r="62" /> : null}
          </g>
        )}
      </svg>
      <p>{label}</p>
    </div>
  );
}
