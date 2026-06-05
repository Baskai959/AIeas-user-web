import { validateBidPrice } from './bidding';
import type { LiveChatMessage, RankingItem } from './types';

export interface RealtimeMessage<TPayload = unknown> {
  type: string;
  requestId?: string;
  seq?: number;
  ack?: boolean;
  liveSessionId?: number;
  payload: TPayload;
}

export interface BidInput {
  auctionId: string;
  price: number;
  expectedCurrentPrice: number;
  requestId?: string;
}

export interface ChatSendInput {
  roomId: string;
  content: string;
  clientMessageId: string;
}

export type MessageHandler = (message: RealtimeMessage) => void;
type NativeReconnectTimer = number | ReturnType<typeof setTimeout>;

export interface RealtimeClient {
  connect(): void;
  disconnect(): void;
  send(message: RealtimeMessage): void;
  onMessage(handler: MessageHandler): () => void;
}

interface MockOptions {
  roomId: string;
  auctionId: string;
  liveSessionId?: number;
  currentPrice: number;
  minIncrement: number;
  endTsMs: number;
  userId: string;
  participantCount?: number;
  onlineCount?: number;
  capPrice?: number;
}

interface NativeOptions {
  baseUrl: string;
  roomId: string;
  lastSeq?: number;
  storage?: Storage;
  reconnect?: {
    baseDelayMs?: number;
    maxDelayMs?: number;
    maxJitterMs?: number;
    random?: () => number;
    setTimeout?: (handler: () => void, timeoutMs: number) => NativeReconnectTimer;
    clearTimeout?: (timer: NativeReconnectTimer) => void;
  };
}

interface MockControlOptions {
  url: string;
  roomId: string;
}

export function buildLiveRoomWsUrl(baseUrl: string, roomId: string, lastSeq?: number): string {
  const base = baseUrl.replace(/\/$/, '');
  const query = lastSeq === undefined ? '' : `?lastSeq=${encodeURIComponent(String(lastSeq))}`;
  return `${base}/ws/live-rooms/${encodeURIComponent(roomId)}${query}`;
}

export function realtimeLastSeqStorageKey(roomId: string): string {
  return `live-room:${roomId}:lastSeq`;
}

export function nextNativeReconnectDelay(
  retryCount: number,
  random: () => number = Math.random,
  baseDelayMs = 500,
  maxDelayMs = 10_000,
  maxJitterMs = 1_000
): number {
  const expDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** retryCount);
  const jitter = Math.floor(random() * Math.min(maxJitterMs, expDelay));
  return expDelay + jitter;
}

function readStoredLastSeq(roomId: string, storage?: Storage): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(realtimeLastSeqStorageKey(roomId));
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function isFreshRealtimeMessage(message: Pick<RealtimeMessage, 'seq'>, lastSeq: number): boolean {
  return message.seq === undefined || message.seq > lastSeq;
}

export function nextRealtimeSeq(message: Pick<RealtimeMessage, 'seq'>, lastSeq: number): number {
  return message.seq === undefined ? lastSeq : Math.max(lastSeq, message.seq);
}

export class MockRealtimeClient implements RealtimeClient {
  private handlers = new Set<MessageHandler>();
  private seq = 100;
  private currentPrice: number;
  private endTsMs: number;
  private closed = false;
  private leaderBidderId: string;
  private participantCount: number;
  private onlineCount: number;
  private bidCount = 0;
  private timers: number[] = [];

  constructor(private readonly options: MockOptions) {
    this.currentPrice = options.currentPrice;
    this.endTsMs = options.endTsMs;
    this.leaderBidderId = 'u2';
    this.participantCount = options.participantCount ?? 0;
    this.onlineCount = options.onlineCount ?? 0;
  }

  connect(): void {
    this.closed = false;
    this.schedule(0, () => {
      this.emit({
        type: 'room.subscribed',
        requestId: 'mock-subscribe',
        ack: true,
        payload: {
          auctionId: this.options.auctionId
        }
      });
      this.emitOnline();
      this.emitRanking();
    });
    this.schedule(150, () => {
      this.emit({
        type: 'room.snapshot_required',
        payload: {
          auctionId: this.options.auctionId,
          lastSeq: this.seq - 1,
          reason: 'MOCK_RECOVERY_POINT'
        }
      });
    });
    this.schedule(Math.max(300, this.endTsMs - Date.now()), () => {
      if (this.closed) return;
      this.emit({
        type: 'timer.extended',
        payload: {
          auctionId: this.options.auctionId,
          reason: 'ANTI_SNIPE',
          oldEndTsMs: this.endTsMs,
          newEndTsMs: this.endTsMs + 10_000,
          extendMs: 10_000
        }
      });
      this.endTsMs += 10_000;
      this.schedule(10, () => this.closeAuction());
    });
  }

  disconnect(): void {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
    this.handlers.clear();
  }

  send(message: RealtimeMessage): void {
    if (message.type === 'heartbeat') {
      this.schedule(0, () =>
        this.emit({
          type: 'heartbeat.ack',
          requestId: message.requestId,
          ack: true,
          payload: {
            ts: Date.now()
          }
        })
      );
      return;
    }

    if (message.type === 'ping') {
      this.schedule(0, () =>
        this.emit({
          type: 'pong',
          requestId: message.requestId,
          ack: true,
          payload: {
            ts: Date.now()
          }
        })
      );
      return;
    }

    if (message.type === 'room.subscribe') {
      this.schedule(0, () =>
        this.emit({
          type: 'room.subscribed',
          requestId: message.requestId,
          ack: true,
          payload: {
            auctionId: this.options.auctionId
          }
        })
      );
      return;
    }

    if (message.type === 'room.unsubscribe') {
      this.schedule(0, () =>
        this.emit({
          type: 'room.unsubscribed',
          requestId: message.requestId,
          ack: true,
          payload: {
            auctionId: this.options.auctionId
          }
        })
      );
      return;
    }

    if (message.type === 'chat.send') {
      this.handleChatSend(message);
      return;
    }

    if (message.type !== 'bid.place') return;

    const bid = message.payload as unknown as BidInput;
    const validation = validateBidPrice(Number(bid.price), {
      currentPrice: this.currentPrice,
      minIncrement: this.options.minIncrement,
      capPrice: this.options.capPrice
    });

    if (this.closed || bid.auctionId !== this.options.auctionId || !validation.valid) {
      const minNextPrice = this.currentPrice + this.options.minIncrement;
      this.schedule(0, () =>
        this.emit({
          type: 'bid.rejected',
          requestId: message.requestId,
          payload: {
            auctionId: this.options.auctionId,
            code: 50001,
            reason: validation.valid ? 'AUCTION_CLOSED' : validation.reason,
            currentPrice: this.currentPrice,
            minNextPrice
          }
        })
      );
      return;
    }

    this.currentPrice = validation.price;
    this.leaderBidderId = this.options.userId;
    this.bidCount += 1;
    this.participantCount = Math.max(this.participantCount, 1);

    this.schedule(0, () => {
      this.emit({
        type: 'bid.ack',
        requestId: message.requestId,
        ack: true,
        payload: {
          accepted: true,
          auctionId: this.options.auctionId,
          currentPrice: this.currentPrice,
          seq: this.seq,
          streamId: `mock-stream-${this.options.roomId}`,
          event: 'bid.accepted'
        }
      });
    });

    this.schedule(250, () => {
      this.emit({
        type: 'bid.accepted',
        requestId: message.requestId,
        payload: {
          auctionId: this.options.auctionId,
          bidId: `bid_${this.seq}`,
          bidderId: this.options.userId,
          price: this.currentPrice,
          bidTsMs: Date.now(),
          currentPrice: this.currentPrice,
          leaderBidderId: this.options.userId,
          bidCount: this.bidCount,
          participantCount: this.participantCount,
          endTsMs: this.endTsMs
        }
      });
      this.emitRanking();
      if (this.options.capPrice !== undefined && this.currentPrice >= this.options.capPrice) {
        this.schedule(200, () => this.closeAuction());
      }
    });
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private emit(message: Omit<RealtimeMessage, 'seq' | 'liveSessionId'>): void {
    const withSeq = {
      ...message,
      seq: this.seq++,
      liveSessionId: this.options.liveSessionId
    };
    this.handlers.forEach((handler) => handler(withSeq));
  }

  private schedule(ms: number, callback: () => void): void {
    const timer = window.setTimeout(callback, ms);
    this.timers.push(timer);
  }

  private emitOnline(): void {
    this.emit({
      type: 'room.online',
      payload: {
        auctionId: this.options.auctionId,
        online: this.onlineCount
      }
    });
  }

  private emitRanking(): void {
    this.emit({
      type: 'ranking.updated',
      payload: {
        auctionId: this.options.auctionId,
        items: this.ranking()
      }
    });
  }

  private closeAuction(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit({
      type: 'auction.closed',
      payload: {
        auctionId: this.options.auctionId,
        status: 'CLOSED_WON',
        winnerBidderId: this.leaderBidderId,
        finalPrice: this.currentPrice,
        orderId: 'ord_2001',
        closedTsMs: Date.now()
      }
    });
    this.emit({
      type: 'live_session.ended',
      payload: {
        liveSessionId: this.options.liveSessionId,
        liveRoomId: this.options.roomId,
        closedAt: new Date().toISOString(),
        lotsTotal: 4,
        lotsSold: 2,
        lotsUnsold: 1,
        bidCount: this.bidCount,
        gmvCent: this.currentPrice
      }
    });
  }

  private handleChatSend(message: RealtimeMessage): void {
    const chat = message.payload as unknown as ChatSendInput;
    const content = String(chat.content ?? '').trim();
    const clientMessageId = String(chat.clientMessageId ?? message.requestId ?? `chat_${Date.now()}`);
    if (!content || chat.roomId !== this.options.roomId) {
      this.schedule(0, () =>
        this.emit({
          type: 'chat.error',
          requestId: message.requestId,
          payload: {
            roomId: this.options.roomId,
            clientMessageId,
            message: 'INVALID_CHAT_MESSAGE'
          }
        })
      );
      return;
    }

    const chatMessage: LiveChatMessage = {
      id: `msg_${this.seq}`,
      roomId: this.options.roomId,
      userId: this.options.userId,
      nickname: '我',
      content,
      clientMessageId,
      createdAt: new Date().toISOString()
    };

    this.schedule(0, () =>
      this.emit({
        type: 'chat.ack',
        requestId: message.requestId,
        ack: true,
        payload: {
          roomId: this.options.roomId,
          clientMessageId,
          messageId: chatMessage.id,
          createdAt: chatMessage.createdAt
        }
      })
    );
    this.schedule(40, () =>
      this.emit({
        type: 'chat.message',
        requestId: message.requestId,
        payload: chatMessage
      })
    );
  }

  private ranking(): RankingItem[] {
    const leaderIsUser = this.leaderBidderId === this.options.userId;
    const now = Date.now();
    const items: RankingItem[] = [
      {
        rank: 1,
        bidderId: this.leaderBidderId,
        nicknameMask: leaderIsUser ? '我' : '用户**02',
        avatarUrl: leaderIsUser ? '/logo.png' : undefined,
        price: this.currentPrice,
        bidTsMs: now
      }
    ];
    const lastVisibleRank = leaderIsUser ? 9 : 8;
    for (let rank = 2; rank <= lastVisibleRank; rank += 1) {
      const demoUserNumber = leaderIsUser ? rank : rank + 1;
      items.push({
        rank,
        bidderId: `u${demoUserNumber}`,
        nicknameMask: `用户**${String(demoUserNumber).padStart(2, '0')}`,
        avatarUrl: demoUserNumber <= 4 ? '/logo.png' : undefined,
        price: Math.max(0, this.currentPrice - this.options.minIncrement * (rank - 1)),
        bidTsMs: now - (rank - 1) * 1000
      });
    }
    if (!leaderIsUser) {
      items.push({
        rank: 9,
        bidderId: this.options.userId,
        nicknameMask: '我',
        avatarUrl: '/logo.png',
        price: Math.max(0, this.currentPrice - this.options.minIncrement * 8),
        bidTsMs: now - 8000
      });
    }
    return items;
  }
}

export class NativeWebSocketClient implements RealtimeClient {
  private socket?: WebSocket;
  private handlers = new Set<MessageHandler>();
  private lastSeq: number;
  private retryCount = 0;
  private manualClosed = true;
  private reconnectTimer?: NativeReconnectTimer;

  constructor(private readonly options: NativeOptions) {
    this.lastSeq = Math.max(options.lastSeq ?? 0, readStoredLastSeq(options.roomId, options.storage));
  }

  connect(): void {
    this.manualClosed = false;
    this.clearReconnectTimer();
    this.openSocket();
  }

  disconnect(): void {
    this.manualClosed = true;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = undefined;
    this.handlers.clear();
  }

  send(message: RealtimeMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private openSocket(): void {
    if (this.manualClosed) return;
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) return;

    const socket = new WebSocket(
      buildLiveRoomWsUrl(this.options.baseUrl, this.options.roomId, this.lastSeq > 0 ? this.lastSeq : undefined)
    );
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.retryCount = 0;
      this.clearReconnectTimer();
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      this.handleMessage(event);
    });

    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      socket.close();
    });

    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = undefined;
      if (!this.manualClosed) this.scheduleReconnect();
    });
  }

  private handleMessage(event: MessageEvent): void {
    const message = JSON.parse(String(event.data)) as RealtimeMessage;
    if (!this.acceptSeq(message)) return;
    this.handlers.forEach((handler) => handler(message));

    if (message.type !== 'gateway.draining') return;
    const payload = message.payload as { retryAfterMs?: number } | undefined;
    const retryAfterMs = Number(payload?.retryAfterMs ?? 0);
    this.scheduleReconnect(Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0);
    this.socket?.close();
  }

  private acceptSeq(message: RealtimeMessage): boolean {
    if (typeof message.seq !== 'number' || message.seq <= 0) return true;
    if (message.seq <= this.lastSeq) return false;
    this.lastSeq = message.seq;
    this.persistLastSeq();
    return true;
  }

  private persistLastSeq(): void {
    if (!this.options.storage) return;
    try {
      this.options.storage.setItem(realtimeLastSeqStorageKey(this.options.roomId), String(this.lastSeq));
    } catch {
      // Storage can fail in private modes. Keep the in-memory cursor for this session.
    }
  }

  private scheduleReconnect(minDelayMs = 0): void {
    if (this.manualClosed || this.reconnectTimer !== undefined) return;
    const delay = Math.max(minDelayMs, this.nextReconnectDelay());
    const setTimeoutFn =
      this.options.reconnect?.setTimeout ?? ((handler: () => void, timeoutMs: number) => window.setTimeout(handler, timeoutMs));
    this.reconnectTimer = setTimeoutFn(() => {
      this.reconnectTimer = undefined;
      this.openSocket();
    }, delay);
  }

  private nextReconnectDelay(): number {
    const delay = nextNativeReconnectDelay(
      this.retryCount,
      this.options.reconnect?.random ?? Math.random,
      this.options.reconnect?.baseDelayMs,
      this.options.reconnect?.maxDelayMs,
      this.options.reconnect?.maxJitterMs
    );
    this.retryCount += 1;
    return delay;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === undefined) return;
    const clearTimeoutFn =
      this.options.reconnect?.clearTimeout ?? ((timer: NativeReconnectTimer) => window.clearTimeout(timer as number));
    clearTimeoutFn(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}

export class MockRealtimeControlClient implements RealtimeClient {
  private socket?: WebSocket;
  private handlers = new Set<MessageHandler>();
  private closeWhenOpen = false;

  constructor(private readonly options: MockControlOptions) {}

  connect(): void {
    const url = new URL(this.options.url);
    url.searchParams.set('room', this.options.roomId);
    this.socket = new WebSocket(url.toString());
    this.closeWhenOpen = false;
    this.socket.addEventListener('open', () => {
      if (!this.closeWhenOpen) return;
      this.socket?.close();
      this.socket = undefined;
    });
    this.socket.addEventListener('message', (event) => {
      const data = JSON.parse(String(event.data)) as RealtimeMessage | { messages?: RealtimeMessage[] };
      const messages = Array.isArray((data as { messages?: RealtimeMessage[] }).messages)
        ? ((data as { messages: RealtimeMessage[] }).messages)
        : [data as RealtimeMessage];
      messages.forEach((message) => {
        this.handlers.forEach((handler) => handler(message));
      });
    });
  }

  disconnect(): void {
    this.handlers.clear();
    if (!this.socket) return;
    if (this.socket.readyState === WebSocket.CONNECTING) {
      this.closeWhenOpen = true;
      return;
    }
    this.socket.close();
    this.socket = undefined;
  }

  send(): void {
    // Development control bridge is receive-only from the browser's perspective.
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
