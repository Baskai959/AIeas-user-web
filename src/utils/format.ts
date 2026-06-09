export function formatMoney(cents: number): string {
  const normalized = Number.isFinite(cents) ? cents : 0;
  return `¥${(normalized / 100).toFixed(2)}`;
}

export const countdownMillisecondsThresholdMs = 10_000;

export function shouldShowCountdownMilliseconds(ms: number): boolean {
  return Math.max(0, Math.floor(ms)) < countdownMillisecondsThresholdMs;
}

export function formatCountdown(ms: number, options: { milliseconds?: boolean } = {}): string {
  const normalizedMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(normalizedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const base = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (!options.milliseconds || !shouldShowCountdownMilliseconds(normalizedMs)) return base;
  return `${base}.${String(normalizedMs % 1000).padStart(3, '0')}`;
}

export function getServerOffsetMs(serverTsMs: number, clientNowMs: number): number {
  return serverTsMs - clientNowMs;
}

export function getServerOffsetMsWithRtt({
  serverTimeMs,
  clientSendTimeMs,
  clientReceiveTimeMs
}: {
  serverTimeMs: number;
  clientSendTimeMs: number;
  clientReceiveTimeMs: number;
}): number {
  const rttMs = Math.max(0, clientReceiveTimeMs - clientSendTimeMs);
  return serverTimeMs + rttMs / 2 - clientReceiveTimeMs;
}

export function msUntil(endTsMs: number, clientNowMs: number, serverOffsetMs = 0): number {
  return Math.max(0, endTsMs - (clientNowMs + serverOffsetMs));
}

export function makeRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
