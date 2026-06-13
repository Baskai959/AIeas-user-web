import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'antd-mobile';
import { ArrowLeft, Trophy } from 'lucide-react';

import { LoadingBlock } from '../../components/LoadingBlock';
import { t } from '../../i18n/runtime';
import { isPendingPayOrder } from '../../features/order/status';
import type { ApiClient } from '../../services/api';
import type { Order, PageResult } from '../../services/types';
import { formatMoney } from '../../utils/format';

const WIN_CELEBRATION_DURATION_MS = 4200;
const resultOrderPlaceholder: PageResult<Order> = { items: [], total: 0, page: 1, page_size: 20 };

export function ResultPage({ apiClient, auctionId, onBack, onPay }: { apiClient: ApiClient; auctionId: string; onBack: () => void; onPay: (orderId: string) => void }) {
  const orders = useQuery<PageResult<Order>>({
    queryKey: ['result-order', auctionId],
    queryFn: () => apiClient.listMyOrders({ auctionId }),
    placeholderData: resultOrderPlaceholder,
    refetchOnMount: 'always'
  });
  const orderItems = orders.data?.items ?? [];
  const order = orderItems[0];
  const showLoading = orders.isLoading && orderItems.length === 0;

  return (
    <section className="page-content result-page">
      <button className="back-button" onClick={onBack} type="button" aria-label={t('common.back')}>
        <ArrowLeft size={18} />
      </button>
      {showLoading ? (
        <LoadingBlock />
      ) : (
        <>
          <Trophy size={48} />
          <h1>{t('result.title')}</h1>
          <h2>{order ? t('result.won') : t('result.lost')}</h2>
          <p>{auctionId}</p>
          {order ? <ResultWinningCelebration auctionId={auctionId} price={order.amount} /> : null}
          {order && isPendingPayOrder(order) ? (
            <Button block color="primary" onClick={() => onPay(order.id)}>
              {t('auction.pay')}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

function ResultWinningCelebration({ auctionId, price }: { auctionId: string; price?: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), WIN_CELEBRATION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="result-winning-celebration" data-testid={`result-winning-alert-${auctionId}`}>
      <div className="result-winning-card">
        <div className="live-auction-alert-card">
          <strong>{t('auctionAlert.won.title')}</strong>
          <span>{t('auctionAlert.won.subtitle')}</span>
          {price !== undefined ? <b>{formatMoney(price)}</b> : null}
        </div>
      </div>
    </div>
  );
}
