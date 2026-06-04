import { describe, expect, it, vi } from 'vitest';
import { buildLiveSessionWsUrl, isFreshRealtimeMessage, MockRealtimeClient, MockRealtimeControlClient } from './realtime';

describe('realtime', () => {
  it('builds the live-session WebSocket URL with lastSeq recovery', () => {
    expect(buildLiveSessionWsUrl('ws://127.0.0.1:8888', '9001', 18)).toBe(
      'ws://127.0.0.1:8888/ws/live-sessions/9001?lastSeq=18'
    );
  });

  it('drops duplicate and out-of-order sequenced messages', () => {
    expect(isFreshRealtimeMessage({ type: 'bid.accepted', seq: 12, payload: {} }, 11)).toBe(true);
    expect(isFreshRealtimeMessage({ type: 'bid.accepted', seq: 12, payload: {} }, 12)).toBe(false);
    expect(isFreshRealtimeMessage({ type: 'bid.accepted', seq: 9, payload: {} }, 12)).toBe(false);
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
        const payload = message.payload as { items: Array<{ price: number }> };
        rankingPrices.push(...payload.items.map((item) => item.price));
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
