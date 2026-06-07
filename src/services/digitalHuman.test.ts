import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDigitalHumanWsUrl, formatAudioBytes, LiveVoiceBroadcastAudioPlayer, pcm16ToFloat32, type LiveVoiceBroadcastAudioPayload } from './digitalHuman';

function installMockAudioContext() {
  const sources: Array<{
    buffer?: AudioBuffer;
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];
  const contexts: Array<{
    state: AudioContextState;
    currentTime: number;
    destination: object;
    resume: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    createBuffer: ReturnType<typeof vi.fn>;
    createBufferSource: ReturnType<typeof vi.fn>;
    decodeAudioData: ReturnType<typeof vi.fn>;
  }> = [];

  class FakeAudioContext {
    state: AudioContextState = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      this.state = 'running';
    });
    close = vi.fn(async () => {
      this.state = 'closed';
    });
    createBuffer = vi.fn((channels: number, frameCount: number, sampleRate: number) => ({
      duration: frameCount / sampleRate,
      copyToChannel: vi.fn(),
      numberOfChannels: channels,
      length: frameCount,
      sampleRate
    }));
    createBufferSource = vi.fn(() => {
      const source = {
        buffer: undefined as AudioBuffer | undefined,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null
      };
      sources.push(source);
      return source;
    });
    decodeAudioData = vi.fn(async () => this.createBuffer(1, 1, 24_000));

    constructor() {
      contexts.push(this);
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext);
  return { contexts, sources };
}

function liveVoicePayload(sampleSeed: number): LiveVoiceBroadcastAudioPayload {
  return {
    audioBase64: btoa(String.fromCharCode(sampleSeed, 0, 255, 127, 0, 128)),
    audioFormat: 'pcm_s16le',
    sampleRate: 24_000,
    channels: 1
  };
}

describe('digital human audio helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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

  it('queues consecutive live voice broadcasts without interrupting the current source', async () => {
    const audio = installMockAudioContext();
    const player = new LiveVoiceBroadcastAudioPlayer();
    const onDrained = vi.fn();

    const firstPlayback = player.play(liveVoicePayload(0), { onEnded: onDrained });
    await Promise.resolve();
    const secondPlayback = player.play(liveVoicePayload(1), { onEnded: onDrained });
    await firstPlayback;

    expect(audio.sources).toHaveLength(1);
    expect(audio.sources[0]?.start).toHaveBeenCalledTimes(1);
    expect(audio.sources[0]?.stop).not.toHaveBeenCalled();
    expect(onDrained).not.toHaveBeenCalled();

    audio.sources[0]?.onended?.();
    await secondPlayback;

    expect(audio.sources).toHaveLength(2);
    expect(audio.sources[1]?.start).toHaveBeenCalledTimes(1);
    expect(audio.sources[0]?.stop).not.toHaveBeenCalled();
    expect(onDrained).not.toHaveBeenCalled();

    audio.sources[1]?.onended?.();

    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it('stops current live voice playback and clears queued broadcasts', async () => {
    const audio = installMockAudioContext();
    const player = new LiveVoiceBroadcastAudioPlayer();
    const onDrained = vi.fn();

    const firstPlayback = player.play(liveVoicePayload(2), { onEnded: onDrained });
    await Promise.resolve();
    const secondPlayback = player.play(liveVoicePayload(3), { onEnded: onDrained });
    await firstPlayback;

    player.stop();
    const queuedResult = await secondPlayback;

    expect(audio.sources).toHaveLength(1);
    expect(audio.sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(queuedResult.played).toBe(false);
    expect(onDrained).not.toHaveBeenCalled();

    audio.sources[0]?.onended?.();
    expect(audio.sources).toHaveLength(1);
  });
});
