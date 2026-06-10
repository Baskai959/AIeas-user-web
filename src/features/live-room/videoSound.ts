import { useEffect, useState } from 'react';

const liveSoundPreferenceStorageKey = 'aieas-user-live-sound-enabled';

export function forceMutedVideo(video?: HTMLVideoElement | null): void {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
}

export function enableAudibleVideo(video?: HTMLVideoElement | null): void {
  if (!video) return;
  video.muted = false;
  video.defaultMuted = false;
  video.volume = 1;
}

export function readSharedLiveSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(liveSoundPreferenceStorageKey) !== 'false';
  } catch {
    return true;
  }
}

export function writeSharedLiveSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(liveSoundPreferenceStorageKey, enabled ? 'true' : 'false');
  } catch {
    return;
  }
}

export function useSharedLiveSoundPreference(): boolean {
  const [enabled, setEnabled] = useState(readSharedLiveSoundEnabled);

  useEffect(() => {
    const syncPreference = () => setEnabled(readSharedLiveSoundEnabled());
    window.addEventListener('storage', syncPreference);
    window.addEventListener('focus', syncPreference);
    window.addEventListener('pageshow', syncPreference);
    return () => {
      window.removeEventListener('storage', syncPreference);
      window.removeEventListener('focus', syncPreference);
      window.removeEventListener('pageshow', syncPreference);
    };
  }, []);

  return enabled;
}

export async function playVideo(video?: HTMLVideoElement | null): Promise<boolean> {
  if (!video) return false;
  try {
    await video.play();
    return true;
  } catch {
    return false;
  }
}

export function resetVideoToStart(video?: HTMLVideoElement | null): void {
  if (!video) return;
  try {
    video.currentTime = 0;
  } catch {
    return;
  }
}
