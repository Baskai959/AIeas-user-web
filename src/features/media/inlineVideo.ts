import type { VideoHTMLAttributes } from 'react';

export type MobileInlineVideoAttributes = VideoHTMLAttributes<HTMLVideoElement> & {
  'webkit-playsinline': string;
  'x5-playsinline': string;
  'x5-video-player-type': string;
  'x5-video-orientation': string;
  'x-webkit-airplay': string;
};

export const mobileInlineVideoAttributes = {
  playsInline: true,
  'webkit-playsinline': 'true',
  'x5-playsinline': 'true',
  'x5-video-player-type': 'h5',
  'x5-video-orientation': 'portrait',
  'x-webkit-airplay': 'deny',
  controlsList: 'nodownload noplaybackrate nofullscreen noremoteplayback',
  disablePictureInPicture: true,
  disableRemotePlayback: true
} satisfies MobileInlineVideoAttributes;
