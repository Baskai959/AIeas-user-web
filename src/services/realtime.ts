import { validateBidPrice } from './bidding';
import type { LiveChatMessage } from './types';

export interface RealtimeMessage<TPayload = unknown> {
  type: string;
  requestId?: string;
  seq?: number;
  ack?: boolean;
  liveSessionId?: number;
  payload: TPayload;
}

export interface BidInput {
  auctionId: string | number;
  price: number;
  expectedCurrentPrice: number;
}

export interface ChatSendInput {
  roomId: string;
  content: string;
  clientMessageId: string;
}

export type MessageHandler = (message: RealtimeMessage) => void;
type NativeReconnectTimer = number | ReturnType<typeof setTimeout>;
export type RealtimeSeqDomain = 'bid' | 'room';
export type RealtimeSeqCursor = Partial<Record<RealtimeSeqDomain, number>>;

export interface RealtimeClient {
  connect(): void;
  disconnect(): void;
  send(message: RealtimeMessage): boolean;
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
  userNickname?: string;
  userAvatarUrl?: string;
  participantCount?: number;
  onlineCount?: number;
  capPrice?: number;
}

interface NativeOptions {
  baseUrl: string;
  roomId: string;
  auctionId?: string;
  accessToken?: string;
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

interface BackendRankingEntry {
  rank: number;
  bidderId: string;
  bidderNickname: string;
  bidderAvatarUrl?: string;
  bidder_avatar_url?: string;
  price: number;
}

export function buildLiveRoomWsUrl(baseUrl: string, roomId: string, lastSeq?: number, accessToken?: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  if (lastSeq !== undefined) params.set('lastSeq', String(lastSeq));
  if (accessToken) params.set('token', accessToken);
  const query = params.toString() ? `?${params.toString()}` : '';
  return `${base}/ws/live-rooms/${encodeURIComponent(roomId)}${query}`;
}

export function realtimeLastSeqStorageKey(roomId: string, auctionId: string): string {
  return `live-room:${roomId}:auction:${auctionId}:lastSeq`;
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

function readStoredLastSeq(roomId: string, auctionId: string | undefined, storage?: Storage): number {
  if (!storage || !auctionId) return 0;
  try {
    const raw = storage.getItem(realtimeLastSeqStorageKey(roomId, auctionId));
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

export function realtimeMessageSeqDomain(message: Pick<RealtimeMessage, 'type' | 'seq'>): RealtimeSeqDomain | undefined {
	if (typeof message.seq !== 'number' || message.seq <= 0) return undefined;
	return message.type === 'bid.accepted' || message.type === 'bid.accept' || message.type === 'bid.rejected' ? 'bid' : 'room';
}

export function isFreshRealtimeMessageByDomain(message: Pick<RealtimeMessage, 'type' | 'seq'>, cursor: RealtimeSeqCursor): boolean {
	const domain = realtimeMessageSeqDomain(message);
	if (!domain) return true;
	return Number(message.seq) > (cursor[domain] ?? 0);
}

export function nextRealtimeSeqByDomain(message: Pick<RealtimeMessage, 'type' | 'seq'>, cursor: RealtimeSeqCursor): RealtimeSeqCursor {
	const domain = realtimeMessageSeqDomain(message);
	if (!domain) return cursor;
	const seq = Number(message.seq);
	if (!Number.isFinite(seq) || seq <= (cursor[domain] ?? 0)) return cursor;
	return {
		...cursor,
		[domain]: seq
	};
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
  private extendCount = 0;
  private simulatedCompetitorBidCount = 0;
  private competitorCursor = 5;
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
          endTime: new Date(this.endTsMs + 10_000).toISOString(),
          extendCount: this.extendCount + 1,
          serverTime: new Date().toISOString()
        }
      });
      this.endTsMs += 10_000;
      this.extendCount += 1;
      this.schedule(10, () => this.closeAuction());
    });
  }

  disconnect(): void {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers = [];
    this.handlers.clear();
  }

  send(message: RealtimeMessage): boolean {
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
      return true;
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
      return true;
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
      return true;
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
      return true;
    }

    if (message.type === 'chat.send') {
      this.handleChatSend(message);
      return true;
    }

    if (message.type !== 'bid.place') return false;

    const bid = message.payload as unknown as BidInput;
    const validation = validateBidPrice(Number(bid.price), {
      currentPrice: this.currentPrice,
      minIncrement: this.options.minIncrement,
      capPrice: this.options.capPrice
    });

    if (this.closed || String(bid.auctionId) !== this.options.auctionId || !validation.valid) {
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
      return true;
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
          event: 'bid.accepted',
          endTime: new Date(this.endTsMs).toISOString(),
          serverTime: new Date().toISOString()
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
          bidderAvatarUrl: this.currentUserAvatarUrl(),
          price: this.currentPrice,
          accepted: true,
          currentPrice: this.currentPrice,
          leaderBidderId: this.options.userId,
          bidCount: this.bidCount,
          participantCount: this.participantCount,
          endTime: new Date(this.endTsMs).toISOString(),
          extendCount: this.extendCount,
          seq: this.seq,
          event: 'bid.accepted',
          serverTime: new Date().toISOString()
        }
      });
      this.emitRanking();
      if (this.options.capPrice !== undefined && this.currentPrice >= this.options.capPrice) {
        this.schedule(200, () => this.closeAuction());
      } else {
        this.schedule(1_200, () => this.emitSimulatedCompetitorBid());
      }
    });
    return true;
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
        ranking: this.ranking()
      }
    });
  }

  private emitSimulatedCompetitorBid(): void {
    if (this.closed || this.simulatedCompetitorBidCount > 0 || this.leaderBidderId !== this.options.userId) return;
    const requestedPrice = this.currentPrice + this.options.minIncrement;
    const nextPrice = this.options.capPrice === undefined ? requestedPrice : Math.min(requestedPrice, this.options.capPrice);
    if (nextPrice <= this.currentPrice) return;

    const bidderId = this.nextCompetitorBidderId();
    this.simulatedCompetitorBidCount += 1;
    this.currentPrice = nextPrice;
    this.leaderBidderId = bidderId;
    this.bidCount += 1;
    this.participantCount = Math.max(this.participantCount, 2);

    this.emit({
      type: 'bid.accepted',
      requestId: `mock-competitor-bid-${this.simulatedCompetitorBidCount}`,
      payload: {
        auctionId: this.options.auctionId,
        bidId: `bid_${this.seq}`,
        bidderId,
        bidderNickname: this.mockBidderNickname(bidderId),
        bidderAvatarUrl: this.mockBidderAvatarUrl(bidderId),
        price: this.currentPrice,
        accepted: true,
        currentPrice: this.currentPrice,
        leaderBidderId: bidderId,
        bidCount: this.bidCount,
        participantCount: this.participantCount,
        endTime: new Date(this.endTsMs).toISOString(),
        extendCount: this.extendCount,
        seq: this.seq,
        event: 'bid.accepted',
        serverTime: new Date().toISOString()
      }
    });
    this.emitRanking();

    if (this.options.capPrice !== undefined && this.currentPrice >= this.options.capPrice) {
      this.schedule(200, () => this.closeAuction());
    }
  }

  private closeAuction(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit({
      type: 'auction.closed',
      payload: {
        auctionId: this.options.auctionId,
        status: 'CLOSED_WON',
        winnerId: this.leaderBidderId,
        price: this.currentPrice,
        orderId: 'ord_2001',
        closedAt: new Date().toISOString(),
        serverTime: new Date().toISOString()
      }
    });
    this.emit({
      type: 'live_session.ended',
      payload: {
        liveSessionId: this.options.liveSessionId,
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

  private ranking(): BackendRankingEntry[] {
    const leaderIsUser = this.leaderBidderId === this.options.userId;
    const currentUserRankingName = this.currentUserRankingName();
    const items: BackendRankingEntry[] = [
      {
        rank: 1,
        bidderId: this.leaderBidderId,
        bidderNickname: leaderIsUser ? currentUserRankingName : this.mockBidderNickname(this.leaderBidderId),
        bidderAvatarUrl: leaderIsUser ? this.currentUserAvatarUrl() : this.mockBidderAvatarUrl(this.leaderBidderId),
        price: this.currentPrice
      }
    ];
    const competitorIds = this.mockCompetitorIds().filter((bidderId) => bidderId !== this.leaderBidderId && bidderId !== this.options.userId);
    const visibleCompetitorCount = leaderIsUser ? 8 : 7;
    competitorIds.slice(0, visibleCompetitorCount).forEach((bidderId, index) => {
      const rank = index + 2;
      items.push({
        rank,
        bidderId,
        bidderNickname: this.mockBidderNickname(bidderId),
        bidder_avatar_url: this.mockBidderAvatarUrl(bidderId),
        price: Math.max(0, this.currentPrice - this.options.minIncrement * (rank - 1))
      });
    });
    if (!leaderIsUser) {
      items.push({
        rank: 9,
        bidderId: this.options.userId,
        bidderNickname: currentUserRankingName,
        bidderAvatarUrl: this.currentUserAvatarUrl(),
        price: Math.max(0, this.currentPrice - this.options.minIncrement * 8)
      });
    }
    return items;
  }

  private nextCompetitorBidderId(): string {
    const candidates = this.mockCompetitorIds().filter((bidderId) => bidderId !== this.options.userId);
    const bidderId = candidates[this.competitorCursor % candidates.length] ?? 'u5';
    this.competitorCursor += 1;
    return bidderId;
  }

  private mockCompetitorIds(): string[] {
    return ['u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11', 'u12'];
  }

  private mockBidderNickname(bidderId: string): string {
    const numericId = bidderId.match(/^u(\d+)$/i)?.[1];
    if (numericId) return `用户**${numericId.padStart(2, '0')}`;
    const suffix = bidderId.replace(/[^\p{L}\p{N}]/gu, '').slice(-2).toUpperCase();
    return suffix ? `用户**${suffix}` : '用户**';
  }

  private mockBidderAvatarUrl(bidderId: string): string | undefined {
    const digits = Number(bidderId.replace(/\D/g, ''));
    return Number.isFinite(digits) && digits % 2 === 0 ? '/logo.png' : undefined;
  }

  private currentUserRankingName(): string {
    const nickname = this.options.userNickname?.trim();
    if (nickname) return nickname;
    const suffix = this.options.userId.replace(/[^\p{L}\p{N}]/gu, '').slice(-2).toUpperCase();
    return suffix ? `用户**${suffix}` : '用户**';
  }

  private currentUserAvatarUrl(): string | undefined {
    const avatarUrl = this.options.userAvatarUrl?.trim();
    return avatarUrl || undefined;
  }
}

export class NativeWebSocketClient implements RealtimeClient {
  private socket?: WebSocket;
	private handlers = new Set<MessageHandler>();
	private lastSeq: number;
	private seqCursor: RealtimeSeqCursor = {};
	private retryCount = 0;
	private manualClosed = true;
	private reconnectTimer?: NativeReconnectTimer;

  constructor(private readonly options: NativeOptions) {
    this.lastSeq = Math.max(options.lastSeq ?? 0, readStoredLastSeq(options.roomId, options.auctionId, options.storage));
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

  send(message: RealtimeMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
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
      buildLiveRoomWsUrl(this.options.baseUrl, this.options.roomId, this.lastSeq > 0 ? this.lastSeq : undefined, this.options.accessToken)
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
		if (!isFreshRealtimeMessageByDomain(message, this.seqCursor)) return false;
		this.seqCursor = nextRealtimeSeqByDomain(message, this.seqCursor);
		if (realtimeMessageSeqDomain(message) === 'bid' && typeof message.seq === 'number' && message.seq > 0) {
			this.lastSeq = message.seq;
			this.persistLastSeq();
		}
		return true;
	}

  private persistLastSeq(): void {
    if (!this.options.storage || !this.options.auctionId) return;
    try {
      this.options.storage.setItem(realtimeLastSeqStorageKey(this.options.roomId, this.options.auctionId), String(this.lastSeq));
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

  send(): boolean {
    // Development control bridge is receive-only from the browser's perspective.
    return false;
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
