export function formatMoney(cents: number): string {
  const normalized = Number.isFinite(cents) ? cents : 0;
  return `¥${(normalized / 100).toFixed(2)}`;
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getServerOffsetMs(serverTsMs: number, clientNowMs: number): number {
  return serverTsMs - clientNowMs;
}

export function msUntil(endTsMs: number, clientNowMs: number, serverOffsetMs = 0): number {
  return Math.max(0, endTsMs - (clientNowMs + serverOffsetMs));
}

export function makeRequestId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
