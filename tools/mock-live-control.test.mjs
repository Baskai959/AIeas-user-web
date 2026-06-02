import { describe, expect, it } from 'vitest';
import { buildMockLiveControlMessages, parseMockLiveControlArgs } from './mock-live-control.mjs';

describe('mock live control CLI', () => {
  it('parses serve and command arguments', () => {
    expect(parseMockLiveControlArgs(['serve', '--port', '4580'])).toEqual({
      command: 'serve',
      port: 4580
    });

    expect(parseMockLiveControlArgs(['bid', '--room', 'room_1001', '--auction', 'auc_2001', '--price', '188800', '--nickname', '用户**88'])).toMatchObject({
      command: 'bid',
      roomId: 'room_1001',
      auctionId: 'auc_2001',
      price: 188800,
      nickname: '用户**88'
    });
  });

  it('builds bid, chat, system, timer, online, and close realtime messages', () => {
    const now = 1_780_000_000_000;

    expect(buildMockLiveControlMessages({ command: 'bid', roomId: 'room_1001', auctionId: 'auc_2001', price: 188800, nickname: '用户**88' }, now).messages.map((message) => message.type)).toEqual(['bid.accepted', 'ranking.updated']);
    expect(buildMockLiveControlMessages({ command: 'chat', roomId: 'room_1001', nickname: '用户**88', text: '这件不错' }, now).messages[0]).toMatchObject({
      type: 'chat.message',
      payload: { roomId: 'room_1001', nickname: '用户**88', content: '这件不错' }
    });
    expect(buildMockLiveControlMessages({ command: 'system', roomId: 'room_1001', text: '系统提示' }, now).messages[0]).toMatchObject({
      type: 'chat.message',
      payload: { roomId: 'room_1001', system: true, content: '系统提示' }
    });
    expect(buildMockLiveControlMessages({ command: 'timer', roomId: 'room_1001', auctionId: 'auc_2001', endIn: 30 }, now).messages[0]).toMatchObject({
      type: 'timer.extended',
      payload: { auctionId: 'auc_2001', newEndTsMs: now + 30_000 }
    });
    expect(buildMockLiveControlMessages({ command: 'online', roomId: 'room_1001', count: 520 }, now).messages[0]).toMatchObject({
      type: 'room.online',
      payload: { online: 520 }
    });
    expect(buildMockLiveControlMessages({ command: 'close', roomId: 'room_1001', auctionId: 'auc_2001', price: 188800 }, now).messages[0]).toMatchObject({
      type: 'auction.closed',
      payload: { auctionId: 'auc_2001', finalPrice: 188800 }
    });
  });
});
