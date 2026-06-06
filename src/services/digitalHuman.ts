export type DigitalHumanConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface DigitalHumanAudioStart {
  text: string;
  sampleRate: number;
  channels: number;
  audioFormat: string;
}

export interface DigitalHumanAudioClientOptions {
  wsUrl: string;
  onConnectionStatus?: (status: DigitalHumanConnectionStatus) => void;
  onAudioStart?: (payload: DigitalHumanAudioStart) => void;
  onAudioEnd?: () => void;
  onPlaybackDrained?: () => void;
  onByteCount?: (bytes: number) => void;
  onError?: (message: string) => void;
}

export interface LiveVoiceBroadcastAudioPayload {
  audioBase64?: string;
  audioFormat?: string;
  encoding?: string;
  sampleRate?: number;
  channels?: number;
}

export interface LiveVoiceBroadcastPlaybackResult {
  played: boolean;
  durationMs: number;
  blocked?: boolean;
}

export interface LiveVoiceBroadcastPlaybackOptions {
  onEnded?: () => void;
}

interface DigitalHumanServerMessage {
  type?: string;
  text?: string;
  sample_rate?: number;
  channels?: number;
  audio_format?: string;
  error?: string;
}

interface BuildDigitalHumanWsUrlOptions {
  configuredUrl?: string;
  hostname?: string;
  protocol?: string;
  port?: number;
}

const DEFAULT_TTS_WS_PORT = 8876;
const DEFAULT_TTS_WS_PATH = '/tts';

export const defaultDigitalHumanMedia = {
  idleVideoUrl: '/media/AI_Presenter_Silent.mp4',
  speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4'
};

export function buildDigitalHumanWsUrl(options: BuildDigitalHumanWsUrlOptions = {}): string {
  if (options.configuredUrl) return options.configuredUrl;
  const protocol = options.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = options.hostname || '127.0.0.1';
  const port = options.port ?? DEFAULT_TTS_WS_PORT;
  return `${protocol}//${hostname}:${port}${DEFAULT_TTS_WS_PATH}`;
}

export function pcm16ToFloat32(arrayBuffer: ArrayBuffer): Float32Array<ArrayBuffer> {
  const frameCount = Math.floor(arrayBuffer.byteLength / 2);
  const view = new DataView(arrayBuffer);
  const samples = new Float32Array(frameCount) as Float32Array<ArrayBuffer>;
  for (let index = 0; index < frameCount; index += 1) {
    const value = view.getInt16(index * 2, true);
    samples[index] = Math.max(-1, Math.min(1, value / 32768));
  }
  return samples;
}

export function base64ToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const binary = window.atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function formatAudioBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export class LiveVoiceBroadcastAudioPlayer {
  private audioContext?: AudioContext;
  private source?: AudioBufferSourceNode;
  private finishTimer = 0;

  async unlockAudio(): Promise<boolean> {
    const audioContext = this.ensureAudioContext();
    if (!audioContext) return false;
    if (audioContext.state !== 'running') {
      await Promise.race([audioContext.resume(), wait(700)]);
    }
    return audioContext.state === 'running';
  }

  async play(payload: LiveVoiceBroadcastAudioPayload, options: LiveVoiceBroadcastPlaybackOptions = {}): Promise<LiveVoiceBroadcastPlaybackResult> {
    this.stop();
    const audioBase64 = typeof payload.audioBase64 === 'string' ? payload.audioBase64.trim() : '';
    if (!audioBase64) {
      console.warn('[live.voice_broadcast] playback skipped: empty audioBase64');
      return { played: false, durationMs: 0 };
    }

    const audioContext = this.ensureAudioContext();
    if (!audioContext) {
      console.warn('[live.voice_broadcast] playback blocked: AudioContext unavailable');
      return { played: false, durationMs: 0, blocked: true };
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = base64ToArrayBuffer(audioBase64);
    } catch (error) {
      console.error('[live.voice_broadcast] base64 decode failed', { audioBase64Length: audioBase64.length }, error);
      throw error;
    }
    const sampleRate = normalizeSampleRate(payload.sampleRate);
    const channels = normalizeChannelCount(payload.channels);
    const audioFormat = String(payload.audioFormat || payload.encoding || 'pcm_s16le').toLowerCase();
    let buffer: AudioBuffer;
    try {
      buffer = audioFormat.includes('pcm') || audioFormat.includes('s16le')
        ? createPcm16AudioBuffer(audioContext, arrayBuffer, sampleRate, channels)
        : await audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch (error) {
      console.error('[live.voice_broadcast] audio decode failed', { bytes: arrayBuffer.byteLength, audioFormat, sampleRate, channels }, error);
      throw error;
    }
    const durationMs = Math.ceil(buffer.duration * 1000);
    console.info('[live.voice_broadcast] decoded audio', {
      bytes: arrayBuffer.byteLength,
      audioFormat,
      sampleRate,
      channels,
      durationMs,
      audioContextState: audioContext.state
    });
    if (durationMs <= 0) {
      console.warn('[live.voice_broadcast] decoded audio has zero duration', { bytes: arrayBuffer.byteLength, audioFormat, sampleRate, channels });
    }

    const unlocked = await this.unlockAudio();
    if (!unlocked) {
      console.warn('[live.voice_broadcast] playback blocked: AudioContext is not running', { audioContextState: audioContext.state, durationMs });
      return { played: false, durationMs, blocked: true };
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    this.source = source;

    const finish = () => {
      if (this.source !== source) return;
      if (this.source === source) this.source = undefined;
      window.clearTimeout(this.finishTimer);
      this.finishTimer = 0;
      options.onEnded?.();
    };
    source.onended = finish;
    const startAt = Math.max(audioContext.currentTime + 0.03, 0);
    source.start(startAt);
    this.finishTimer = window.setTimeout(finish, durationMs + 300);
    console.info('[live.voice_broadcast] audio source started', {
      startAt,
      currentTime: audioContext.currentTime,
      durationMs,
      audioContextState: audioContext.state
    });

    return { played: true, durationMs };
  }

  stop(): void {
    window.clearTimeout(this.finishTimer);
    this.finishTimer = 0;
    if (!this.source) return;
    const source = this.source;
    this.source = undefined;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // The source may not have started yet.
    }
  }

  close(): void {
    this.stop();
    if (typeof this.audioContext?.close === 'function') {
      void this.audioContext.close();
    }
    this.audioContext = undefined;
  }

  private ensureAudioContext(): AudioContext | undefined {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;
    if (!this.audioContext) this.audioContext = new AudioContextClass();
    return this.audioContext;
  }
}

let sharedLiveVoiceBroadcastAudioPlayer: LiveVoiceBroadcastAudioPlayer | undefined;

export function getLiveVoiceBroadcastAudioPlayer(): LiveVoiceBroadcastAudioPlayer {
  if (!sharedLiveVoiceBroadcastAudioPlayer) sharedLiveVoiceBroadcastAudioPlayer = new LiveVoiceBroadcastAudioPlayer();
  return sharedLiveVoiceBroadcastAudioPlayer;
}

export class DigitalHumanAudioClient {
  private socket?: WebSocket;
  private retryTimer = 0;
  private retryDelay = 900;
  private audioContext?: AudioContext;
  private sampleRate = 24_000;
  private byteCount = 0;
  private streamEnded = false;
  private pendingSources = 0;
  private nextStartTime = 0;
  private finishTimer = 0;
  private forceFinishTimer = 0;
  private pendingPcmChunks: ArrayBuffer[] = [];
  private sources = new Set<AudioBufferSourceNode>();

  constructor(private readonly options: DigitalHumanAudioClientOptions) {}

  connect(): void {
    window.clearTimeout(this.retryTimer);
    this.options.onConnectionStatus?.('connecting');
    const socket = new WebSocket(this.options.wsUrl);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.retryDelay = 900;
      this.options.onConnectionStatus?.('connected');
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      if (typeof event.data === 'string') {
        this.handleTextMessage(event.data);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        this.handleAudioChunk(event.data);
      }
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.options.onConnectionStatus?.('reconnecting');
      this.retryTimer = window.setTimeout(() => this.connect(), this.retryDelay);
      this.retryDelay = Math.min(8000, Math.floor(this.retryDelay * 1.7));
    });

    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      this.options.onConnectionStatus?.('error');
    });
  }

  disconnect(): void {
    window.clearTimeout(this.retryTimer);
    this.resetPlayback();
    this.socket?.close();
    this.socket = undefined;
    this.options.onConnectionStatus?.('idle');
  }

  async unlockAudio(): Promise<boolean> {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.options.onError?.('AUDIO_CONTEXT_UNAVAILABLE');
      return false;
    }
    if (!this.audioContext) this.audioContext = new AudioContextClass();
    if (this.audioContext.state !== 'running') {
      await Promise.race([this.audioContext.resume(), wait(700)]);
    }
    const unlocked = this.audioContext.state === 'running';
    if (unlocked) this.flushPendingPcm();
    return unlocked;
  }

  speak(text: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'speak', text }));
    return true;
  }

  stop(): void {
    this.resetPlayback();
    this.options.onPlaybackDrained?.();
  }

  private handleTextMessage(raw: string): void {
    let payload: DigitalHumanServerMessage;
    try {
      payload = JSON.parse(raw) as DigitalHumanServerMessage;
    } catch {
      return;
    }

    if (payload.type === 'ready') {
      this.options.onConnectionStatus?.('connected');
      return;
    }
    if (payload.type === 'audio_start') {
      this.beginAudioStream(payload);
      return;
    }
    if (payload.type === 'audio_end') {
      this.streamEnded = true;
      this.options.onAudioEnd?.();
      this.scheduleFinishAfterDrain();
      return;
    }
    if (payload.type === 'error') {
      this.resetPlayback();
      this.options.onError?.(payload.error || 'TTS_ERROR');
      this.options.onPlaybackDrained?.();
    }
  }

  private beginAudioStream(payload: DigitalHumanServerMessage): void {
    this.resetPlayback();
    this.sampleRate = Number(payload.sample_rate || 24_000);
    this.byteCount = 0;
    this.options.onByteCount?.(this.byteCount);
    this.options.onAudioStart?.({
      text: payload.text || '',
      sampleRate: this.sampleRate,
      channels: Number(payload.channels || 1),
      audioFormat: payload.audio_format || 'pcm_s16le'
    });
  }

  private handleAudioChunk(arrayBuffer: ArrayBuffer): void {
    this.byteCount += arrayBuffer.byteLength;
    this.options.onByteCount?.(this.byteCount);

    if (!this.audioContext || this.audioContext.state !== 'running') {
      this.pendingPcmChunks.push(arrayBuffer);
      return;
    }
    this.schedulePcm(arrayBuffer);
  }

  private schedulePcm(arrayBuffer: ArrayBuffer): void {
    if (!this.audioContext || arrayBuffer.byteLength < 2) return;
    const samples = pcm16ToFloat32(arrayBuffer);
    const buffer = this.audioContext.createBuffer(1, samples.length, this.sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const startAt = Math.max(this.audioContext.currentTime + 0.03, this.nextStartTime || this.audioContext.currentTime + 0.08);
    this.nextStartTime = startAt + buffer.duration;
    this.pendingSources += 1;
    this.sources.add(source);

    source.onended = () => {
      this.sources.delete(source);
      this.pendingSources = Math.max(0, this.pendingSources - 1);
      this.maybeFinishPlayback();
    };

    try {
      source.start(startAt);
    } catch {
      this.sources.delete(source);
      this.pendingSources = Math.max(0, this.pendingSources - 1);
    }
  }

  private flushPendingPcm(): void {
    if (!this.audioContext || this.audioContext.state !== 'running') return;
    const chunks = this.pendingPcmChunks.splice(0);
    chunks.forEach((chunk) => this.schedulePcm(chunk));
    this.scheduleFinishAfterDrain();
  }

  private scheduleFinishAfterDrain(): void {
    window.clearTimeout(this.finishTimer);
    window.clearTimeout(this.forceFinishTimer);
    if (!this.streamEnded) return;
    if (!this.audioContext) {
      this.maybeFinishPlayback();
      return;
    }
    const waitMs = Math.max(100, Math.ceil((this.nextStartTime - this.audioContext.currentTime) * 1000) + 220);
    this.finishTimer = window.setTimeout(() => this.maybeFinishPlayback(), waitMs);
    this.forceFinishTimer = window.setTimeout(() => {
      if (!this.streamEnded) return;
      this.resetPlayback();
      this.options.onPlaybackDrained?.();
    }, waitMs + 1500);
  }

  private maybeFinishPlayback(): void {
    if (!this.streamEnded) return;
    if (this.pendingSources > 0) return;
    if (this.pendingPcmChunks.length > 0) return;
    this.resetPlayback();
    this.options.onPlaybackDrained?.();
  }

  private resetPlayback(): void {
    window.clearTimeout(this.finishTimer);
    window.clearTimeout(this.forceFinishTimer);
    this.finishTimer = 0;
    this.forceFinishTimer = 0;
    this.pendingPcmChunks = [];
    this.pendingSources = 0;
    this.nextStartTime = 0;
    this.streamEnded = false;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        continue;
      }
    }
    this.sources.clear();
  }
}

function normalizeSampleRate(value: unknown): number {
  const sampleRate = Number(value);
  return Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 192000 ? sampleRate : 24_000;
}

function normalizeChannelCount(value: unknown): number {
  const channels = Math.floor(Number(value));
  return Number.isFinite(channels) && channels >= 1 ? Math.min(channels, 8) : 1;
}

function createPcm16AudioBuffer(audioContext: AudioContext, arrayBuffer: ArrayBuffer, sampleRate: number, channels: number): AudioBuffer {
  const sampleCount = Math.floor(arrayBuffer.byteLength / 2);
  const frameCount = Math.floor(sampleCount / channels);
  const view = new DataView(arrayBuffer);
  const buffer = audioContext.createBuffer(channels, frameCount, sampleRate);

  for (let channel = 0; channel < channels; channel += 1) {
    const samples = new Float32Array(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const sampleIndex = frame * channels + channel;
      const value = view.getInt16(sampleIndex * 2, true);
      samples[frame] = Math.max(-1, Math.min(1, value / 32768));
    }
    buffer.copyToChannel(samples, channel);
  }

  return buffer;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
