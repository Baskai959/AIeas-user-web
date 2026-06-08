import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLiveRoomWsUrl,
  isFreshRealtimeMessage,
  isFreshRealtimeMessageByDomain,
  MockRealtimeClient,
  MockRealtimeControlClient,
  NativeWebSocketClient,
  nextNativeReconnectDelay,
  nextRealtimeSeqByDomain,
  realtimeLastSeqStorageKey,
  realtimeMessageSeqDomain
} from './realtime';

function createFakeWebSocketHarness() {
  type Listener = (event?: { data?: string }) => void;
  const sockets: Array<{
    url: string;
    closed: boolean;
    readyState: number;
    sent: string[];
    listeners: Record<string, Listener[]>;
    addEventListener: (type: string, handler: Listener) => void;
    send: (payload: string) => void;
    open: () => void;
    close: () => void;
    emit: (message: unknown) => void;
  }> = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    url: string;
    readyState = FakeWebSocket.CONNECTING;
    closed = false;
    sent: string[] = [];
    listeners: Record<string, Listener[]> = {};

    constructor(url: string) {
      this.url = url;
      sockets.push(this);
    }

    addEventListener(type: string, handler: Listener) {
      this.listeners[type] = [...(this.listeners[type] ?? []), handler];
    }

    send(payload: string) {
      if (this.readyState !== FakeWebSocket.OPEN) throw new Error('socket not open');
      this.sent.push(payload);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.listeners.open?.forEach((handler) => handler());
    }

    close() {
      if (this.closed) return;
      this.readyState = FakeWebSocket.CLOSED;
      this.closed = true;
      this.listeners.close?.forEach((handler) => handler());
    }

    emit(message: unknown) {
      this.listeners.message?.forEach((handler) => handler({ data: JSON.stringify(message) }));
    }
  }

  vi.stubGlobal('WebSocket', FakeWebSocket);
  return { sockets };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('realtime', () => {
  it('builds the live-room WebSocket URL with lastSeq recovery', () => {
    expect(buildLiveRoomWsUrl('ws://127.0.0.1:8888', '9001', 18)).toBe(
      'ws://127.0.0.1:8888/ws/live-rooms/9001?lastSeq=18'
    );
  });

  it('adds access token to live-room WebSocket URL when provided', () => {
    expect(buildLiveRoomWsUrl('ws://127.0.0.1:8888', '9001', 18, 'jwt.token')).toBe(
      'ws://127.0.0.1:8888/ws/live-rooms/9001?lastSeq=18&token=jwt.token'
    );
  });

  it('drops duplicate and out-of-order sequenced messages', () => {
    expect(isFreshRealtimeMessage({ type: 'bid.accepted', seq: 12, payload: {} }, 11)).toBe(true);
    expect(isFreshRealtimeMessage({ type: 'bid.accepted', seq: 12, payload: {} }, 12)).toBe(false);
    expect(isFreshRealtimeMessage({ type: 'bid.accepted', seq: 9, payload: {} }, 12)).toBe(false);
  });

  it('tracks realtime seq independently for bid and room event streams', () => {
    let cursor = nextRealtimeSeqByDomain({ type: 'room.online', seq: 12, payload: {} }, {});
    expect(isFreshRealtimeMessageByDomain({ type: 'bid.accepted', seq: 1, payload: {} }, cursor)).toBe(true);
    cursor = nextRealtimeSeqByDomain({ type: 'bid.accepted', seq: 1, payload: {} }, cursor);
    expect(isFreshRealtimeMessageByDomain({ type: 'ranking.updated', seq: 13, payload: {} }, cursor)).toBe(true);
    expect(isFreshRealtimeMessageByDomain({ type: 'bid.accepted', seq: 1, payload: {} }, cursor)).toBe(false);
    expect(isFreshRealtimeMessageByDomain({ type: 'bid.accepted', seq: 2, payload: {} }, cursor)).toBe(true);
  });

  it('treats bid.result as a point-to-point frame that does not occupy room seq dedup', () => {
    // bid.result 幂等由 bidId 保证，不应按房间/出价 seq 去重，避免重发被误丢弃。
    expect(realtimeMessageSeqDomain({ type: 'bid.result', seq: 5 })).toBeUndefined();
    const cursor = nextRealtimeSeqByDomain({ type: 'room.online', seq: 99, payload: {} }, {});
    expect(isFreshRealtimeMessageByDomain({ type: 'bid.result', seq: 1, payload: {} }, cursor)).toBe(true);
    // 同一帧重复到达也视为 fresh（不占 seq），由上层按 bidId 幂等处理。
    expect(isFreshRealtimeMessageByDomain({ type: 'bid.result', seq: 1, payload: {} }, cursor)).toBe(true);
  });

  it('calculates native reconnect delay with exponential backoff and jitter', () => {
    expect(nextNativeReconnectDelay(0, () => 0)).toBe(500);
    expect(nextNativeReconnectDelay(2, () => 0.5)).toBe(2500);
    expect(nextNativeReconnectDelay(20, () => 0)).toBe(10_000);
  });

  it('persists native WebSocket lastSeq and drops duplicate replayed messages', () => {
    const { sockets } = createFakeWebSocketHarness();
    const client = new NativeWebSocketClient({
      baseUrl: 'ws://127.0.0.1:8080',
      roomId: 'room_1001',
      auctionId: 'auc_2001',
      storage: window.localStorage
    });
    const seen: string[] = [];
    client.onMessage((message) => seen.push(message.type));

    client.connect();
    sockets[0].open();
    sockets[0].emit({ type: 'bid.accepted', seq: 12, payload: { auctionId: 'auc_2001' } });
    sockets[0].emit({ type: 'ranking.updated', seq: 12, payload: { auctionId: 'auc_2001', ranking: [] } });
    sockets[0].emit({ type: 'timer.extended', seq: 9, payload: { auctionId: 'auc_2001' } });
    sockets[0].emit({ type: 'room.online', seq: 13, payload: { roomId: 'room_1001', count: 328 } });

    expect(seen).toEqual(['bid.accepted', 'ranking.updated', 'room.online']);
    expect(window.localStorage.getItem(realtimeLastSeqStorageKey('room_1001', 'auc_2001'))).toBe('12');
    client.disconnect();
  });

  it('does not let room seq collisions block native bid.accepted messages', () => {
    const { sockets } = createFakeWebSocketHarness();
    const client = new NativeWebSocketClient({
      baseUrl: 'ws://127.0.0.1:8080',
      roomId: 'room_1001',
      auctionId: 'auc_2001',
      storage: window.localStorage
    });
    const seen: string[] = [];
    client.onMessage((message) => seen.push(message.type));

    client.connect();
    sockets[0].open();
    sockets[0].emit({ type: 'room.online', seq: 1, payload: { roomId: 'room_1001', count: 328 } });
    sockets[0].emit({ type: 'bid.accepted', seq: 1, payload: { auctionId: 'auc_2001', currentPrice: 1100 } });
    sockets[0].emit({ type: 'ranking.updated', seq: 2, payload: { auctionId: 'auc_2001', ranking: [] } });
    sockets[0].emit({ type: 'bid.accepted', seq: 2, payload: { auctionId: 'auc_2001', currentPrice: 1200 } });

    expect(seen).toEqual(['room.online', 'bid.accepted', 'ranking.updated', 'bid.accepted']);
    expect(window.localStorage.getItem(realtimeLastSeqStorageKey('room_1001', 'auc_2001'))).toBe('2');
    client.disconnect();
  });

  it('keeps native WebSocket lastSeq scoped by auction so a new lot can receive low seq bid events', () => {
    window.localStorage.setItem(realtimeLastSeqStorageKey('room_1001', 'auc_old'), '88');
    const { sockets } = createFakeWebSocketHarness();
    const client = new NativeWebSocketClient({
      baseUrl: 'ws://127.0.0.1:8080',
      roomId: 'room_1001',
      auctionId: 'auc_new',
      storage: window.localStorage
    });
    const seen: string[] = [];
    client.onMessage((message) => seen.push(message.type));

    client.connect();
    expect(sockets[0].url).toBe('ws://127.0.0.1:8080/ws/live-rooms/room_1001');
    sockets[0].open();
    sockets[0].emit({ type: 'bid.accepted', seq: 1, payload: { auctionId: 'auc_new', currentPrice: 1100 } });

    expect(seen).toEqual(['bid.accepted']);
    expect(window.localStorage.getItem(realtimeLastSeqStorageKey('room_1001', 'auc_new'))).toBe('1');
    client.disconnect();
  });

  it('reports whether native WebSocket messages were actually sent', () => {
    const { sockets } = createFakeWebSocketHarness();
    const client = new NativeWebSocketClient({
      baseUrl: 'ws://127.0.0.1:8080',
      roomId: 'room_1001',
      storage: window.localStorage
    });

    expect(client.send({ type: 'bid.place', requestId: 'bid-before-connect', payload: { auctionId: 1001, price: 1100 } })).toBe(false);
    client.connect();
    expect(client.send({ type: 'bid.place', requestId: 'bid-connecting', payload: { auctionId: 1001, price: 1100 } })).toBe(false);

    sockets[0].open();
    expect(client.send({ type: 'bid.place', requestId: 'bid-open', payload: { auctionId: 1001, price: 1100 } })).toBe(true);
    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      type: 'bid.place',
      requestId: 'bid-open',
      payload: { auctionId: 1001, price: 1100 }
    });

    sockets[0].close();
    expect(client.send({ type: 'bid.place', requestId: 'bid-closed', payload: { auctionId: 1001, price: 1100 } })).toBe(false);
    client.disconnect();
  });

  it('reconnects native WebSocket with persisted lastSeq after close and gateway draining', async () => {
    vi.useFakeTimers();
    const { sockets } = createFakeWebSocketHarness();
    const client = new NativeWebSocketClient({
      baseUrl: 'ws://127.0.0.1:8080/',
      roomId: 'room_1001',
      auctionId: 'auc_2001',
      storage: window.localStorage,
      reconnect: {
        random: () => 0
      }
    });

    client.connect();
    sockets[0].open();
    sockets[0].emit({ type: 'bid.accepted', seq: 21, payload: { auctionId: 'auc_2001' } });
    sockets[0].close();
    await vi.advanceTimersByTimeAsync(499);
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toBe('ws://127.0.0.1:8080/ws/live-rooms/room_1001?lastSeq=21');

    sockets[1].open();
    sockets[1].emit({ type: 'gateway.draining', payload: { retryAfterMs: 5000 } });
    expect(sockets[1].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
    expect(sockets[2].url).toBe('ws://127.0.0.1:8080/ws/live-rooms/room_1001?lastSeq=21');

    client.disconnect();
  });

  it('emits live-room online, heartbeat, bid, ranking, snapshot-required, and close events in mock mode', async () => {
    vi.useFakeTimers();
    const client = new MockRealtimeClient({
      roomId: 'room_1001',
      auctionId: 'auc_2001',
      liveSessionId: 9001,
      currentPrice: 150100,
      minIncrement: 100,
      endTsMs: Date.now() + 6_000,
      userId: 'u1',
      participantCount: 128,
      onlineCount: 328
    });
    const seen: string[] = [];
    const rankingPrices: number[] = [];
    client.onMessage((message) => {
      seen.push(message.type);
      if (message.type === 'ranking.updated') {
        const payload = message.payload as { ranking: Array<{ price: number }> };
        rankingPrices.push(...payload.ranking.map((item) => item.price));
      }
    });

    client.connect();
    client.send({ type: 'heartbeat', requestId: 'hb-1', payload: { ts: 1 } });
    client.send({ type: 'room.subscribe', requestId: 'sub-1', payload: { auctionId: 'auc_2001' } });
    client.send({ type: 'bid.place', requestId: 'bid-1', payload: { auctionId: 'auc_2001', price: 150200 } });
    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(6_000);
    await vi.runOnlyPendingTimersAsync();

    expect(seen).toEqual(
      expect.arrayContaining([
        'room.subscribed',
        'room.online',
        'heartbeat.ack',
        'bid.ack',
        'bid.accepted',
        'ranking.updated',
        'room.snapshot_required',
        'auction.closed',
        'live_session.ended'
      ])
    );
    expect(rankingPrices).toContain(150200);
    vi.useRealTimers();
  });

  it('emits chat acknowledgement and broadcast messages in mock mode', async () => {
    vi.useFakeTimers();
    const client = new MockRealtimeClient({
      roomId: 'room_1001',
      auctionId: 'auc_2001',
      liveSessionId: 9001,
      currentPrice: 150100,
      minIncrement: 100,
      endTsMs: Date.now() + 6_000,
      userId: 'u1',
      participantCount: 128,
      onlineCount: 328
    });
    const seen: Array<{ type: string; payload: unknown }> = [];
    client.onMessage((message) => {
      seen.push({ type: message.type, payload: message.payload });
    });

    client.send({
      type: 'chat.send',
      requestId: 'chat-1',
      payload: { roomId: 'room_1001', content: '这件很漂亮', clientMessageId: 'client-chat-1' }
    });
    await vi.runOnlyPendingTimersAsync();

    expect(seen.map((item) => item.type)).toEqual(expect.arrayContaining(['chat.ack', 'chat.message']));
    expect(seen.find((item) => item.type === 'chat.message')?.payload).toEqual(
      expect.objectContaining({ roomId: 'room_1001', content: '这件很漂亮', clientMessageId: 'client-chat-1' })
    );
    vi.useRealTimers();
  });

  it('receives injected mock-control messages from the development control bridge', () => {
    const sockets: Array<{
      url: string;
      closed: boolean;
      listeners: Record<string, Array<(event: { data: string }) => void>>;
      addEventListener: (type: string, handler: (event: { data: string }) => void) => void;
      close: () => void;
      emit: (message: unknown) => void;
    }> = [];

    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      url: string;
      readyState = FakeWebSocket.OPEN;
      closed = false;
      listeners: Record<string, Array<(event: { data: string }) => void>> = {};

      constructor(url: string) {
        this.url = url;
        sockets.push(this);
      }

      addEventListener(type: string, handler: (event: { data: string }) => void) {
        this.listeners[type] = [...(this.listeners[type] ?? []), handler];
      }

      close() {
        this.closed = true;
      }

      emit(message: unknown) {
        this.listeners.message?.forEach((handler) => handler({ data: JSON.stringify(message) }));
      }
    }

    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = new MockRealtimeControlClient({ url: 'ws://127.0.0.1:4578/control', roomId: 'room_1001' });
    const seen: string[] = [];
    client.onMessage((message) => seen.push(message.type));

    client.connect();
    expect(sockets[0].url).toBe('ws://127.0.0.1:4578/control?room=room_1001');
    sockets[0].emit({ type: 'chat.message', payload: { roomId: 'room_1001', content: 'Injected', nickname: 'Tester' } });
    sockets[0].emit({ messages: [{ type: 'bid.accepted', payload: { auctionId: 'auc_2001', price: 188800 } }] });

    expect(seen).toEqual(['chat.message', 'bid.accepted']);
    client.disconnect();
    expect(sockets[0].closed).toBe(true);
  });

  it('does not close a connecting mock-control socket before it opens', () => {
    const sockets: Array<{
      url: string;
      closed: boolean;
      readyState: number;
      listeners: Record<string, Array<() => void>>;
      addEventListener: (type: string, handler: () => void) => void;
      close: () => void;
      open: () => void;
    }> = [];

    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      url: string;
      readyState = FakeWebSocket.CONNECTING;
      closed = false;
      listeners: Record<string, Array<() => void>> = {};

      constructor(url: string) {
        this.url = url;
        sockets.push(this);
      }

      addEventListener(type: string, handler: () => void) {
        this.listeners[type] = [...(this.listeners[type] ?? []), handler];
      }

      close() {
        this.closed = true;
      }

      open() {
        this.readyState = FakeWebSocket.OPEN;
        this.listeners.open?.forEach((handler) => handler());
      }
    }

    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = new MockRealtimeControlClient({ url: 'ws://127.0.0.1:4578/control', roomId: 'room_1001' });
    client.connect();
    client.disconnect();

    expect(sockets[0].closed).toBe(false);
    sockets[0].open();
    expect(sockets[0].closed).toBe(true);
  });
});
