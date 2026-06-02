import { describe, expect, it } from 'vitest';
import { buildDigitalHumanWsUrl, formatAudioBytes, pcm16ToFloat32 } from './digitalHuman';

describe('digital human audio helpers', () => {
  it('builds the default TTS WebSocket URL from the current host', () => {
    expect(buildDigitalHumanWsUrl({ hostname: '192.168.1.8', protocol: 'http:' })).toBe('ws://192.168.1.8:8876/tts');
    expect(buildDigitalHumanWsUrl({ hostname: 'auction.example.com', protocol: 'https:' })).toBe('wss://auction.example.com:8876/tts');
  });

  it('honors an explicitly configured TTS WebSocket URL', () => {
    expect(buildDigitalHumanWsUrl({ configuredUrl: 'ws://127.0.0.1:9000/custom' })).toBe('ws://127.0.0.1:9000/custom');
  });

  it('converts little-endian pcm_s16le samples into float32 audio samples', () => {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setInt16(0, -32768, true);
    view.setInt16(2, 0, true);
    view.setInt16(4, 32767, true);

    expect(Array.from(pcm16ToFloat32(buffer))).toEqual([-1, 0, 32767 / 32768]);
  });

  it('formats streamed byte counts for compact UI display', () => {
    expect(formatAudioBytes(0)).toBe('0 KB');
    expect(formatAudioBytes(1536)).toBe('2 KB');
    expect(formatAudioBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
