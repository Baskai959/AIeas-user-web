import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuctionState } from '../../services/types';
import { makeRequestId } from '../../utils/format';

const winCelebrationDurationMs = 4200;
const countdownPressureWarningMs = 10_000;
const countdownPressureCriticalMs = 3000;
export const countdownPressureExtendedMs = 1800;
export const countdownAmbientThresholdMs = 30_000;

export type LiveAuctionAlertKind = 'countdown' | 'leading' | 'outbid' | 'extended' | 'closed' | 'won';
export type AuctionEventAlertKind = Exclude<LiveAuctionAlertKind, 'countdown'>;
export type CountdownPressurePhase = 'idle' | 'warning' | 'critical' | 'extended';
type CountdownAmbientTone = 'empty' | 'other' | 'self';

export type LiveAuctionAlert = {
  id: string;
  kind: LiveAuctionAlertKind;
  auctionId: string;
  lotId?: string;
  title: string;
  subtitle?: string;
  value?: string;
  kicker?: string;
  tone?: CountdownPressurePhase;
  price?: number;
  winnerName?: string;
  bidCount?: number;
  priority: number;
  durationMs: number;
};

type LiveAuctionAlertInput = Omit<LiveAuctionAlert, 'id' | 'priority' | 'durationMs'> & {
  priority?: number;
  durationMs?: number;
};

export type CountdownAmbientState = {
  auctionId: string;
  tone: CountdownAmbientTone;
  progress: number;
  pulseId?: number;
  endPulseId?: number;
  endPhase?: 'hold' | 'leaving';
};

export type CountdownAmbientEndEffect = {
  auctionId: string;
  endTsMs: number;
  phase: 'hold' | 'leaving';
  pulseId: number;
};

export type CountdownExtensionPulse = {
  auctionId: string;
  id: number;
  seconds?: number;
};

export const liveAuctionAlertPriority: Record<LiveAuctionAlertKind, number> = {
  countdown: 10,
  leading: 20,
  outbid: 40,
  extended: 30,
  closed: 50,
  won: 100
};

export const liveAuctionAlertDurationMs: Record<LiveAuctionAlertKind, number> = {
  countdown: 1400,
  leading: 2600,
  outbid: 3200,
  extended: 2800,
  closed: 3000,
  won: winCelebrationDurationMs
};

export const countdownAmbientBidPulseMs = 780;
export const countdownAmbientEndHoldMs = 1000;
export const countdownAmbientEndExitMs = 760;

export function countdownPressureDisplaySeconds(remainMs: number): number {
  return Math.max(0, Math.floor(remainMs / 1000));
}

export function getCountdownPressurePhase(remainMs: number, status?: AuctionState['status'], extended = false): CountdownPressurePhase {
  if (extended) return 'extended';
  if (status !== 'RUNNING' && status !== 'EXTENDED') return 'idle';
  if (remainMs <= 0) return 'idle';
  if (remainMs <= countdownPressureCriticalMs) return 'critical';
  if (remainMs <= countdownPressureWarningMs) return 'warning';
  return 'idle';
}

export function countdownAmbientProgress(remainMs: number): number {
  if (!Number.isFinite(remainMs)) return 0;
  return Math.max(0, Math.min(1, (countdownAmbientThresholdMs - remainMs) / countdownAmbientThresholdMs));
}

export function countdownAmbientTone(state: AuctionState, userId: string): CountdownAmbientTone {
  const hasLeaderBid = Boolean(state.leaderBidderId) && (state.bidCount === undefined || state.bidCount > 0);
  if (!hasLeaderBid) return 'empty';
  return state.leaderBidderId === userId ? 'self' : 'other';
}

export function useLiveAuctionAlerts() {
  const [alerts, setAlerts] = useState<LiveAuctionAlert[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  const dismissAlert = useCallback((id: string) => {
    const timer = timersRef.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete timersRef.current[id];
    }
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const pushAlert = useCallback(
    (input: LiveAuctionAlertInput) => {
      const id = makeRequestId(`auction-alert-${input.kind}`);
      const alert: LiveAuctionAlert = {
        ...input,
        id,
        priority: input.priority ?? liveAuctionAlertPriority[input.kind],
        durationMs: input.durationMs ?? liveAuctionAlertDurationMs[input.kind]
      };

      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
      timersRef.current = {};
      setAlerts([alert]);

      if (alert.durationMs > 0) {
        timersRef.current[id] = window.setTimeout(() => dismissAlert(id), alert.durationMs);
      }
    },
    [dismissAlert]
  );

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
      timersRef.current = {};
    },
    []
  );

  return { alerts, pushAlert, dismissAlert };
}
