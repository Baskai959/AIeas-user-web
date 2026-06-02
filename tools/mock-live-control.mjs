#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const defaultPort = 4578;
const defaultHost = '127.0.0.1';
const defaultUserId = 'mock_bidder';

export function parseMockLiveControlArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = rest[index + 1];
    index += 1;
    if (key === 'port') options.port = Number(value);
    if (key === 'host') options.host = value;
    if (key === 'url') options.url = value;
    if (key === 'room') options.roomId = value;
    if (key === 'auction') options.auctionId = value;
    if (key === 'price') options.price = Number(value);
    if (key === 'nickname') options.nickname = value;
    if (key === 'text') options.text = value;
    if (key === 'end-in') options.endIn = Number(value);
    if (key === 'count') options.count = Number(value);
  }
  if (command === 'serve') {
    return {
      command,
      host: options.host,
      port: Number.isFinite(options.port) ? options.port : defaultPort
    };
  }
  return {
    command,
    host: options.host,
    port: Number.isFinite(options.port) ? options.port : defaultPort,
    url: options.url,
    roomId: options.roomId,
    auctionId: options.auctionId,
    price: options.price,
    nickname: options.nickname,
    text: options.text,
    endIn: options.endIn,
    count: options.count
  };
}

export function buildMockLiveControlMessages(options, now = Date.now()) {
  const roomId = requireValue(options.roomId, '--room');
  const seqBase = now;
  if (options.command === 'bid') {
    const auctionId = requireValue(options.auctionId, '--auction');
    const price = requireNumber(options.price, '--price');
    const nickname = options.nickname ?? '用户**88';
    const bidderId = `mock_bidder_${String(now).slice(-6)}`;
    return {
      roomId,
      messages: [
        {
          type: 'bid.accepted',
          seq: seqBase,
          payload: {
            auctionId,
            bidId: `mock_bid_${now}`,
            bidderId,
            price,
            bidTsMs: now,
            currentPrice: price,
            leaderBidderId: bidderId,
            bidCount: undefined,
            participantCount: undefined,
            endTsMs: undefined
          }
        },
        {
          type: 'ranking.updated',
          seq: seqBase + 1,
          payload: {
            auctionId,
            items: [
              {
                rank: 1,
                bidderId,
                nicknameMask: nickname,
                price,
                bidTsMs: now
              }
            ]
          }
        }
      ]
    };
  }

  if (options.command === 'chat' || options.command === 'system') {
    const content = requireValue(options.text, '--text');
    const system = options.command === 'system';
    return {
      roomId,
      messages: [
        {
          type: 'chat.message',
          seq: seqBase,
          payload: {
            id: `mock_msg_${now}`,
            roomId,
            userId: system ? 'system' : defaultUserId,
            nickname: system ? 'System' : (options.nickname ?? '用户**88'),
            content,
            createdAt: new Date(now).toISOString(),
            system
          }
        }
      ]
    };
  }

  if (options.command === 'timer') {
    const auctionId = requireValue(options.auctionId, '--auction');
    const endIn = requireNumber(options.endIn, '--end-in');
    return {
      roomId,
      messages: [
        {
          type: 'timer.extended',
          seq: seqBase,
          payload: {
            auctionId,
            reason: 'MOCK_CONTROL',
            newEndTsMs: now + endIn * 1000,
            extendMs: endIn * 1000
          }
        }
      ]
    };
  }

  if (options.command === 'online') {
    return {
      roomId,
      messages: [
        {
          type: 'room.online',
          seq: seqBase,
          payload: {
            online: requireNumber(options.count, '--count')
          }
        }
      ]
    };
  }

  if (options.command === 'close') {
    const auctionId = requireValue(options.auctionId, '--auction');
    const price = requireNumber(options.price, '--price');
    return {
      roomId,
      messages: [
        {
          type: 'auction.closed',
          seq: seqBase,
          payload: {
            auctionId,
            status: 'CLOSED_WON',
            winnerBidderId: defaultUserId,
            finalPrice: price,
            orderId: 'ord_2001',
            closedTsMs: now
          }
        }
      ]
    };
  }

  throw new Error(`Unsupported command: ${options.command}`);
}

export function serveMockLiveControl({ host = defaultHost, port = defaultPort } = {}) {
  const server = new WebSocketServer({ host, port });
  const controlsByRoom = new Map();

  server.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '/', `ws://${request.headers.host ?? `${host}:${port}`}`);
    if (url.pathname === '/control') {
      const roomId = url.searchParams.get('room');
      if (!roomId) {
        socket.close(1008, 'room is required');
        return;
      }
      const sockets = controlsByRoom.get(roomId) ?? new Set();
      sockets.add(socket);
      controlsByRoom.set(roomId, sockets);
      socket.on('close', () => {
        sockets.delete(socket);
        if (sockets.size === 0) controlsByRoom.delete(roomId);
      });
      return;
    }

    if (url.pathname === '/emit') {
      socket.on('message', (raw) => {
        try {
          const envelope = JSON.parse(String(raw));
          const roomId = String(envelope.roomId ?? '');
          const messages = Array.isArray(envelope.messages) ? envelope.messages : [];
          const targets = controlsByRoom.get(roomId) ?? new Set();
          targets.forEach((target) => {
            if (target.readyState === WebSocket.OPEN) target.send(JSON.stringify({ messages }));
          });
          socket.send(JSON.stringify({ ok: true, delivered: targets.size }));
        } catch (error) {
          socket.send(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
        } finally {
          socket.close();
        }
      });
      return;
    }

    socket.close(1008, 'unsupported path');
  });

  server.on('listening', () => {
    console.log(`Mock live control bridge listening on ws://${host}:${port}`);
  });
  return server;
}

export async function sendMockLiveControl(options) {
  const payload = buildMockLiveControlMessages(options);
  const url = options.url ?? `ws://${options.host ?? defaultHost}:${options.port ?? defaultPort}/emit`;
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.on('open', () => socket.send(JSON.stringify(payload)));
    socket.on('message', (raw) => {
      const response = JSON.parse(String(raw));
      if (response.ok) {
        console.log(`Injected ${payload.messages.length} message(s) to ${payload.roomId}; delivered clients: ${response.delivered}`);
        resolve();
      } else {
        reject(new Error(response.message ?? 'Mock control send failed'));
      }
    });
    socket.on('error', reject);
  });
}

function requireValue(value, flag) {
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error(`${flag} is required`);
}

function requireNumber(value, flag) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new Error(`${flag} must be a number`);
}

function printHelp() {
  console.log(`Usage:
  npm run mock:live -- serve --port 4578
  npm run mock:live -- bid --room room_1001 --auction auc_2001 --price 188800 --nickname 用户**88
  npm run mock:live -- chat --room room_1001 --nickname 用户**88 --text "这件不错"
  npm run mock:live -- system --room room_1001 --text "系统提示"
  npm run mock:live -- timer --room room_1001 --auction auc_2001 --end-in 30
  npm run mock:live -- online --room room_1001 --count 520
  npm run mock:live -- close --room room_1001 --auction auc_2001 --price 188800`);
}

async function main() {
  const options = parseMockLiveControlArgs(process.argv.slice(2));
  if (options.command === 'serve') {
    serveMockLiveControl(options);
    return;
  }
  if (options.command === 'help' || options.command === '--help' || options.command === '-h') {
    printHelp();
    return;
  }
  await sendMockLiveControl(options);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
