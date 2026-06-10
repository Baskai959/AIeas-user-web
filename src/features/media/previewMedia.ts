import { useCallback, useMemo, useRef } from 'react';

import type { LiveRoom } from '../../services/types';

const liveVideoFallback = '/media/live-room-demo.mp4';
const previewMediaSnapshotMaxAgeMs = 30_000;
const previewMediaPositionStoragePrefix = 'aieas-user-preview-media-position:';

export type PreviewMediaSnapshot = {
  roomId: string;
  sourceUrl: string;
  currentTime: number;
  capturedAtMs: number;
};

export function liveRoomPreviewVideoUrl(room: LiveRoom): string | undefined {
  if (room.videoSource === 'digitalHuman') return room.digitalHuman?.idleVideoUrl;
  return room.videoUrl;
}

export function discoverPreviewVideoUrl(room: LiveRoom): string {
  return liveRoomPreviewVideoUrl(room) ?? liveVideoFallback;
}

export function buildPreviewMediaSnapshot(room: LiveRoom, video?: HTMLVideoElement | null): PreviewMediaSnapshot | undefined {
  const sourceUrl = discoverPreviewVideoUrl(room);
  if (!sourceUrl || !video) return undefined;
  const currentTime = Number(video.currentTime);
  if (!Number.isFinite(currentTime) || currentTime < 0) return undefined;
  return {
    roomId: room.id,
    sourceUrl,
    currentTime,
    capturedAtMs: Date.now()
  };
}

function previewMediaPositionStorageKey(roomId: string, sourceUrl: string): string {
  return `${previewMediaPositionStoragePrefix}${encodeURIComponent(roomId)}:${encodeURIComponent(sourceUrl)}`;
}

export function rememberPreviewMediaSnapshot(snapshot: PreviewMediaSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(previewMediaPositionStorageKey(snapshot.roomId, snapshot.sourceUrl), JSON.stringify(snapshot));
  } catch {
    return;
  }
}

export function readRememberedPreviewMediaSnapshot(room: LiveRoom): PreviewMediaSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;
  const sourceUrl = discoverPreviewVideoUrl(room);
  if (!sourceUrl) return undefined;
  try {
    const raw = window.sessionStorage.getItem(previewMediaPositionStorageKey(room.id, sourceUrl));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<PreviewMediaSnapshot>;
    const snapshot: PreviewMediaSnapshot = {
      roomId: typeof parsed.roomId === 'string' ? parsed.roomId : '',
      sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl : '',
      currentTime: Number(parsed.currentTime),
      capturedAtMs: Number(parsed.capturedAtMs)
    };
    return isPreviewMediaSnapshotApplicable(snapshot, room, sourceUrl) ? snapshot : undefined;
  } catch {
    return undefined;
  }
}

export function isPreviewMediaSnapshotApplicable(snapshot: PreviewMediaSnapshot | undefined, room: LiveRoom, sourceUrl?: string): snapshot is PreviewMediaSnapshot {
  if (!snapshot || !sourceUrl) return false;
  if (snapshot.roomId !== room.id || snapshot.sourceUrl !== sourceUrl) return false;
  if (!Number.isFinite(snapshot.currentTime) || snapshot.currentTime < 0) return false;
  return Date.now() - snapshot.capturedAtMs <= previewMediaSnapshotMaxAgeMs;
}

export function previewMediaSnapshotKey(snapshot: PreviewMediaSnapshot | undefined): string | undefined {
  if (!snapshot) return undefined;
  return `${snapshot.roomId}|${snapshot.sourceUrl}|${snapshot.capturedAtMs}|${snapshot.currentTime}`;
}

export function applyInitialMediaPosition(video: HTMLVideoElement | null | undefined, snapshot?: PreviewMediaSnapshot): boolean {
  if (!video || !snapshot) return false;
  const baseCurrentTime = Number(snapshot.currentTime);
  if (!Number.isFinite(baseCurrentTime) || baseCurrentTime < 0) return false;
  const elapsedSeconds = Math.max(0, (Date.now() - snapshot.capturedAtMs) / 1000);
  const duration = Number(video.duration);
  const currentTime = Number.isFinite(duration) && duration > 0 ? (baseCurrentTime + elapsedSeconds) % duration : baseCurrentTime + elapsedSeconds;
  try {
    video.currentTime = currentTime;
    return true;
  } catch {
    return false;
  }
}

export function usePreviewMediaRestore(initialMediaPosition?: PreviewMediaSnapshot) {
  const appliedInitialMediaKeyRef = useRef<string | undefined>(undefined);
  const initialMediaKey = useMemo(() => previewMediaSnapshotKey(initialMediaPosition), [initialMediaPosition]);

  const applyInitialPosition = useCallback((video?: HTMLVideoElement | null) => {
    if (!initialMediaPosition || !initialMediaKey || appliedInitialMediaKeyRef.current === initialMediaKey) return false;
    const applied = applyInitialMediaPosition(video, initialMediaPosition);
    if (applied) {
      appliedInitialMediaKeyRef.current = initialMediaKey;
    }
    return applied;
  }, [initialMediaKey, initialMediaPosition]);

  const resetAppliedInitialPosition = useCallback(() => {
    appliedInitialMediaKeyRef.current = undefined;
  }, []);

  return {
    applyInitialPosition,
    resetAppliedInitialPosition
  };
}
