import { useMemo, type CSSProperties } from 'react';
import { X } from 'lucide-react';

import { VisualPlaceholder } from '../../components/VisualPlaceholder';
import { isPendingPayOrder } from '../../features/order/status';
import type { MessageKey } from '../../i18n/messages';
import { t } from '../../i18n/runtime';
import type { LiveRoomLot, Order } from '../../services/types';
import { formatMoney } from '../../utils/format';
import type { CountdownAmbientState, LiveAuctionAlert } from './liveAuctionFeedbackModel';

const countdownAmbientParticles = [
  { offset: '1px', bottom: '6%', size: '2px', delay: '0ms', duration: '1320ms', drift: '5px' },
  { offset: '7px', bottom: '13%', size: '2px', delay: '120ms', duration: '1580ms', drift: '4px' },
  { offset: '4px', bottom: '20%', size: '3px', delay: '240ms', duration: '1460ms', drift: '6px' },
  { offset: '12px', bottom: '27%', size: '2px', delay: '360ms', duration: '1700ms', drift: '4px' },
  { offset: '2px', bottom: '35%', size: '2px', delay: '500ms', duration: '1500ms', drift: '5px' },
  { offset: '9px', bottom: '43%', size: '2px', delay: '640ms', duration: '1840ms', drift: '3px' },
  { offset: '5px', bottom: '51%', size: '3px', delay: '760ms', duration: '1640ms', drift: '6px' },
  { offset: '14px', bottom: '60%', size: '2px', delay: '900ms', duration: '1760ms', drift: '4px' },
  { offset: '3px', bottom: '69%', size: '2px', delay: '1040ms', duration: '1560ms', drift: '5px' },
  { offset: '10px', bottom: '77%', size: '2px', delay: '1180ms', duration: '1920ms', drift: '4px' },
  { offset: '6px', bottom: '85%', size: '3px', delay: '1320ms', duration: '1680ms', drift: '6px' },
  { offset: '15px', bottom: '93%', size: '2px', delay: '1460ms', duration: '1980ms', drift: '4px' },
  { offset: '8px', bottom: '10%', size: '2px', delay: '80ms', duration: '1420ms', drift: '7px' },
  { offset: '17px', bottom: '24%', size: '2px', delay: '320ms', duration: '1660ms', drift: '5px' },
  { offset: '11px', bottom: '38%', size: '3px', delay: '560ms', duration: '1540ms', drift: '7px' },
  { offset: '16px', bottom: '56%', size: '2px', delay: '820ms', duration: '1860ms', drift: '5px' },
  { offset: '13px', bottom: '72%', size: '2px', delay: '1080ms', duration: '1600ms', drift: '6px' },
  { offset: '18px', bottom: '88%', size: '3px', delay: '1360ms', duration: '1900ms', drift: '5px' }
] as const;

const countdownAmbientPulseSparks = [
  { bottom: '8%', size: '3px', delay: '0ms', duration: '460ms', travelX: '18px', travelY: '-6px', scale: '1.26' },
  { bottom: '13%', size: '2px', delay: '12ms', duration: '500ms', travelX: '24px', travelY: '8px', scale: '1.1' },
  { bottom: '18%', size: '2px', delay: '24ms', duration: '440ms', travelX: '14px', travelY: '-14px', scale: '1.18' },
  { bottom: '23%', size: '3px', delay: '36ms', duration: '540ms', travelX: '28px', travelY: '12px', scale: '1.32' },
  { bottom: '29%', size: '2px', delay: '48ms', duration: '480ms', travelX: '20px', travelY: '-18px', scale: '1.06' },
  { bottom: '34%', size: '2px', delay: '60ms', duration: '520ms', travelX: '26px', travelY: '4px', scale: '1.22' },
  { bottom: '40%', size: '3px', delay: '72ms', duration: '500ms', travelX: '22px', travelY: '-10px', scale: '1.36' },
  { bottom: '46%', size: '2px', delay: '84ms', duration: '560ms', travelX: '29px', travelY: '14px', scale: '1.08' },
  { bottom: '52%', size: '2px', delay: '96ms', duration: '470ms', travelX: '16px', travelY: '-20px', scale: '1.18' },
  { bottom: '57%', size: '3px', delay: '108ms', duration: '540ms', travelX: '27px', travelY: '2px', scale: '1.32' },
  { bottom: '62%', size: '2px', delay: '120ms', duration: '450ms', travelX: '21px', travelY: '-8px', scale: '1.12' },
  { bottom: '68%', size: '2px', delay: '132ms', duration: '580ms', travelX: '30px', travelY: '16px', scale: '1.04' },
  { bottom: '73%', size: '3px', delay: '144ms', duration: '510ms', travelX: '23px', travelY: '-18px', scale: '1.4' },
  { bottom: '79%', size: '2px', delay: '156ms', duration: '540ms', travelX: '28px', travelY: '7px', scale: '1.16' },
  { bottom: '84%', size: '2px', delay: '168ms', duration: '470ms', travelX: '19px', travelY: '-14px', scale: '1.18' },
  { bottom: '89%', size: '3px', delay: '180ms', duration: '560ms', travelX: '31px', travelY: '10px', scale: '1.28' },
  { bottom: '93%', size: '2px', delay: '192ms', duration: '500ms', travelX: '25px', travelY: '-22px', scale: '1.1' },
  { bottom: '96%', size: '2px', delay: '204ms', duration: '460ms', travelX: '15px', travelY: '12px', scale: '1.06' }
] as const;

export function LiveCountdownAmbientLayer({ state }: { state?: CountdownAmbientState }) {
  if (!state) return null;
  const progressPercent = `${(Math.round(state.progress * 1000) / 10).toFixed(1)}%`;
  const style = { '--countdown-ambient-progress': progressPercent } as CSSProperties;
  const endPhaseClass = state.endPhase ? ` is-end-${state.endPhase}` : '';
  return (
    <div className={`live-countdown-ambient is-${state.tone}${endPhaseClass}`} style={style} aria-hidden="true">
      <span className="live-countdown-ambient-band is-left" />
      <span className="live-countdown-ambient-band is-right" />
      <span className="live-countdown-ambient-bloom is-left" />
      <span className="live-countdown-ambient-bloom is-right" />
      {(['left', 'right'] as const).map((side) => (
        <span key={side} className={`live-countdown-ambient-particles is-${side}`}>
          {countdownAmbientParticles.map((particle, index) => (
            <span
              key={`${side}-${index}`}
              className="live-countdown-ambient-particle"
              style={
                {
                  '--ambient-particle-bottom': particle.bottom,
                  '--ambient-particle-offset': particle.offset,
                  '--ambient-particle-size': particle.size,
                  '--ambient-particle-delay': particle.delay,
                  '--ambient-particle-duration': particle.duration,
                  '--ambient-particle-drift-x': side === 'left' ? particle.drift : `-${particle.drift}`
                } as CSSProperties
              }
            />
          ))}
        </span>
      ))}
      {state.pulseId ? (
        <>
          <span key={`pulse-${state.pulseId}`} className="live-countdown-ambient-pulse" />
          {(['left', 'right'] as const).map((side) => (
            <span key={`sparks-${side}-${state.pulseId}`} className={`live-countdown-ambient-pulse-sparks is-${side}`}>
              {countdownAmbientPulseSparks.map((spark, index) => (
                <span
                  key={`${side}-${index}`}
                  className="live-countdown-ambient-pulse-spark"
                  style={
                    {
                      '--ambient-spark-bottom': spark.bottom,
                      '--ambient-spark-size': spark.size,
                      '--ambient-spark-delay': spark.delay,
                      '--ambient-spark-duration': spark.duration,
                      '--ambient-spark-travel-x': side === 'left' ? spark.travelX : `-${spark.travelX}`,
                      '--ambient-spark-travel-y': spark.travelY,
                      '--ambient-spark-scale': spark.scale
                    } as CSSProperties
                  }
                />
              ))}
            </span>
          ))}
        </>
      ) : null}
      {state.endPulseId ? <span key={`end-pulse-${state.endPulseId}`} className="live-countdown-ambient-pulse is-end-pulse" /> : null}
    </div>
  );
}

export function LiveAuctionAlertLayer({
  alerts,
  lots = [],
  ordersByAuctionId,
  onDismiss,
  onPay
}: {
  alerts: LiveAuctionAlert[];
  lots?: LiveRoomLot[];
  ordersByAuctionId?: Map<string, Order>;
  onDismiss?: (id: string) => void;
  onPay?: (order: Order, auctionId: string) => void;
}) {
  const lotLookup = useMemo(() => {
    const byId = new Map<string, LiveRoomLot>();
    const byAuctionId = new Map<string, LiveRoomLot>();
    for (const lot of lots) {
      byId.set(lot.id, lot);
      byAuctionId.set(lot.auctionId, lot);
    }
    return { byId, byAuctionId };
  }, [lots]);

  if (!alerts.length) return null;
  return (
    <div className="live-auction-alert-layer" aria-live="polite">
      {alerts.map((alert, index) => {
        const lot = alert.lotId ? lotLookup.byId.get(alert.lotId) : lotLookup.byAuctionId.get(alert.auctionId);
        const order = ordersByAuctionId?.get(alert.auctionId);
        return (
          <LiveAuctionAlertCard
            key={alert.id}
            alert={alert}
            index={index}
            lot={lot}
            order={order}
            onDismiss={onDismiss}
            onPay={onPay}
          />
        );
      })}
    </div>
  );
}

function LiveAuctionAlertCard({
  alert,
  index,
  lot,
  order,
  onDismiss,
  onPay
}: {
  alert: LiveAuctionAlert;
  index: number;
  lot?: LiveRoomLot;
  order?: Order;
  onDismiss?: (id: string) => void;
  onPay?: (order: Order, auctionId: string) => void;
}) {
  const isWon = alert.kind === 'won';
  const isClosed = alert.kind === 'closed';
  const toneClass = alert.tone && alert.tone !== 'idle' ? ` is-${alert.tone}` : '';
  const pendingOrder = !order || !isPendingPayOrder(order);
  const closedBidCount = Math.max(0, Math.floor(alert.bidCount ?? 0));
  return (
    <article
      className={`live-auction-alert is-${alert.kind}${toneClass}`}
      role="status"
      aria-label={alert.subtitle ? `${alert.title} ${alert.subtitle}` : alert.title}
      style={{ '--auction-alert-index': index } as CSSProperties}
    >
      {isWon ? (
        <>
          <div className="live-auction-success-heading">{t('auctionAlert.won.heading')}</div>
          <div className="live-auction-alert-card live-auction-success-card">
            <span className="live-auction-success-badge">
              <span className="live-auction-success-avatar" aria-hidden="true" />
              {t('auctionAlert.won.badge')}
            </span>
            <span className="live-auction-alert-kicker">{t('auctionAlert.won.shared')}</span>
            <div className="live-auction-success-lot">
              <div className="live-auction-success-cover">
                <VisualPlaceholder title={lot?.title ?? alert.title} imageUrl={lot?.imageUrl} tone="gold" />
              </div>
              <div className="live-auction-success-copy">
                <b>{lot?.title ?? alert.title}</b>
                <p>{lot?.description ?? alert.subtitle ?? ''}</p>
                <em>{formatMoney(order?.amount ?? alert.price ?? lot?.finalPrice ?? lot?.currentPrice ?? 0)}</em>
              </div>
            </div>
            <div className="live-auction-success-deposit">
              <span>{t('auctionAlert.won.deposit')}</span>
              <strong>{t('auctionAlert.won.depositRefund')}</strong>
            </div>
            <button
              className="live-auction-success-pay"
              type="button"
              disabled={pendingOrder}
              onClick={() => {
                if (!order) return;
                onPay?.(order, alert.auctionId);
              }}
            >
              {pendingOrder ? t('auction.orderPending') : t('auctionAlert.won.payWithAddress')}
            </button>
          </div>
          <button className="live-auction-success-close" type="button" aria-label={t('common.close')} onClick={() => onDismiss?.(alert.id)}>
            <X size={22} />
          </button>
        </>
      ) : isClosed ? (
        <>
          <div className="live-auction-closed-heading">
            <span>{t('auctionAlert.closed.headingPrimary')}</span>
            <strong>{t('auctionAlert.closed.headingSecondary')}</strong>
          </div>
          <div className="live-auction-alert-card live-auction-closed-card">
            <span className="live-auction-closed-winner">
              <span className="live-auction-success-avatar" aria-hidden="true" />
              {alert.winnerName ?? t('auctionAlert.closed.defaultWinner')}
            </span>
            <p>{t('auctionAlert.closed.roundSummary', { count: closedBidCount || 1 })}</p>
            <em>{formatMoney(alert.price ?? 0)}</em>
            <span className="live-auction-closed-price-label">{t('auctionAlert.closed.finalPrice')}</span>
          </div>
        </>
      ) : (
        <div className="live-auction-alert-card">
          <span className="live-auction-alert-kicker">{alert.kicker ?? t(`auctionAlert.${alert.kind}.kicker` as MessageKey)}</span>
          <strong className={alert.value ? 'live-auction-alert-value' : undefined}>{alert.value ?? alert.title}</strong>
          {alert.value ? <span className="live-auction-alert-title">{alert.title}</span> : null}
          {alert.subtitle ? <span>{alert.subtitle}</span> : null}
          {alert.price !== undefined ? <em>{formatMoney(alert.price)}</em> : null}
        </div>
      )}
    </article>
  );
}
