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

export function formatAudioBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
