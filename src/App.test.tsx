import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { getMessage } from './i18n/messages';
import { ApiClient } from './services/api';
import { useLiveActivityStore } from './store/liveActivity';
import { usePreferencesStore } from './store/preferences';
import { useProfileStore } from './store/profile';
import { useSessionStore } from './store/session';

const now = Date.now();
const detailEnrollAndPayText = '报名并支付保证金';
const detailWaitingText = '等待开拍';
const detailViewOrderText = '查看订单';
const detailExpandRankingText = '展开全部';
const detailCollapseRankingText = '收起';

type BackendRankingTestEntry = {
  rank: number;
  bidderId: string;
  bidderNickname: string;
  price: number;
};

const rankingUpdated = (ranking: BackendRankingTestEntry[], auctionId = 'auc_2001') => ({
  type: 'ranking.updated',
  payload: { auctionId, ranking }
});

const api = {
  login: vi.fn(async () => ({
    accessToken: 'jwt',
    refreshToken: 'rft',
    expiresIn: 43200,
    user: { id: 'u1', nickname: '竞拍用户001', role: 'buyer' as const }
  })),
  listLiveRooms: vi.fn(async () => ({
    items: [
      {
        id: 'room_1001',
        title: '珠宝严选直播间',
        merchantName: '云上珠宝',
        status: 'LIVE',
        videoSource: 'recorded',
        onlineCount: 328,
        watcherCount: 1208,
        likeCount: 0,
        activeAuctionId: 'auc_2001',
        videoUrl: '/media/live-room-demo.mp4'
      }
    ],
    total: 1,
    page: 1,
    page_size: 20
  })),
  getLiveRoom: vi.fn(async () => ({
    id: 'room_1001',
    title: '珠宝严选直播间',
    merchantName: '云上珠宝',
    status: 'LIVE',
    videoSource: 'recorded',
    onlineCount: 328,
    watcherCount: 1208,
    likeCount: 0,
    activeAuctionId: 'auc_2001',
    videoUrl: '/media/live-room-demo.mp4'
  })),
  listLiveRoomLots: vi.fn(async () => ({
    items: [
      {
        id: 'lot_3001',
        auctionId: 'auc_2001',
        roomId: 'room_1001',
        merchantId: 'merchant_01',
        categoryId: 'jewelry',
        title: '18K 金钻石项链',
        subtitle: 'GIA 证书 主播实拍',
        description: '精选高净度钻石与 18K 金链身，适合直播间近景展示。',
        imageUrls: ['/gallery/necklace-1.jpg', '/gallery/necklace-2.jpg', '/gallery/necklace-3.jpg'],
        status: 'RUNNING',
        startPrice: 0,
        currentPrice: 150100,
        leaderBidderId: 'u2',
        endTsMs: now + 120_000,
        ruleSnapshot: { incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 }, antiSnipingSec: 15, antiExtendSec: 10, capPrice: 188800 },
        depositAmount: 5000,
        participantCount: 128,
        bidCount: 36
      },
      {
        id: 'lot_3002',
        auctionId: 'auc_2002',
        roomId: 'room_1001',
        merchantId: 'merchant_01',
        categoryId: 'jewelry',
        title: '翡翠冰种吊坠',
        description: '冰种翡翠吊坠，适合收藏和日常佩戴。',
        status: 'READY',
        startPrice: 0,
        currentPrice: 0,
        endTsMs: now + 420_000,
        ruleSnapshot: { incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 } }
      },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `lot_extra_${index + 3}`,
        auctionId: `auc_extra_${index + 3}`,
        roomId: 'room_1001',
        merchantId: 'merchant_01',
        categoryId: index % 2 === 0 ? 'jewelry' : 'craft',
        title: `Demo lot ${index + 3}`,
        description: `Demo product intro ${index + 3}`,
        status: 'READY' as const,
        startPrice: 0,
        currentPrice: 0,
        endTsMs: now + (index + 8) * 60_000,
        ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 100, maxBidSteps: 10 } }
      }))
    ],
    total: 10,
    page: 1,
    page_size: 20
  })),
  getLiveRoomStats: vi.fn(async () => ({ roomId: 'room_1001', onlineCount: 328, watcherCount: 1208, bidCount: 36 })),
  getAuctionState: vi.fn(async () => ({
    auctionId: 'auc_2001',
    status: 'RUNNING',
    currentPrice: 150100,
    leaderBidderId: 'u2',
    endTsMs: now + 120_000,
    serverTsMs: now,
    bidCount: 36,
    participantCount: 128
  })),
  enrollAuction: vi.fn(async () => ({
    id: 'dep1',
    auctionId: 'auc_2001',
    userId: 'u1',
    amount: 5000,
    status: 'READY'
  })),
  listMyOrders: vi.fn(async () => ({ items: [{ id: 'ord_2001', auctionId: 'auc_2001', buyerId: 'u1', amount: 150100, status: 'PENDING_PAY' }], total: 1, page: 1, page_size: 20 })),
  getOrder: vi.fn(async () => ({ id: 'ord_2001', auctionId: 'auc_2001', buyerId: 'u1', amount: 150100, status: 'PENDING_PAY' })),
  payOrder: vi.fn(async () => ({ id: 'ord_2001', auctionId: 'auc_2001', buyerId: 'u1', amount: 150100, status: 'PAID', paidAt: '2026-05-24T20:00:00+08:00' })),
  confirmReceipt: vi.fn(async (orderId: string) => ({
    id: orderId,
    auctionId: 'auc_pending_receipt',
    buyerId: 'u1',
    amount: 68000,
    status: 'PAID',
    payStatus: 'PAID',
    fulfillmentStatus: 'RECEIVED',
    receivedAt: '2026-06-05T12:00:00+08:00'
  })),
  listCategories: vi.fn(async () => ({ items: [{ id: 'jewelry', name: '珠宝玉石', iconName: 'gem' }], total: 1, page: 1, page_size: 20 })),
  searchLots: vi.fn(async () => ({
    items: [
      {
        id: 'lot_3001',
        auctionId: 'auc_2001',
        roomId: 'room_1001',
        merchantId: 'merchant_01',
        categoryId: 'jewelry',
        title: '18K 金钻石项链',
        subtitle: 'GIA 证书 主播实拍',
        status: 'RUNNING',
        startPrice: 0,
        currentPrice: 150100,
        endTsMs: now + 120_000,
        ruleSnapshot: { incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 } },
        participantCount: 128,
        bidCount: 36
      }
    ],
    total: 1,
    page: 1,
    page_size: 20
  })),
  searchLiveRooms: vi.fn(async () => ({
    items: [{ id: 'room_1001', title: '珠宝严选直播间', merchantName: '云上珠宝', status: 'LIVE', videoSource: 'recorded', onlineCount: 328, watcherCount: 1208 }],
    total: 1,
    page: 1,
    page_size: 20
  })),
  listMerchantLiveSessions: vi.fn(async () => ({
    items: [{ id: 'room_1001', title: '珠宝严选直播间', merchantId: 'merchant_01', merchantName: '云上珠宝', status: 'LIVE', videoSource: 'recorded', onlineCount: 328, watcherCount: 1208 }],
    total: 1,
    page: 1,
    page_size: 20
  })),
  searchMerchants: vi.fn(async () => ({
    items: [{ id: 'merchant_01', name: '云上珠宝', description: '珠宝直播拍卖商家', followerCount: 128000, rating: 4.9 }],
    total: 1,
    page: 1,
    page_size: 20
  })),
  getMerchant: vi.fn(async () => ({ id: 'merchant_01', name: '云上珠宝', description: '珠宝直播拍卖商家', followerCount: 128000, rating: 4.9 })),
  getLot: vi.fn(async (lotId: string) => {
    if (lotId === 'lot_3001') {
      return {
        id: 'lot_3001',
        auctionId: 'auc_2001',
        roomId: 'room_1001',
        merchantId: 'merchant_01',
        categoryId: 'jewelry',
        title: '18K 金钻石项链',
        status: 'RUNNING',
        startPrice: 0,
        currentPrice: 150100,
        endTsMs: now + 120_000,
        ruleSnapshot: { incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 } },
        participantCount: 128,
        bidCount: 36
      };
    }
    return {
      id: 'lot_3002',
      auctionId: 'auc_2002',
      roomId: 'room_1001',
      merchantId: 'merchant_01',
      categoryId: 'jewelry',
      title: '翡翠冰种吊坠',
      status: 'READY',
      startPrice: 0,
      currentPrice: 0,
      endTsMs: now + 420_000,
      ruleSnapshot: { incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 } }
    };
  }),
  getMyProfile: vi.fn(async () => ({
    userId: 'u1',
    nickname: 'Buyer One',
    avatarUrl: '',
    reminderCount: 1,
    favoriteCount: 2,
    followingCount: 3,
    footprintCount: 4
  })),
  updateMyProfile: vi.fn(async (profile: { userId?: string; nickname?: string; avatarUrl?: string }) => ({
    userId: profile.userId ?? 'u1',
    nickname: profile.nickname ?? 'Buyer One',
    avatarUrl: profile.avatarUrl,
    reminderCount: 1,
    favoriteCount: 2,
    followingCount: 3,
    footprintCount: 4
  })),
  listMyAuctionRecords: vi.fn(async () => ({
    items: [
      {
        id: 'record_waiting',
        userId: 'u1',
        depositAmount: 5000,
        depositStatus: 'FROZEN',
        lot: {
          id: 'lot_3002',
          auctionId: 'auc_2002',
          roomId: 'room_1001',
          title: 'Upcoming Jade Lot',
          status: 'READY',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000
        }
      },
      {
        id: 'record_bidding',
        userId: 'u1',
        depositAmount: 5000,
        depositStatus: 'FROZEN',
        lot: {
          id: 'lot_3001',
          auctionId: 'auc_2001',
          roomId: 'room_1001',
          title: 'Running Diamond Lot',
          status: 'RUNNING' as const,
          startPrice: 0,
          currentPrice: 150100,
          endTsMs: now + 120_000
        }
      },
      {
        id: 'record_lost',
        userId: 'u1',
        depositAmount: 3000,
        depositStatus: 'RELEASED',
        lot: {
          id: 'lot_lost',
          auctionId: 'auc_lost',
          roomId: 'room_1001',
          title: 'Lost Deposit Lot',
          status: 'CLOSED_FAILED',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now - 120_000
        }
      },
      {
        id: 'record_pending_pay',
        userId: 'u1',
        depositAmount: 3000,
        depositStatus: 'APPLIED',
        order: {
          id: 'ord_pending_pay',
          auctionId: 'auc_pending_pay',
          buyerId: 'u1',
          amount: 46600,
          status: 'PENDING_PAY',
          payStatus: 'UNPAID'
        },
        lot: {
          id: 'lot_pending_pay',
          auctionId: 'auc_pending_pay',
          roomId: 'room_1001',
          title: 'Pending Payment Lot',
          status: 'CLOSED_WON',
          startPrice: 0,
          currentPrice: 46600,
          finalPrice: 46600,
          endTsMs: now - 90_000
        }
      },
      {
        id: 'record_pending_shipment',
        userId: 'u1',
        depositAmount: 3000,
        depositStatus: 'APPLIED',
        order: {
          id: 'ord_pending_shipment',
          auctionId: 'auc_pending_shipment',
          buyerId: 'u1',
          amount: 52000,
          status: 'PAID',
          payStatus: 'PAID',
          fulfillmentStatus: 'UNSHIPPED'
        },
        lot: {
          id: 'lot_pending_shipment',
          auctionId: 'auc_pending_shipment',
          roomId: 'room_1001',
          title: 'Pending Shipment Lot',
          status: 'SETTLED',
          startPrice: 0,
          currentPrice: 52000,
          finalPrice: 52000,
          endTsMs: now - 180_000
        }
      },
      {
        id: 'record_pending_receipt',
        userId: 'u1',
        depositAmount: 3000,
        depositStatus: 'APPLIED',
        order: {
          id: 'ord_pending_receipt',
          auctionId: 'auc_pending_receipt',
          buyerId: 'u1',
          amount: 68000,
          status: 'PAID',
          payStatus: 'PAID',
          fulfillmentStatus: 'SHIPPED'
        },
        lot: {
          id: 'lot_pending_receipt',
          auctionId: 'auc_pending_receipt',
          roomId: 'room_1001',
          title: 'Pending Receipt Lot',
          status: 'SETTLED',
          startPrice: 0,
          currentPrice: 68000,
          finalPrice: 68000,
          endTsMs: now - 210_000
        }
      },
      {
        id: 'record_completed',
        userId: 'u1',
        depositAmount: 3000,
        depositStatus: 'APPLIED',
        order: {
          id: 'ord_completed',
          auctionId: 'auc_completed',
          buyerId: 'u1',
          amount: 79000,
          status: 'PAID',
          payStatus: 'PAID',
          fulfillmentStatus: 'RECEIVED'
        },
        lot: {
          id: 'lot_completed',
          auctionId: 'auc_completed',
          roomId: 'room_1001',
          title: 'Completed Lot',
          status: 'SETTLED',
          startPrice: 0,
          currentPrice: 79000,
          finalPrice: 79000,
          endTsMs: now - 240_000
        }
      }
    ],
    total: 7,
    page: 1,
    page_size: 20
  }))
} as unknown as ApiClient;

function renderWithRouter(initialPath = currentTestPath(), options: { strict?: boolean } = {}) {
  window.history.pushState(null, '', initialPath);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <App apiClient={api} />
    </QueryClientProvider>
  );
  return render(
    options.strict ? <React.StrictMode>{tree}</React.StrictMode> : tree
  );
}

function renderApp() {
  return renderWithRouter();
}

function currentTestPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function seedSession() {
  useSessionStore.getState().setSession({
    accessToken: 'jwt',
    refreshToken: 'rft',
    expiresIn: 43200,
    user: { id: 'u1', nickname: '竞拍用户001', role: 'buyer' }
  });
}

function firePointer(target: Element, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', init: { pointerId: number; pointerType?: string; clientX?: number; clientY?: number; button?: number; buttons?: number }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
    buttons: init.buttons ?? 1
  });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    pointerType: { value: init.pointerType ?? 'touch' }
  });
  fireEvent(target, event);
}

function fireTouch(target: Element, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touches: Array<{ identifier: number; clientX: number; clientY: number }>) {
  fireEvent[type](target, {
    touches,
    targetTouches: touches,
    changedTouches: touches
  });
}

async function flushApp(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function installMockControlSocket() {
  const sockets: Array<{
    listeners: Record<string, Array<(event: { data: string }) => void>>;
    addEventListener: (type: string, handler: (event: { data: string }) => void) => void;
    close: () => void;
    emit: (message: unknown) => void;
  }> = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = FakeWebSocket.OPEN;
    listeners: Record<string, Array<(event: { data: string }) => void>> = {};

    constructor(public readonly url: string) {
      sockets.push(this);
    }

    addEventListener(type: string, handler: (event: { data: string }) => void) {
      this.listeners[type] = [...(this.listeners[type] ?? []), handler];
    }

    close() {
      this.readyState = 3;
    }

    emit(message: unknown) {
      this.listeners.message?.forEach((handler) => handler({ data: JSON.stringify(message) }));
    }
  }

  vi.stubGlobal('WebSocket', FakeWebSocket);
  (import.meta.env as Record<string, string | undefined>).VITE_MOCK_CONTROL_URL = 'ws://127.0.0.1:4578/control';
  return sockets;
}

function installNativeRealtimeSocket() {
  const sockets: Array<{
    listeners: Record<string, Array<(event: { data?: string }) => void>>;
    sent: string[];
    addEventListener: (type: string, handler: (event: { data?: string }) => void) => void;
    close: () => void;
    send: (data: string) => void;
    emit: (message: unknown) => void;
  }> = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    readyState = FakeWebSocket.OPEN;
    listeners: Record<string, Array<(event: { data?: string }) => void>> = {};
    sent: string[] = [];

    constructor(public readonly url: string) {
      sockets.push(this);
    }

    addEventListener(type: string, handler: (event: { data?: string }) => void) {
      this.listeners[type] = [...(this.listeners[type] ?? []), handler];
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.listeners.close?.forEach((handler) => handler({}));
    }

    send(data: string) {
      this.sent.push(String(data));
    }

    emit(message: unknown) {
      this.listeners.message?.forEach((handler) => handler({ data: JSON.stringify(message) }));
    }
  }

  vi.stubGlobal('WebSocket', FakeWebSocket);
  const env = import.meta.env as Record<string, string | undefined>;
  env.MODE = 'development';
  env.VITE_REALTIME_MODE = 'websocket';
  env.VITE_WS_URL = 'ws://127.0.0.1:4578';
  delete env.VITE_MOCK_CONTROL_URL;
  return sockets;
}

function emitLatestMockControl(sockets: Array<{ emit: (message: unknown) => void }>, message: unknown) {
  const socket = sockets[sockets.length - 1];
  expect(socket).toBeDefined();
  socket.emit(message);
}

function installMockAudioContext(options: { initialState?: AudioContextState; resumeAllowed?: boolean } = {}) {
  const sources: Array<{
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
  let resumeAllowed = options.resumeAllowed ?? true;

  class FakeAudioContext {
    state: AudioContextState = options.initialState ?? 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      if (resumeAllowed) this.state = 'running';
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
  return {
    contexts,
    sources,
    allowResume: () => {
      resumeAllowed = true;
    }
  };
}

describe('App flow', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.unstubAllGlobals();
    const env = import.meta.env as Record<string, string | undefined>;
    env.MODE = 'test';
    delete env.VITE_API_MODE;
    delete env.VITE_MOCK_CONTROL_URL;
    delete env.VITE_REALTIME_MODE;
    delete env.VITE_WS_URL;
    localStorage.clear();
    useLiveActivityStore.getState().clearActivity();
    usePreferencesStore.getState().resetPreferences();
    useProfileStore.getState().clearProfileOverride();
    useSessionStore.getState().clearSession();
    window.history.pushState(null, '', '/');
    vi.clearAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('uses the live recommendation feed as the home tab and opens a room from it', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    expect(await screen.findByText('珠宝严选直播间')).toBeInTheDocument();
    expect(screen.queryByText('今日随机拍品')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('nav.category') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('nav.follow') })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('discover.enterLive') }));
    expect(await screen.findByText('云上珠宝')).toBeInTheDocument();
    const liveShop = screen.getByText('云上珠宝').closest('.live-shop');
    expect(liveShop).not.toBeNull();
    expect(within(liveShop as HTMLElement).getByText(getMessage('live.likes', undefined, { count: '0' }))).toBeInTheDocument();
    expect(within(liveShop as HTMLElement).getByRole('button', { name: `+${getMessage('live.follow')}` })).toHaveClass('live-follow-pill');
    const headerWatchers = screen.getByLabelText(getMessage('live.statsOnline', undefined, { count: '328' }));
    expect(headerWatchers).toHaveClass('live-header-watchers');
    expect(headerWatchers.querySelector('svg')).toBeInTheDocument();
    expect(document.querySelector('.live-header-bidders')).not.toBeInTheDocument();
    const liveVideo = screen.getByTestId('live-room-video') as HTMLVideoElement;
    expect(liveVideo).toHaveAttribute('src', '/media/live-room-demo.mp4');
    expect(liveVideo.muted).toBe(true);
    expect(liveVideo.volume).toBe(0);
    await user.click(screen.getByRole('button', { name: getMessage('live.soundEnable') }));
    await waitFor(() => expect(liveVideo.muted).toBe(false));
    expect(liveVideo.volume).toBe(1);
    expect(screen.getByRole('button', { name: getMessage('live.soundDisable') })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/live/room_1001');
    expect(window.location.search).toBe('?from=home');

    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    expect(await screen.findByText('珠宝严选直播间')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?focusRoomId=room_1001');
  });

  it('updates the live header online count from realtime presence events', async () => {
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    expect(await screen.findByLabelText(getMessage('live.statsOnline', undefined, { count: '328' }))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    const participantsMetric = () => within(detailDialog).getByText(getMessage('auction.participants')).closest('.metric') as HTMLElement;
    expect(participantsMetric()).toHaveTextContent('128');
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));

    await act(async () => {
      emitLatestMockControl(sockets, { type: 'room.online', payload: { online: 329 } });
    });

    const headerOnline = screen.getByLabelText(getMessage('live.statsOnline', undefined, { count: '329' }));
    expect(headerOnline).toHaveClass('live-header-watchers');
    expect(headerOnline).toHaveTextContent('329');
    expect(participantsMetric()).toHaveTextContent('128');

    await act(async () => {
      emitLatestMockControl(sockets, { type: 'auction.participant_updated', payload: { auctionId: 'auc_2001', participantCount: 129 } });
    });

    expect(participantsMetric()).toHaveTextContent('129');
  });

  it('renders a complete mobile login screen and submits with demo credentials', async () => {
    renderApp();
    const user = userEvent.setup();

    expect(screen.getByText(getMessage('login.liveBadge'))).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: getMessage('login.title') })).toBeInTheDocument();
    expect(screen.getByText(getMessage('login.featureRealtime'))).toBeInTheDocument();
    expect(screen.getByText(getMessage('login.featureBid'))).toBeInTheDocument();
    expect(screen.getByLabelText(getMessage('login.account'))).toHaveValue('buyer001');
    expect(screen.getByLabelText(getMessage('login.password'))).toHaveValue('Passw0rd!');
    expect(screen.getByText(getMessage('login.demoAccount'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));

    expect(await screen.findByTestId('discover-feed')).toBeInTheDocument();
    expect(api.login).toHaveBeenCalledWith({ account: 'buyer001', password: 'Passw0rd!', role: 'buyer' });
  });

  it('continues a recorded preview video from its current position after entering the live room', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    const feed = await screen.findByTestId('discover-feed');
    const previewVideo = feed.querySelector<HTMLVideoElement>('.discover-slide.is-active .discover-video');
    expect(previewVideo).not.toBeNull();
    previewVideo!.currentTime = 18.25;

    await user.click(screen.getByTestId('discover-enter-live'));

    const liveVideo = await screen.findByTestId('live-room-video') as HTMLVideoElement;
    await waitFor(() => expect(liveVideo.currentTime).toBeCloseTo(18.25, 1));
    expect(liveVideo).toHaveAttribute('src', '/media/live-room-demo.mp4');
    expect(window.location.pathname).toBe('/live/room_1001');
    expect(window.location.search).toBe('?from=home');

    liveVideo.currentTime = 26;
    fireEvent.canPlay(liveVideo);
    expect(liveVideo.currentTime).toBeCloseTo(26, 1);
  });

  it('does not apply preview video progress when entering the live room from a non-preview route', async () => {
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();

    const liveVideo = await screen.findByTestId('live-room-video') as HTMLVideoElement;
    expect(liveVideo.currentTime).toBe(0);
  });

  it('returns to the original deep link after logging in from an authenticated route', async () => {
    renderWithRouter('/orders?tab=pendingPay');
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: getMessage('login.submit') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));

    expect(await screen.findByText(getMessage('orders.title'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/orders');
    expect(window.location.search).toBe('?tab=pendingPay');
  });

  it('reuses one bottom tab bar across discover and me tabs', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    const tabFrame = await screen.findByTestId('bottom-tab-frame');
    const tabBar = within(tabFrame).getByTestId('bottom-tabs');

    expect(within(tabBar).getAllByRole('button')).toHaveLength(3);
    expect(within(tabBar).getByRole('button', { name: getMessage('nav.home') })).toHaveClass('is-active');

    await user.click(within(tabBar).getByRole('button', { name: getMessage('nav.discover') }));
    expect(screen.getByTestId('bottom-tab-frame')).toBe(tabFrame);
    expect(screen.getByTestId('bottom-tabs')).toBe(tabBar);
    expect(within(tabBar).getByRole('button', { name: getMessage('nav.discover') })).toHaveClass('is-active');

    await user.click(within(tabBar).getByRole('button', { name: getMessage('nav.me') }));
    expect(screen.getByTestId('bottom-tab-frame')).toBe(tabFrame);
    expect(screen.getByTestId('bottom-tabs')).toBe(tabBar);
    expect(within(tabBar).getByRole('button', { name: getMessage('nav.me') })).toHaveClass('is-active');
  });

  it('renders the home preview metadata and keeps the entry button outside the info stack', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));

    const previewMeta = await screen.findByTestId('discover-preview-meta');
    expect(within(previewMeta).getByText(getMessage('home.liveNow'))).toBeInTheDocument();
    expect(within(previewMeta).getByText(/1208/)).toBeInTheDocument();
    expect(within(previewMeta).getByText('@云上珠宝')).toBeInTheDocument();
    expect(within(previewMeta).getByText('珠宝严选直播间')).toBeInTheDocument();
    expect(within(previewMeta).getByText('18K 金钻石项链')).toBeInTheDocument();
    expect(within(previewMeta).getByText(getMessage('auction.running'))).toBeInTheDocument();
    expect(within(previewMeta).getByText('¥1501.00')).toBeInTheDocument();
    expect(within(previewMeta).queryByRole('button', { name: getMessage('discover.enterLive') })).not.toBeInTheDocument();
    expect(screen.getByTestId('discover-enter-live')).toHaveTextContent(getMessage('discover.enterLive'));
  });

  it('falls back to an upcoming lot in the home preview when no running lot exists', async () => {
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [
        {
          id: 'lot_3002',
          auctionId: 'auc_2002',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: '翡翠冰种吊坠',
          status: 'READY',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 } }
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    const previewMeta = await screen.findByTestId('discover-preview-meta');

    expect(within(previewMeta).getByText('翡翠冰种吊坠')).toBeInTheDocument();
    expect(within(previewMeta).getByText(getMessage('auction.upcoming'))).toBeInTheDocument();
  });

  it('loops the home live feed with mouse wheel and drag gestures', async () => {
    vi.mocked(api.searchLiveRooms).mockResolvedValueOnce({
      items: [
        { id: 'room_1001', title: '珠宝严选直播间', merchantName: '云上珠宝', status: 'LIVE', videoSource: 'recorded', onlineCount: 328, watcherCount: 1208, videoUrl: '/media/live-room-demo.mp4' },
        { id: 'room_1004', title: '腕表快闪直播间', merchantName: '时计公社', status: 'LIVE', videoSource: 'digitalHuman', onlineCount: 192, watcherCount: 873, digitalHuman: { idleVideoUrl: '/media/AI_Presenter_Silent.mp4', speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4' } }
      ],
      total: 2,
      page: 1,
      page_size: 20
    });

    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    const feed = await screen.findByTestId('discover-feed');
    const track = feed.querySelector<HTMLElement>('.discover-track');
    expect(track).not.toBeNull();
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1001');
    expect(track?.style.transform).toBe('translate3d(0, -100%, 0)');

    fireEvent.wheel(feed, { deltaY: 160 });
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1004');
    expect(track?.style.transform).toBe('translate3d(0, -200%, 0)');

    fireEvent.wheel(feed, { deltaY: 160 });
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1004');
    expect(track?.style.transform).toBe('translate3d(0, -200%, 0)');
    fireEvent.transitionEnd(track as HTMLElement, { propertyName: 'transform' });

    fireEvent.wheel(feed, { deltaY: 160 });
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1001');
    expect(track?.style.transform).toBe('translate3d(0, -300%, 0)');
    fireEvent.wheel(feed, { deltaY: 160 });
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1001');
    expect(track?.style.transform).toBe('translate3d(0, -300%, 0)');
    fireEvent.transitionEnd(track as HTMLElement, { propertyName: 'transform' });
    await waitFor(() => expect(track?.style.transform).toBe('translate3d(0, -100%, 0)'));
    await waitFor(() => expect(track).not.toHaveClass('is-resetting'));

    fireEvent.wheel(feed, { deltaY: -160 });
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1004');
    expect(track?.style.transform).toBe('translate3d(0, 0%, 0)');
    fireEvent.transitionEnd(track as HTMLElement, { propertyName: 'transform' });
    await waitFor(() => expect(track?.style.transform).toBe('translate3d(0, -200%, 0)'));
    await waitFor(() => expect(track).not.toHaveClass('is-resetting'));

    fireTouch(feed, 'touchStart', [{ identifier: 1, clientX: 195, clientY: 160 }]);
    fireTouch(feed, 'touchMove', [{ identifier: 1, clientX: 195, clientY: 340 }]);
    fireTouch(feed, 'touchEnd', []);
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1001');
    fireEvent.transitionEnd(track as HTMLElement, { propertyName: 'transform' });

    firePointer(feed, 'pointerdown', { pointerId: 1, pointerType: 'mouse', buttons: 1, clientY: 160 });
    firePointer(feed, 'pointermove', { pointerId: 1, pointerType: 'mouse', buttons: 1, clientY: 340 });
    firePointer(feed, 'pointerup', { pointerId: 1, pointerType: 'mouse', clientY: 340 });
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1004');
    fireEvent.transitionEnd(track as HTMLElement, { propertyName: 'transform' });
    await waitFor(() => expect(track?.style.transform).toBe('translate3d(0, -200%, 0)'));
    await waitFor(() => expect(track).not.toHaveClass('is-resetting'));

    firePointer(feed, 'pointerdown', { pointerId: 2, pointerType: 'mouse', buttons: 1, clientY: 340 });
    firePointer(feed, 'pointermove', { pointerId: 2, pointerType: 'mouse', buttons: 1, clientY: 160 });
    firePointer(feed, 'pointerup', { pointerId: 2, pointerType: 'mouse', clientY: 160 });
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1001');
  });

  it('drags the home live feed with the touch point and uses a 20 percent release threshold', async () => {
    vi.mocked(api.searchLiveRooms).mockResolvedValueOnce({
      items: [
        { id: 'room_1001', title: '珠宝严选直播间', merchantName: '云上珠宝', status: 'LIVE', videoSource: 'recorded', onlineCount: 328, watcherCount: 1208, videoUrl: '/media/live-room-demo.mp4' },
        { id: 'room_1004', title: '腕表快闪直播间', merchantName: '时计公社', status: 'LIVE', videoSource: 'digitalHuman', onlineCount: 192, watcherCount: 873, digitalHuman: { idleVideoUrl: '/media/AI_Presenter_Silent.mp4', speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4' } }
      ],
      total: 2,
      page: 1,
      page_size: 20
    });

    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    const feed = await screen.findByTestId('discover-feed');
    Object.defineProperty(feed, 'clientHeight', { configurable: true, value: 500 });
    const track = feed.querySelector<HTMLElement>('.discover-track');
    expect(track).not.toBeNull();

    fireTouch(feed, 'touchStart', [{ identifier: 1, clientX: 195, clientY: 200 }]);
    fireTouch(feed, 'touchMove', [{ identifier: 1, clientX: 195, clientY: 280 }]);
    await waitFor(() => expect(track?.style.transform).toBe('translate3d(0, calc(-100% + 80px), 0)'));
    fireTouch(feed, 'touchEnd', []);
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1001');
    expect(track?.style.transform).toBe('translate3d(0, -100%, 0)');

    fireTouch(feed, 'touchStart', [{ identifier: 2, clientX: 195, clientY: 300 }]);
    fireTouch(feed, 'touchMove', [{ identifier: 2, clientX: 195, clientY: 170 }]);
    await waitFor(() => expect(track?.style.transform).toBe('translate3d(0, calc(-100% + -130px), 0)'));
    fireTouch(feed, 'touchEnd', []);
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1004');
    expect(track?.style.transform).toBe('translate3d(0, -200%, 0)');
  });

  it('opens the live room from a short preview tap but ignores long press and drag gestures', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    const feed = await screen.findByTestId('discover-feed');

    firePointer(feed, 'pointerdown', { pointerId: 21, pointerType: 'mouse', buttons: 1, clientX: 180, clientY: 220 });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 270));
    });
    firePointer(feed, 'pointerup', { pointerId: 21, pointerType: 'mouse', clientX: 180, clientY: 220 });
    expect(window.location.pathname).toBe('/');

    firePointer(feed, 'pointerdown', { pointerId: 22, pointerType: 'mouse', buttons: 1, clientX: 180, clientY: 220 });
    firePointer(feed, 'pointermove', { pointerId: 22, pointerType: 'mouse', buttons: 1, clientX: 180, clientY: 234 });
    firePointer(feed, 'pointerup', { pointerId: 22, pointerType: 'mouse', clientX: 180, clientY: 234 });
    expect(window.location.pathname).toBe('/');

    firePointer(feed, 'pointerdown', { pointerId: 23, pointerType: 'mouse', buttons: 1, clientX: 180, clientY: 220 });
    firePointer(feed, 'pointerup', { pointerId: 23, pointerType: 'mouse', clientX: 181, clientY: 224 });
    expect(await screen.findByTestId('live-room-video')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/live/room_1001');
  });

  it('supports PC drag follow-through but does not bind vertical switching inside the live room', async () => {
    vi.mocked(api.searchLiveRooms).mockResolvedValueOnce({
      items: [
        { id: 'room_1001', title: '珠宝严选直播间', merchantName: '云上珠宝', status: 'LIVE', videoSource: 'recorded', onlineCount: 328, watcherCount: 1208, videoUrl: '/media/live-room-demo.mp4' },
        { id: 'room_1004', title: '腕表快闪直播间', merchantName: '时计公社', status: 'LIVE', videoSource: 'digitalHuman', onlineCount: 192, watcherCount: 873, digitalHuman: { idleVideoUrl: '/media/AI_Presenter_Silent.mp4', speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4' } }
      ],
      total: 2,
      page: 1,
      page_size: 20
    });

    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    const feed = await screen.findByTestId('discover-feed');
    Object.defineProperty(feed, 'clientHeight', { configurable: true, value: 500 });
    const track = feed.querySelector<HTMLElement>('.discover-track');

    firePointer(feed, 'pointerdown', { pointerId: 10, pointerType: 'mouse', buttons: 1, clientY: 300 });
    firePointer(feed, 'pointermove', { pointerId: 10, pointerType: 'mouse', buttons: 1, clientY: 170 });
    await waitFor(() => expect(track?.style.transform).toBe('translate3d(0, calc(-100% + -130px), 0)'));
    firePointer(feed, 'pointerup', { pointerId: 10, pointerType: 'mouse', clientY: 170 });
    expect(feed).toHaveAttribute('data-active-room-id', 'room_1004');

    fireEvent.transitionEnd(track as HTMLElement, { propertyName: 'transform' });
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_1004',
      title: '\u8155\u8868\u5feb\u95ea\u76f4\u64ad\u95f4',
      merchantName: '\u65f6\u8ba1\u516c\u793e',
      status: 'LIVE',
      videoSource: 'digitalHuman',
      onlineCount: 192,
      watcherCount: 873,
      digitalHuman: { idleVideoUrl: '/media/AI_Presenter_Silent.mp4', speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4' }
    });
    await user.click(screen.getByTestId('discover-enter-live'));
    expect(await screen.findByText('时计公社')).toBeInTheDocument();
    expect(screen.queryByTestId('discover-feed')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/live/room_1004');
  });

  it('continues a digital-human idle preview video from its current position after entering the live room', async () => {
    vi.mocked(api.searchLiveRooms).mockResolvedValueOnce({
      items: [
        {
          id: 'room_1004',
          title: '\u8155\u8868\u5feb\u95ea\u76f4\u64ad\u95f4',
          merchantName: '\u65f6\u8ba1\u516c\u793e',
          status: 'LIVE',
          videoSource: 'digitalHuman',
          onlineCount: 192,
          watcherCount: 873,
          digitalHuman: { idleVideoUrl: '/media/AI_Presenter_Silent.mp4', speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4' }
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_1004',
      title: '\u8155\u8868\u5feb\u95ea\u76f4\u64ad\u95f4',
      merchantName: '\u65f6\u8ba1\u516c\u793e',
      status: 'LIVE',
      videoSource: 'digitalHuman',
      onlineCount: 192,
      watcherCount: 873,
      digitalHuman: { idleVideoUrl: '/media/AI_Presenter_Silent.mp4', speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4' }
    });
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    const feed = await screen.findByTestId('discover-feed');
    const previewVideo = feed.querySelector<HTMLVideoElement>('.discover-slide.is-active .discover-video');
    expect(previewVideo).not.toBeNull();
    previewVideo!.currentTime = 9.5;

    await user.click(screen.getByTestId('discover-enter-live'));

    const stage = await screen.findByTestId('digital-human-stage');
    const idleVideo = stage.querySelector<HTMLVideoElement>('.digital-human-video.idle');
    expect(idleVideo).not.toBeNull();
    await waitFor(() => expect(idleVideo!.currentTime).toBeCloseTo(9.5, 1));
    expect(idleVideo).toHaveAttribute('src', '/media/AI_Presenter_Silent.mp4');

    idleVideo!.currentTime = 15;
    fireEvent.canPlay(idleVideo!);
    expect(idleVideo!.currentTime).toBeCloseTo(15, 1);
  });

  it('uses the discover tab as a lot list and opens a running lot through the product page first', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.discover') }));

    expect(await screen.findByText(getMessage('discoverLots.title'))).toBeInTheDocument();
    expect(document.querySelector('.discover-lots-header .eyebrow')).not.toBeInTheDocument();
    expect(await screen.findByText('18K 金钻石项链')).toBeInTheDocument();
    await waitFor(() => expect(api.searchLots).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'default', status: 'all', categoryId: 'all' })));

    await user.click(screen.getByRole('button', { name: getMessage('product.bidNow') }));
    await waitFor(() => expect(window.location.pathname).toBe('/product/lot_3001'));
    expect(await screen.findByRole('button', { name: getMessage('product.goLive') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('product.goLive') }));
    await waitFor(() => expect(window.location.pathname).toBe('/live/room_1001'));
    expect(window.location.search).toBe('?lotId=lot_3001&from=discover');
    expect(await screen.findByRole('dialog', { name: getMessage('product.detail') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    await waitFor(() => expect(window.location.pathname).toBe('/product/lot_3001'));
    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    expect(await screen.findByText(getMessage('discoverLots.title'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/discover');
  });

  it('keeps discover filters in the URL and restores them after returning from a product page', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.discover') }));

    await user.selectOptions(screen.getByLabelText(getMessage('filter.sort')), 'priceDesc');
    await user.selectOptions(screen.getByLabelText(getMessage('filter.status')), 'READY');
    await user.selectOptions(screen.getByLabelText(getMessage('filter.category')), 'jewelry');

    await waitFor(() => expect(window.location.pathname).toBe('/discover'));
    expect(window.location.search).toBe('?sort=priceDesc&status=READY&categoryId=jewelry');
    await waitFor(() => expect(api.searchLots).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'priceDesc', status: 'READY', categoryId: 'jewelry' })));

    await user.click(screen.getByRole('button', { name: getMessage('product.bidNow') }));
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/product\//));

    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    await waitFor(() => expect(window.location.pathname).toBe('/discover'));
    expect(window.location.search).toBe('?sort=priceDesc&status=READY&categoryId=jewelry');
    expect(screen.getByLabelText(getMessage('filter.sort'))).toHaveValue('priceDesc');
    expect(screen.getByLabelText(getMessage('filter.status'))).toHaveValue('READY');
    expect(screen.getByLabelText(getMessage('filter.category'))).toHaveValue('jewelry');
  });

  it('derives discover lot action buttons from deposit and order state', async () => {
    const baseLot = {
      roomId: 'room_1001',
      merchantId: 'merchant_01',
      categoryId: 'jewelry',
      startPrice: 0,
      currentPrice: 0,
      endTsMs: now + 120_000,
      ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 100, maxBidSteps: 10 } }
    };
    vi.mocked(api.searchLots).mockResolvedValueOnce({
      items: [
        { ...baseLot, id: 'lot_3001', auctionId: 'auc_2001', title: 'Enrolled Running Lot', status: 'RUNNING' as const, currentPrice: 150100 },
        { ...baseLot, id: 'lot_hammer_pending', auctionId: 'auc_hammer_pending', title: 'Hammer Pending Lot', status: 'HAMMER_PENDING' as const },
        { ...baseLot, id: 'lot_pending_pay', auctionId: 'auc_pending_pay', title: 'Won Pending Pay Lot', status: 'CLOSED_WON' as const, currentPrice: 46600 },
        { ...baseLot, id: 'lot_lost', auctionId: 'auc_lost', title: 'Closed Failed Lot', status: 'CLOSED_FAILED' as const }
      ],
      total: 4,
      page: 1,
      page_size: 20
    });
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.discover') }));

    const rowByTitle = (title: string) => {
      const row = screen.getByText(title).closest('.lot-result-card');
      expect(row).not.toBeNull();
      return row as HTMLElement;
    };

    expect(within(rowByTitle('Enrolled Running Lot')).getByRole('button', { name: getMessage('product.bidNow') })).toHaveClass('lot-action-button', 'is-primary-action');
    expect(within(rowByTitle('Hammer Pending Lot')).getByRole('button', { name: getMessage('auction.hammerInProgress') })).toBeDisabled();
    expect(within(rowByTitle('Hammer Pending Lot')).getByRole('button', { name: getMessage('auction.hammerInProgress') })).toHaveClass('is-disabled');
    expect(within(rowByTitle('Won Pending Pay Lot')).getByRole('button', { name: getMessage('auction.pay') })).toHaveClass('lot-action-button', 'is-primary-action');
    expect(within(rowByTitle('Closed Failed Lot')).getByRole('button', { name: getMessage('status.ended') })).toBeDisabled();
    expect(within(rowByTitle('Closed Failed Lot')).getByRole('button', { name: getMessage('status.ended') })).toHaveClass('is-disabled');
  });

  it('sends, drafts, likes, and toggles live-room comments', async () => {
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    const inputTrigger = await screen.findByRole('button', { name: getMessage('live.commentInput') });
    expect(screen.queryByText('主播正在讲解细节')).not.toBeInTheDocument();
    expect(screen.queryByText(getMessage('live.chat.bid'))).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('live.commentSend') })).not.toBeInTheDocument();
    const likeButton = screen.getByRole('button', { name: getMessage('live.likeRoom') });
    expect(likeButton).toBeInTheDocument();
    expect(likeButton).not.toHaveClass('is-liked');

    await user.click(likeButton);
    expect(await screen.findByText(getMessage('live.likes', undefined, { count: '1' }))).toBeInTheDocument();
    expect(likeButton).toHaveClass('is-liked');
    expect(likeButton).toHaveAttribute('aria-pressed', 'true');
    expect(likeButton.querySelector('.comment-like-burst')).toBeInTheDocument();
    expect(likeButton.querySelectorAll('.comment-like-burst span')).toHaveLength(15);

    await user.click(inputTrigger);
    const input = await screen.findByRole('textbox', { name: getMessage('live.commentInput') });
    await user.click(screen.getByRole('button', { name: getMessage('live.commentSend') }));
    expect(screen.queryByText('出价很激烈')).not.toBeInTheDocument();

    await user.type(input, '出价很激烈{enter}');
    expect(await screen.findByText('出价很激烈')).toBeInTheDocument();

    await user.type(input, 'Draft kept locally');
    expect(useLiveActivityStore.getState().commentDrafts.room_1001).toBe('Draft kept locally');
    await user.click(screen.getByRole('button', { name: getMessage('live.commentCloseComposer') }));
    expect(screen.queryByRole('textbox', { name: getMessage('live.commentInput') })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: getMessage('live.likedRoom') }).querySelector('.comment-like-burst')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: getMessage('live.commentInput') }));
    expect(await screen.findByRole('textbox', { name: getMessage('live.commentInput') })).toHaveValue('Draft kept locally');
    await user.click(screen.getByRole('button', { name: getMessage('live.commentCloseComposer') }));

    await user.click(screen.getByRole('button', { name: getMessage('live.commentHide') }));
    expect(screen.queryByLabelText(getMessage('live.commentInput'))).not.toBeInTheDocument();
    const showButton = screen.getByRole('button', { name: getMessage('live.commentShow') });
    expect(showButton.querySelector('img')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: getMessage('live.goodsEntry') })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: getMessage('live.commentShow') }));
    expect(await screen.findByRole('button', { name: getMessage('live.commentInput') })).toBeInTheDocument();
  });

  it('toggles live-room following and manages followed rooms from the following page', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('discover.enterLive') }));

    await user.click(await screen.findByRole('button', { name: `+${getMessage('live.follow')}` }));
    expect(await screen.findByRole('button', { name: getMessage('live.followed') })).toBeInTheDocument();
    expect(useLiveActivityStore.getState().followedRooms).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    await user.click(screen.getByRole('button', { name: getMessage('profile.following') }));

    const followingHeading = await screen.findByRole('heading', { name: getMessage('profile.followingTitle') });
    expect(followingHeading).toBeInTheDocument();
    expect(followingHeading.closest('.simple-page-header')?.querySelector('.eyebrow')).not.toBeInTheDocument();
    expect(await screen.findByText('珠宝严选直播间')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('profile.cancelFollow') }));
    expect(await screen.findByText(getMessage('profile.noFollowing'))).toBeInTheDocument();
    expect(useLiveActivityStore.getState().followedRooms).toHaveLength(0);
  });

  it('records live room footprints only when entering the full live room and shows them on the footprints page', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    expect(useLiveActivityStore.getState().footprints).toHaveLength(0);

    await user.click(await screen.findByRole('button', { name: getMessage('discover.enterLive') }));
    await screen.findByText('云上珠宝');
    expect(useLiveActivityStore.getState().footprints).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    await user.click(screen.getByRole('button', { name: getMessage('profile.footprints') }));

    const footprintHeading = await screen.findByRole('heading', { name: getMessage('profile.footprintTitle') });
    expect(footprintHeading).toBeInTheDocument();
    expect(footprintHeading.closest('.simple-page-header')?.querySelector('.eyebrow')).not.toBeInTheDocument();
    expect(await screen.findByText('珠宝严选直播间')).toBeInTheDocument();
  });

  it('shows following, footprints, and order shortcuts on the me page, then saves a local nickname from settings', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));

    expect(await screen.findByText('Buyer One')).toBeInTheDocument();
    const quickLinks = within(screen.getByLabelText(getMessage('profile.quickLinks')));
    expect(quickLinks.getByText(getMessage('profile.following'))).toBeInTheDocument();
    expect(quickLinks.getByText(getMessage('profile.footprints'))).toBeInTheDocument();
    expect(screen.queryByText(getMessage('profile.reminders'))).not.toBeInTheDocument();
    expect(screen.queryByText(getMessage('profile.favorites'))).not.toBeInTheDocument();

    const orders = within(screen.getByLabelText(getMessage('profile.myOrders')));
    expect(orders.getByRole('button', { name: getMessage('profile.orderAll') })).toBeInTheDocument();
    expect(orders.getByText(getMessage('profile.pendingBid'))).toBeInTheDocument();
    expect(orders.getByText(getMessage('profile.pendingPay'))).toBeInTheDocument();
    expect(orders.getByText(getMessage('profile.pendingShipment'))).toBeInTheDocument();
    expect(orders.getByText(getMessage('profile.pendingReceipt'))).toBeInTheDocument();
    expect(orders.getByText(getMessage('profile.completed'))).toBeInTheDocument();

    await user.click(orders.getByRole('button', { name: getMessage('profile.orderAll') }));
    const ordersTitle = await screen.findByRole('heading', { name: getMessage('orders.title') });
    expect(ordersTitle).toBeInTheDocument();
    expect(ordersTitle.closest('.simple-page-header')?.querySelector('.eyebrow')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/orders');
    expect(window.location.search).toBe('?tab=all');
    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    expect(await screen.findByText('Buyer One')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('settings.title') }));
    const settingsTitle = await screen.findByRole('heading', { name: getMessage('settings.title') });
    expect(settingsTitle.closest('.simple-page-header')?.querySelector('.eyebrow')).not.toBeInTheDocument();
    const nickname = await screen.findByLabelText(getMessage('settings.nickname'));
    await user.clear(nickname);
    await user.type(nickname, 'Renamed Buyer');
    await user.click(screen.getByRole('button', { name: getMessage('settings.save') }));

    await waitFor(() => expect(api.updateMyProfile).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Renamed Buyer' })));
    expect(await screen.findByText('Renamed Buyer')).toBeInTheDocument();
  });

  it('switches the settings language immediately and persists the selected locale', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    await user.click(screen.getByRole('button', { name: getMessage('settings.title') }));

    expect(await screen.findByText(getMessage('settings.language'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: getMessage('settings.languageEnUs') }));

    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discover' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Me' })).toBeInTheDocument();

    expect(usePreferencesStore.getState().locale).toBe('en-US');
    const persisted = JSON.parse(localStorage.getItem('aieas-user-preferences') ?? '{}') as {
      state?: { locale?: string };
    };
    expect(persisted.state?.locale).toBe('en-US');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Simplified Chinese' }));
    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    expect(await screen.findByRole('button', { name: getMessage('nav.home') })).toBeInTheDocument();
    expect(usePreferencesStore.getState().locale).toBe('zh-CN');
  });

  it('logs out from settings and keeps local browsing data when requested', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await waitFor(() => expect(useSessionStore.getState().accessToken).toBe('jwt'));
    useLiveActivityStore.getState().followRoom({
      id: 'room_keep',
      title: '保留直播间',
      merchantName: '云上珠宝',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 1,
      watcherCount: 1
    });
    useLiveActivityStore.getState().recordFootprint({
      id: 'room_keep',
      title: '保留直播间',
      merchantName: '云上珠宝',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 1,
      watcherCount: 1
    });

    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    await user.click(screen.getByRole('button', { name: getMessage('settings.title') }));
    await user.click(await screen.findByRole('button', { name: getMessage('settings.logout') }));

    const dialog = await screen.findByRole('dialog', { name: getMessage('settings.logoutTitle') });
    await user.click(within(dialog).getByRole('button', { name: getMessage('settings.logoutKeepData') }));

    expect(await screen.findByRole('heading', { name: getMessage('login.title') })).toBeInTheDocument();
    expect(useSessionStore.getState().accessToken).toBe('');
    expect(useLiveActivityStore.getState().followedRooms).toHaveLength(1);
    expect(useLiveActivityStore.getState().footprints).toHaveLength(1);
  });

  it('logs out from settings and clears local browsing data when requested', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await waitFor(() => expect(useSessionStore.getState().accessToken).toBe('jwt'));
    useLiveActivityStore.getState().followRoom({
      id: 'room_clear',
      title: '清理直播间',
      merchantName: '云上珠宝',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 1,
      watcherCount: 1
    });
    useLiveActivityStore.getState().recordFootprint({
      id: 'room_clear',
      title: '清理直播间',
      merchantName: '云上珠宝',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 1,
      watcherCount: 1
    });
    useLiveActivityStore.getState().likeRoom('room_clear');
    useLiveActivityStore.getState().setCommentDraft('room_clear', 'draft');

    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    await user.click(screen.getByRole('button', { name: getMessage('settings.title') }));
    await user.click(await screen.findByRole('button', { name: getMessage('settings.logout') }));

    const dialog = await screen.findByRole('dialog', { name: getMessage('settings.logoutTitle') });
    await user.click(within(dialog).getByRole('button', { name: getMessage('settings.logoutClearData') }));

    expect(await screen.findByRole('heading', { name: getMessage('login.title') })).toBeInTheDocument();
    expect(useSessionStore.getState().accessToken).toBe('');
    expect(useLiveActivityStore.getState().followedRooms).toHaveLength(0);
    expect(useLiveActivityStore.getState().footprints).toHaveLength(0);
    expect(useLiveActivityStore.getState().roomLikeCounts).toEqual({});
    expect(useLiveActivityStore.getState().commentDrafts).toEqual({});
  });

  it('opens the payment page from a pending-pay auction record', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    const orders = within(screen.getByLabelText(getMessage('profile.myOrders')));
    await user.click(orders.getByText(getMessage('profile.pendingPay')).closest('button') as HTMLElement);
    await user.click(await screen.findByRole('button', { name: getMessage('profile.payNow') }));

    expect(await screen.findByText(getMessage('pay.title'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/pay/ord_pending_pay');
  });

  it('shows payment SVG states during mock payment', async () => {
    let resolvePayment: (order: Awaited<ReturnType<ApiClient['payOrder']>>) => void = () => undefined;
    vi.mocked(api.payOrder).mockImplementationOnce(() =>
      new Promise((resolve) => {
        resolvePayment = resolve;
      })
    );
    seedSession();
    renderWithRouter('/pay/ord_pending_pay');
    const user = userEvent.setup();

    expect(await screen.findByRole('img', { name: getMessage('pay.idleStatus') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('pay.submit') }));
    expect(screen.getByRole('img', { name: getMessage('pay.processingStatus') })).toBeInTheDocument();

    await act(async () => {
      resolvePayment({
        id: 'ord_pending_pay',
        auctionId: 'auc_pending_pay',
        buyerId: 'u1',
        amount: 46600,
        status: 'PAID',
        payStatus: 'PAID',
        fulfillmentStatus: 'UNSHIPPED',
        paidAt: '2026-06-05T12:00:00+08:00'
      });
    });

    expect(await screen.findByRole('img', { name: getMessage('pay.successStatus') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: getMessage('pay.paid') })).toBeDisabled();
  });

  it('waits two seconds before returning to the live room after payment succeeds', async () => {
    let delayedReturn: (() => void) | undefined;
    const originalSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 2000 && typeof handler === 'function') {
        delayedReturn = () => handler(...args);
        return 2_000_001;
      }
      return originalSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout);
    seedSession();
    renderWithRouter(`/pay/ord_pending_pay?returnTo=${encodeURIComponent('/live/room_1001?from=home')}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: getMessage('pay.submit') }));
    expect(await screen.findByRole('img', { name: getMessage('pay.successStatus') })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/pay/ord_pending_pay');
    expect(delayedReturn).toBeDefined();
    expect(window.location.pathname).toBe('/pay/ord_pending_pay');

    await act(async () => {
      delayedReturn?.();
    });
    await waitFor(() => expect(window.location.pathname).toBe('/live/room_1001'));
    expect(window.location.search).toBe('?from=home');
  });

  it('disables payment when the latest backend order has timed out', async () => {
    vi.mocked(api.listMyOrders).mockResolvedValueOnce({
      items: [
        {
          id: 'ord_pending_pay',
          auctionId: 'auc_pending_pay',
          buyerId: 'u1',
          amount: 46600,
          status: 'TIMEOUT',
          payStatus: 'UNPAID'
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    seedSession();
    renderWithRouter('/orders?tab=all');

    const row = (await screen.findByText('Pending Payment Lot')).closest('.record-card') as HTMLElement;
    expect(row).not.toBeNull();
    expect(within(row).queryByRole('button', { name: getMessage('profile.payNow') })).not.toBeInTheDocument();
  });

  it('shows a closed payment state when the order detail has timed out', async () => {
    vi.mocked(api.getOrder).mockResolvedValueOnce({
      id: 'ord_pending_pay',
      auctionId: 'auc_pending_pay',
      buyerId: 'u1',
      amount: 46600,
      status: 'TIMEOUT',
      payStatus: 'UNPAID'
    });
    seedSession();
    renderWithRouter('/pay/ord_pending_pay');

    expect(await screen.findByRole('img', { name: getMessage('pay.closedStatus') })).toBeInTheDocument();
    expect(screen.getByText(getMessage('pay.closed'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: getMessage('pay.closedStatus') })).toBeDisabled();
  });

  it('returns to the derived order tab after payment', async () => {
    let resolvePayment: (order: Awaited<ReturnType<ApiClient['payOrder']>>) => void = () => undefined;
    let delayedReturn: (() => void) | undefined;
    const originalSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 2000 && typeof handler === 'function') {
        delayedReturn = () => handler(...args);
        return 2_000_002;
      }
      return originalSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout);
    vi.mocked(api.payOrder).mockImplementationOnce(() =>
      new Promise((resolve) => {
        resolvePayment = resolve;
      })
    );
    seedSession();
    renderWithRouter('/orders?tab=pendingPay');
    const user = userEvent.setup();

    expect(await screen.findByText('Pending Payment Lot')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: getMessage('profile.payNow') }));
    expect(window.location.pathname).toBe('/pay/ord_pending_pay');

    await user.click(screen.getByRole('button', { name: getMessage('pay.submit') }));

    await act(async () => {
      resolvePayment({
        id: 'ord_pending_pay',
        auctionId: 'auc_pending_pay',
        buyerId: 'u1',
        amount: 46600,
        status: 'PAID',
        payStatus: 'PAID',
        fulfillmentStatus: 'UNSHIPPED',
        paidAt: '2026-06-05T12:00:00+08:00'
      });
    });

    expect(delayedReturn).toBeDefined();
    expect(window.location.pathname).toBe('/pay/ord_pending_pay');
    await act(async () => {
      delayedReturn?.();
    });
    await waitFor(() => expect(window.location.pathname).toBe('/orders'));
    expect(window.location.search).toBe('?tab=pendingShipment&orderId=ord_pending_pay');
  });

  it('confirms receipt and moves the order from pending receipt to completed', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    const orders = within(screen.getByLabelText(getMessage('profile.myOrders')));
    await user.click(orders.getByText(getMessage('profile.pendingReceipt')).closest('button') as HTMLElement);

    expect(await screen.findByText('Pending Receipt Lot')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: getMessage('orders.confirmReceipt') }));

    const dialog = await screen.findByRole('dialog', { name: getMessage('orders.confirmReceiptTitle') });
    expect(within(dialog).getByText(getMessage('orders.confirmReceiptMessage'))).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: getMessage('orders.confirmReceipt') }));

    await waitFor(() => expect(api.confirmReceipt).toHaveBeenCalledWith('ord_pending_receipt'));
    await waitFor(() => expect(screen.queryByText('Pending Receipt Lot')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: getMessage('profile.completed') }));
    expect(await screen.findByText('Pending Receipt Lot')).toBeInTheDocument();
  });

  it('supports avatar crop drag, mobile pinch zoom, and PC wheel zoom', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:avatar') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const { container } = renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    await user.click(await screen.findByRole('button', { name: getMessage('profile.viewAvatar') }));

    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput as HTMLInputElement, { target: { files: [new File(['avatar'], 'avatar.png', { type: 'image/png' })] } });

    const cropFrame = await screen.findByTestId('avatar-crop-frame');
    const avatarImage = within(cropFrame).getByRole('img', { name: getMessage('profile.editAvatar') });
    expect(avatarImage.getAttribute('style')).toContain('translate(0px, 0px) scale(1)');

    fireTouch(cropFrame, 'touchStart', [{ identifier: 1, clientX: 110, clientY: 110 }]);
    fireTouch(cropFrame, 'touchMove', [{ identifier: 1, clientX: 138, clientY: 132 }]);
    fireTouch(cropFrame, 'touchEnd', []);
    expect(avatarImage.getAttribute('style')).toContain('translate(28px, 22px) scale(1)');

    fireTouch(cropFrame, 'touchStart', [
      { identifier: 2, clientX: 90, clientY: 130 },
      { identifier: 3, clientX: 170, clientY: 130 }
    ]);
    fireTouch(cropFrame, 'touchMove', [
      { identifier: 2, clientX: 90, clientY: 130 },
      { identifier: 3, clientX: 210, clientY: 130 }
    ]);
    fireTouch(cropFrame, 'touchEnd', []);
    expect(avatarImage.getAttribute('style')).toContain('scale(1.5)');

    fireEvent.wheel(cropFrame, { deltaY: -120 });
    expect(avatarImage.getAttribute('style')).toContain('scale(1.58)');

    firePointer(cropFrame, 'pointerdown', { pointerId: 4, pointerType: 'mouse', clientX: 100, clientY: 100 });
    firePointer(cropFrame, 'pointermove', { pointerId: 4, pointerType: 'mouse', clientX: 120, clientY: 125 });
    firePointer(cropFrame, 'pointerup', { pointerId: 4, pointerType: 'mouse', clientX: 120, clientY: 125 });
    expect(avatarImage.getAttribute('style')).toContain('translate(68px, 47px) scale(1.58)');
  });

  it('opens the current lot card as detail before enrollment, then uses quick bid after deposit', async () => {
    const stateBeforeEnroll = {
      auctionId: 'auc_2001',
      status: 'RUNNING' as const,
      currentPrice: 150100,
      leaderBidderId: 'u2',
      endTsMs: now + 120_000,
      serverTsMs: now,
      bidCount: 36,
      participantCount: 128
    };
    const stateAfterEnroll = { ...stateBeforeEnroll, participantCount: 129 };
    vi.mocked(api.getAuctionState)
      .mockResolvedValueOnce(stateBeforeEnroll)
      .mockResolvedValueOnce(stateBeforeEnroll)
      .mockResolvedValueOnce(stateAfterEnroll)
      .mockResolvedValueOnce(stateAfterEnroll);
    vi.mocked(api.enrollAuction).mockResolvedValueOnce({
      id: 'dep1',
      auctionId: 'auc_2001',
      userId: 'u1',
      amount: 5000,
      status: 'READY'
    });
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('discover.enterLive') }));
    expect(screen.getByLabelText(getMessage('live.statsOnline', 'zh-CN', { count: 328 }))).toBeInTheDocument();
    expect(screen.queryByText('1208')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: getMessage('auction.lookAround') })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '18K 金钻石项链' }));
    const firstDetailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    expect(firstDetailDialog).toBeInTheDocument();
    await user.click(within(firstDetailDialog).getByRole('button', { name: getMessage('common.close') }));
    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));

    const drawer = await screen.findByRole('dialog', { name: getMessage('live.goodsList') });
    expect(within(drawer).getByText('18K 金钻石项链')).toBeInTheDocument();
    expect(within(drawer).getByText(getMessage('auction.currentPriceLabel'))).toBeInTheDocument();

    const currentLotRow = within(drawer).getAllByTestId('lot-row')[0];
    await user.click(within(currentLotRow).getByRole('button', { name: getMessage('auction.lookAround') }));
    expect(await screen.findByRole('dialog', { name: getMessage('product.detail') })).toBeInTheDocument();

    const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
    const participantsMetric = () => within(detailDialog).getByText(getMessage('auction.participants')).closest('.metric') as HTMLElement;
    expect(participantsMetric()).toHaveTextContent('128');
    await user.click(within(detailDialog).getByRole('button', { name: detailEnrollAndPayText }));
    expect(await within(detailDialog).findByRole('button', { name: getMessage('product.bidNow') })).toBeInTheDocument();
    await waitFor(() => expect(participantsMetric()).toHaveTextContent('129'));
    await user.click(within(detailDialog).getByRole('button', { name: getMessage('common.close') }));
    const stillOpenDrawer = screen.getByRole('dialog', { name: getMessage('live.goodsList') });
    expect(stillOpenDrawer).toBeInTheDocument();
    await user.click(within(stillOpenDrawer).getByRole('button', { name: getMessage('common.close') }));
    await user.click(await screen.findByRole('button', { name: getMessage('auction.quickBid') }));

    const bidDialog = await screen.findByRole('dialog', { name: getMessage('bid.confirmTitle') });
    expect(screen.queryByRole('button', { name: getMessage('auction.quickBid') })).not.toBeInTheDocument();
    expect(within(bidDialog).getByText(getMessage('bid.myBid'))).toBeInTheDocument();
    expect(within(bidDialog).getByText(getMessage('auction.ceilingPrice'))).toBeInTheDocument();
    expect(within(bidDialog).queryByLabelText(getMessage('auction.manualBidPrice'))).not.toBeInTheDocument();
    expect(document.querySelectorAll('.quick-bid-countdown-unit')).toHaveLength(3);
    expect(within(bidDialog).getByText(getMessage('bid.leadingBadge', 'zh-CN', { name: '用户**02' }))).toBeInTheDocument();
    await user.click(within(bidDialog).getByRole('button', { name: getMessage('bid.increase') }));
    expect(within(bidDialog).getByText(/1503\.00/)).toBeInTheDocument();
    expect(within(bidDialog).getByText(getMessage('bid.aboveCurrentPriceNotice', 'zh-CN', { amount: '2元' }))).toBeInTheDocument();
    await user.click(within(bidDialog).getByRole('button', { name: getMessage('bid.submitNow') }));

    expect(await within(bidDialog).findByText(getMessage('bid.highestPriceNotice'))).toBeInTheDocument();
    expect((await screen.findAllByText(/1503\.00/)).length).toBeGreaterThan(0);
    vi.mocked(api.getAuctionState).mockReset();
    vi.mocked(api.getAuctionState).mockImplementation(async () => ({
      auctionId: 'auc_2001',
      status: 'RUNNING',
      currentPrice: 150100,
      leaderBidderId: 'u2',
      endTsMs: now + 120_000,
      serverTsMs: now,
      bidCount: 36,
      participantCount: 128
    }));
  });

  it('updates the bid sheet current price and leader from bid.accepted', async () => {
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
    await user.click(await screen.findByRole('button', { name: getMessage('auction.lookAround') }));
    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    await user.click(within(detailDialog).getByRole('button', { name: detailEnrollAndPayText }));
    await user.click(await within(detailDialog).findByRole('button', { name: getMessage('product.bidNow') }));
    const bidDialog = await screen.findByRole('dialog', { name: getMessage('bid.confirmTitle') });

    expect(within(bidDialog).getByText(/1501\.00/)).toBeInTheDocument();
    expect(within(bidDialog).getByText(getMessage('bid.leadingBadge', 'zh-CN', { name: '用户**02' }))).toBeInTheDocument();

    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'bid.accepted',
        payload: {
          auctionId: 'auc_2001',
          bidderId: 'u5',
          bidderNickname: '实时用户',
          price: 150200,
          currentPrice: 150200,
          leaderBidderId: 'u5',
          accepted: true,
          bidTsMs: now + 1000,
          endTime: new Date(now + 120_000).toISOString()
        }
      });
    });

    await waitFor(() => expect(within(bidDialog).getAllByText(/1502\.00/).length).toBeGreaterThan(0));
    expect(within(bidDialog).getByText(getMessage('bid.leadingBadge', 'zh-CN', { name: '实时用户' }))).toBeInTheDocument();
  });

  it('does not start the quick-bid interval after a rejected first bid', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installNativeRealtimeSocket();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      expect(sockets.length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
      await flushApp();
      const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
      fireEvent.click(within(detailDialog).getByRole('button', { name: detailEnrollAndPayText }));
      await flushApp();
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('product.bidNow') }));
      await flushApp();
      const bidDialog = screen.getByRole('dialog', { name: getMessage('bid.confirmTitle') });

      fireEvent.click(within(bidDialog).getByRole('button', { name: getMessage('bid.submitNow') }));
      await flushApp();
      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'bid.ack',
          payload: {
            accepted: false,
            auctionId: 'auc_2001',
            reason: 'BID_SERVICE_UNAVAILABLE',
            currentPrice: 150100,
            message: '出价失败'
          }
        });
      });
      await flushApp();

      expect(within(bidDialog).getByText('出价失败')).toBeInTheDocument();
      expect(within(bidDialog).queryByText(/出价太频繁/)).not.toBeInTheDocument();
      expect(warnSpy).toHaveBeenCalledWith(
        '[auction] bid rejected',
        expect.objectContaining({
          source: 'bid.ack',
          requestId: undefined,
          auctionId: 'auc_2001',
          reason: 'BID_SERVICE_UNAVAILABLE',
          message: '出价失败',
          currentPrice: 150100
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('confirms a quick bid from backend bid ack without waiting for the broadcast echo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installNativeRealtimeSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      expect(sockets.length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
      await flushApp();
      const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
      fireEvent.click(within(detailDialog).getByRole('button', { name: detailEnrollAndPayText }));
      await flushApp();
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('product.bidNow') }));
      await flushApp();
      const bidDialog = screen.getByRole('dialog', { name: getMessage('bid.confirmTitle') });

      fireEvent.click(within(bidDialog).getByRole('button', { name: getMessage('bid.submitNow') }));
      await flushApp();
      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'bid.ack',
          payload: {
            requestId: 'payload-only-request-id',
            accepted: true,
            auctionId: 'auc_2001',
            bidderId: 'u1',
            price: 150200,
            currentPrice: 150200,
            leaderBidderId: 'u1',
            endTime: new Date(now + 120_000).toISOString()
          }
        });
      });
      await flushApp();

      expect(within(bidDialog).getByText(getMessage('bid.highestPriceNotice'))).toBeInTheDocument();
      expect(within(bidDialog).queryByText(getMessage('bid.intervalWaiting', 'zh-CN', { seconds: 2 }))).not.toBeInTheDocument();
      expect(screen.getAllByText(/1502\.00/).length).toBeGreaterThan(0);

      await act(async () => {
        vi.advanceTimersByTime(8000);
      });
      expect(within(bidDialog).queryByText(getMessage('auction.bidRealtimeTimeout'))).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps quick-bid increases to the backend max bid steps rule', async () => {
    const maxStepLotsPage = {
      items: [
        {
          id: 'lot_max_step_1',
          auctionId: '56742545326592',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'digital',
          title: 'Max step lot',
          description: 'Backend allows only one bid step.',
          status: 'RUNNING',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 120_000,
          ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 100, maxBidSteps: 1 } },
          depositAmount: 0,
          participantCount: 0,
          bidCount: 0
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    };
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce(maxStepLotsPage).mockResolvedValueOnce(maxStepLotsPage);
    const maxStepAuctionState = {
      auctionId: '56742545326592',
      status: 'RUNNING',
      currentPrice: 0,
      endTsMs: now + 120_000,
      serverTsMs: now,
      bidCount: 0,
      participantCount: 0
    } as const;
    vi.mocked(api.getAuctionState).mockResolvedValueOnce(maxStepAuctionState).mockResolvedValueOnce(maxStepAuctionState);
    vi.mocked(api.enrollAuction).mockResolvedValueOnce({
      id: 'dep_max_step',
      auctionId: '56742545326592',
      userId: 'u1',
      amount: 0,
      status: 'READY'
    });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001?lotId=lot_max_step_1');
    renderApp();
    const user = userEvent.setup();

    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    await user.click(within(detailDialog).getByRole('button', { name: detailEnrollAndPayText }));
    await user.click(await within(detailDialog).findByRole('button', { name: getMessage('product.bidNow') }));

    const bidDialog = await screen.findByRole('dialog', { name: getMessage('bid.confirmTitle') });
    expect(within(bidDialog).getAllByText(/1\.00/).length).toBeGreaterThan(0);
    expect(within(bidDialog).getByRole('button', { name: getMessage('bid.increase') })).toBeDisabled();
    expect(within(bidDialog).queryByText(/2\.00/)).not.toBeInTheDocument();
  });

  it('opens only one initial lot detail sheet in strict mode', async () => {
    seedSession();
    renderWithRouter('/live/room_1001?lotId=lot_3001&from=me', { strict: true });

    await screen.findByRole('dialog', { name: getMessage('product.detail') });
    expect(screen.getAllByRole('dialog', { name: getMessage('product.detail') })).toHaveLength(1);
  });

  it('renders the lot list as a half-screen scroll sheet with the running lot pinned first and original sequence visible', async () => {
    const scheduledStartMs = now + 600_000;
    const scheduledStartLabel = getMessage('auction.scheduledStartAt', 'zh-CN', {
      time: new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduledStartMs))
    });
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_1001',
      title: '鐝犲疂涓ラ€夌洿鎾棿',
      merchantName: '浜戜笂鐝犲疂',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 328,
      watcherCount: 1208,
      activeAuctionId: 'auc_2002',
      videoUrl: '/media/live-room-demo.mp4'
    });
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [
        {
          id: 'lot_3001',
          auctionId: 'auc_2001',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: 'Upcoming first lot',
          status: 'WARMING_UP',
          startPrice: 0,
          currentPrice: 0,
          startTsMs: scheduledStartMs,
          endTsMs: now + 420_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 } }
        },
        {
          id: 'lot_3002',
          auctionId: 'auc_2002',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: 'Running second lot',
          status: 'RUNNING',
          startPrice: 0,
          currentPrice: 86000,
          leaderBidderId: 'u2',
          endTsMs: now + 120_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 } }
        },
        {
          id: 'lot_3003',
          auctionId: 'auc_2003',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: 'Later third lot',
          status: 'READY',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 720_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 } }
        }
      ],
      total: 3,
      page: 1,
      page_size: 20
    });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));
    const drawer = await screen.findByRole('dialog', { name: getMessage('live.goodsList') });
    const rows = within(drawer).getAllByTestId('lot-row');

    expect(drawer).toHaveClass('lot-list-sheet');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass('is-active');
    expect(rows[0]).toHaveAttribute('data-original-index', '2');
    const firstSequence = rows[0].querySelector('.lot-thumb-frame .lot-sequence');
    expect(firstSequence).toHaveTextContent('2');
    expect(firstSequence).toHaveAttribute('aria-label', '#2');
    expect(within(rows[0]).getByText('Running second lot')).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute('data-original-index', '1');
    const secondSequence = rows[1].querySelector('.lot-thumb-frame .lot-sequence');
    expect(secondSequence).toHaveTextContent('1');
    expect(secondSequence).toHaveAttribute('aria-label', '#1');
    expect(within(rows[1]).getByText('Upcoming first lot')).toBeInTheDocument();
    expect(within(rows[1]).getByText(scheduledStartLabel)).toBeInTheDocument();

    await user.click(rows[1]);
    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    expect(detailDialog).toHaveClass('detail-sheet');
    expect(within(detailDialog).getByText(scheduledStartLabel)).toBeInTheDocument();
    expect(within(detailDialog).getByRole('button', { name: detailWaitingText })).toBeDisabled();
    expect(screen.getByRole('dialog', { name: getMessage('live.goodsList') })).toBeInTheDocument();

    await user.click(within(detailDialog).getByRole('button', { name: getMessage('common.close') }));
    expect(screen.getByRole('dialog', { name: getMessage('live.goodsList') })).toBeInTheDocument();
  });

  it('does not fall back to demo lots after the live room lots endpoint returns empty', async () => {
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_empty',
      title: 'Empty Room',
      merchantName: 'Empty Merchant',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 0,
      watcherCount: 0,
      videoUrl: '/media/live-room-demo.mp4'
    });
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      page_size: 20
    });
    seedSession();
    window.history.pushState(null, '', '/live/room_empty');
    renderApp();
    const user = userEvent.setup();

    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalledWith('room_empty'));
    await waitFor(() => expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument());
    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));

    const drawer = await screen.findByRole('dialog', { name: getMessage('live.goodsList') });
    expect(within(drawer).queryAllByTestId('lot-row')).toHaveLength(0);
    expect(within(drawer).queryByText('18K 金钻石项链')).not.toBeInTheDocument();
  });

  it('refreshes the open live room lot list when lots are mounted or unmounted', async () => {
    const sockets = installMockControlSocket();
    const scheduledStartMs = now + 600_000;
    const scheduledStartLabel = getMessage('auction.scheduledStartAt', 'zh-CN', {
      time: new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(scheduledStartMs))
    });
    const runningLot = {
      id: 'lot_3001',
      auctionId: 'auc_2001',
      roomId: 'room_1001',
      merchantId: 'merchant_01',
      categoryId: 'jewelry',
      title: '18K 金钻石项链',
      status: 'RUNNING' as const,
      startPrice: 0,
      currentPrice: 150100,
      leaderBidderId: 'u2',
      endTsMs: now + 120_000,
      ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 100, maxBidSteps: 10 } }
    };
    const mountedLot = {
      id: 'lot_new_mount',
      auctionId: 'auc_new_mount',
      roomId: 'room_1001',
      merchantId: 'merchant_01',
      categoryId: 'jewelry',
      title: '新上架碧玺戒指',
      status: 'READY' as const,
      startPrice: 0,
      currentPrice: 0,
      endTsMs: now + 420_000,
      ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 200, maxBidSteps: 10 } }
    };
    vi.mocked(api.getLiveRoom).mockResolvedValue({
      id: 'room_1001',
      title: '珠宝严选直播间',
      merchantName: '云上珠宝',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 328,
      watcherCount: 1208,
      activeAuctionId: 'auc_2001',
      liveSessionId: 9001,
      videoUrl: '/media/live-room-demo.mp4'
    });
    vi.mocked(api.listLiveRoomLots)
      .mockResolvedValueOnce({
        items: [runningLot],
        total: 1,
        page: 1,
        page_size: 20
      })
      .mockResolvedValueOnce({
        items: [runningLot, mountedLot],
        total: 2,
        page: 1,
        page_size: 20
      })
      .mockResolvedValueOnce({
        items: [
          runningLot,
          {
            ...mountedLot,
            status: 'WARMING_UP' as const,
            startTsMs: scheduledStartMs
          }
        ],
        total: 2,
        page: 1,
        page_size: 20
      })
      .mockResolvedValueOnce({
        items: [runningLot],
        total: 1,
        page: 1,
        page_size: 20
      });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));
    const drawer = await screen.findByRole('dialog', { name: getMessage('live.goodsList') });
    expect(within(drawer).queryByText('新上架碧玺戒指')).not.toBeInTheDocument();

    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'live_session.lot_mounted',
        liveSessionId: 9001,
        payload: {
          liveSessionId: 9001,
          auctionId: 'auc_new_mount',
          action: 'mounted'
        }
      });
    });

    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalledTimes(2));
    expect(within(drawer).getByText('新上架碧玺戒指')).toBeInTheDocument();

    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'live_session.lot_changed',
        liveSessionId: 9001,
        payload: {
          liveSessionId: 9001,
          auctionId: 'auc_new_mount',
          action: 'scheduled'
        }
      });
    });

    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalledTimes(3));
    expect(within(drawer).getByText(scheduledStartLabel)).toBeInTheDocument();

    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'live_session.lot_unmounted',
        liveSessionId: 9001,
        payload: {
          liveSessionId: 9001,
          auctionId: 'auc_new_mount',
          action: 'unmounted'
        }
      });
    });

    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalledTimes(4));
    expect(within(drawer).queryByText('新上架碧玺戒指')).not.toBeInTheDocument();
  });

  it('hides the current lot immediately when the merchant cancels explaining', async () => {
    const sockets = installMockControlSocket();
    const runningLot = {
      id: 'lot_cancel_explain',
      auctionId: 'auc_2001',
      roomId: 'room_1001',
      merchantId: 'merchant_01',
      categoryId: 'jewelry',
      title: '取消讲解测试拍品',
      status: 'RUNNING' as const,
      startPrice: 0,
      currentPrice: 150100,
      leaderBidderId: 'u2',
      endTsMs: now + 120_000,
      ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 100, maxBidSteps: 10 } }
    };
    const readyLot = {
      ...runningLot,
      status: 'READY' as const,
      currentPrice: 0,
      leaderBidderId: undefined
    };
    vi.mocked(api.getLiveRoom)
      .mockResolvedValueOnce({
        id: 'room_1001',
        title: '珠宝严选直播间',
        merchantName: '云上珠宝',
        status: 'LIVE',
        videoSource: 'recorded',
        onlineCount: 328,
        watcherCount: 1208,
        activeAuctionId: 'auc_2001',
        liveSessionId: 9001,
        videoUrl: '/media/live-room-demo.mp4'
      })
      .mockResolvedValue({
        id: 'room_1001',
        title: '珠宝严选直播间',
        merchantName: '云上珠宝',
        status: 'LIVE',
        videoSource: 'recorded',
        onlineCount: 328,
        watcherCount: 1208,
        activeAuctionId: undefined,
        liveSessionId: 9001,
        videoUrl: '/media/live-room-demo.mp4'
      });
    vi.mocked(api.listLiveRoomLots)
      .mockResolvedValueOnce({
        items: [runningLot],
        total: 1,
        page: 1,
        page_size: 20
      })
      .mockResolvedValue({
        items: [readyLot],
        total: 1,
        page: 1,
        page_size: 20
      });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();

    await waitFor(() => expect(document.querySelector('.live-ranking-rail')).toBeInTheDocument());
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'live_session.lot_changed',
        liveSessionId: 9001,
        payload: {
          liveSessionId: 9001,
          auctionId: 'auc_2001',
          action: 'cancelled'
        }
      });
    });

    await waitFor(() => expect(document.querySelector('.live-ranking-rail')).not.toBeInTheDocument());
    expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument();
    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalledTimes(2));
  });

  it('derives lot list action buttons from auction status and order state', async () => {
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_1001',
      title: 'Action State Room',
      merchantName: 'Action Merchant',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 328,
      watcherCount: 1208,
      activeAuctionId: 'auc_running_enrolled',
      videoUrl: '/media/live-room-demo.mp4'
    });
    const baseLot = {
      roomId: 'room_1001',
      merchantId: 'merchant_01',
      categoryId: 'jewelry',
      startPrice: 0,
      currentPrice: 0,
      endTsMs: now + 120_000,
      ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 100, maxBidSteps: 10 } }
    };
    const runningLot = { ...baseLot, id: 'lot_running_enrolled', auctionId: 'auc_running_enrolled', title: 'Enrolled Running Lot', status: 'RUNNING' as const, currentPrice: 120000 };
    const failedLot = { ...baseLot, id: 'lot_failed', auctionId: 'auc_failed', title: 'Failed Lot', status: 'CLOSED_FAILED' as const };
    const lostWonLot = { ...baseLot, id: 'lot_lost_won', auctionId: 'auc_lost_won', title: 'Lost Sold Lot', status: 'CLOSED_WON' as const, leaderBidderId: 'u2' };
    const hammerLot = { ...baseLot, id: 'lot_hammer_pending', auctionId: 'auc_hammer_pending', title: 'Hammer Pending Lot', status: 'HAMMER_PENDING' as const };
    const wonUnpaidLot = { ...baseLot, id: 'lot_won_unpaid', auctionId: 'auc_won_unpaid', title: 'Won Unpaid Lot', status: 'CLOSED_WON' as const, currentPrice: 188800, leaderBidderId: 'u1' };
    const readyLot = { ...baseLot, id: 'lot_ready', auctionId: 'auc_ready', title: 'Ready Lot', status: 'READY' as const };
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [failedLot, lostWonLot, runningLot, hammerLot, wonUnpaidLot, readyLot],
      total: 6,
      page: 1,
      page_size: 20
    });
    vi.mocked(api.listMyAuctionRecords).mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 20 });
    vi.mocked(api.listMyOrders).mockResolvedValueOnce({
      items: [
        {
          id: 'ord_won_unpaid',
          auctionId: 'auc_won_unpaid',
          lotId: 'lot_won_unpaid',
          buyerId: 'u1',
          amount: 188800,
          payStatus: 'UNPAID',
          status: 'PENDING_PAY',
          createdAt: '2026-06-05T08:00:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));

    const rowByTitle = (title: string) => {
      const row = screen.getByText(title).closest('.lot-row');
      expect(row).not.toBeNull();
      return row as HTMLElement;
    };

    expect(within(rowByTitle('Failed Lot')).getByRole('button', { name: getMessage('status.ended') })).toBeDisabled();
    expect(within(rowByTitle('Lost Sold Lot')).getByRole('button', { name: getMessage('status.ended') })).toBeDisabled();
    expect(within(rowByTitle('Enrolled Running Lot')).getByRole('button', { name: getMessage('auction.lookAround') })).toBeEnabled();
    expect(within(rowByTitle('Hammer Pending Lot')).getByRole('button', { name: '截拍中' })).toBeDisabled();
    expect(within(rowByTitle('Ready Lot')).getByRole('button', { name: getMessage('auction.lookAround') })).toBeEnabled();

    await user.click(within(rowByTitle('Won Unpaid Lot')).getByRole('button', { name: getMessage('auction.pay') }));
    await waitFor(() => expect(window.location.pathname).toBe('/pay/ord_won_unpaid'));
    expect(window.location.search).toBe(`?returnTo=${encodeURIComponent('/live/room_1001')}`);

    await user.click(await screen.findByRole('button', { name: getMessage('pay.submit') }));
    expect(api.payOrder).toHaveBeenCalledWith('ord_won_unpaid');
    expect(await screen.findByRole('img', { name: getMessage('pay.successStatus') })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/pay/ord_won_unpaid');
  });

  it('opens the paid winning order from the lot list view-order action', async () => {
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_1001',
      title: 'Paid Order Room',
      merchantName: 'Paid Merchant',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 328,
      watcherCount: 1208,
      videoUrl: '/media/live-room-demo.mp4'
    });
    const paidWonLot = {
      id: 'lot_won_paid',
      auctionId: 'auc_won_paid',
      roomId: 'room_1001',
      merchantId: 'merchant_01',
      categoryId: 'jewelry',
      title: 'Paid Winning Lot',
      status: 'CLOSED_WON' as const,
      startPrice: 0,
      currentPrice: 166600,
      leaderBidderId: 'u1',
      endTsMs: now - 60_000,
      ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 100, maxBidSteps: 10 } }
    };
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [paidWonLot],
      total: 1,
      page: 1,
      page_size: 20
    });
    vi.mocked(api.listMyOrders).mockResolvedValueOnce({
      items: [
        {
          id: 'ord_won_paid',
          auctionId: 'auc_won_paid',
          lotId: 'lot_won_paid',
          buyerId: 'u1',
          amount: 166600,
          payStatus: 'PAID',
          status: 'PAID',
          fulfillmentStatus: 'UNSHIPPED',
          createdAt: '2026-06-05T08:00:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));
    const row = screen.getByText('Paid Winning Lot').closest('.lot-row') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: getMessage('auction.viewOrder') }));

    await waitFor(() => expect(window.location.pathname).toBe('/orders'));
    expect(window.location.search).toBe('?tab=pendingShipment&orderId=ord_won_paid');
  });

  it('keeps row and action paths separate for an enrolled running lot in the lot list', async () => {
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));
    const drawer = await screen.findByRole('dialog', { name: getMessage('live.goodsList') });
    const runningRow = within(drawer).getAllByTestId('lot-row')[0];

    await user.click(runningRow);
    const enrollmentDetail = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    await user.click(within(enrollmentDetail).getByRole('button', { name: detailEnrollAndPayText }));
    expect(await within(enrollmentDetail).findByRole('button', { name: getMessage('product.bidNow') })).toBeInTheDocument();
    await user.click(within(enrollmentDetail).getByRole('button', { name: getMessage('common.close') }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: getMessage('product.detail') })).not.toBeInTheDocument());

    const listDialog = screen.getByRole('dialog', { name: getMessage('live.goodsList') });
    const enrolledRunningRow = within(listDialog).getAllByTestId('lot-row')[0];
    await user.click(enrolledRunningRow);

    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    const listBackdrop = listDialog.closest('.sheet-backdrop') as HTMLElement;
    const detailBackdrop = detailDialog.closest('.sheet-backdrop') as HTMLElement;
    expect(detailDialog).toHaveClass('detail-sheet');
    expect(detailBackdrop.style.getPropertyValue('--sheet-enter-duration-ms')).toBe('250ms');
    expect(Number(detailBackdrop.style.zIndex)).toBeGreaterThan(Number(listBackdrop.style.zIndex));
    expect(screen.getByRole('dialog', { name: getMessage('live.goodsList') })).toBeInTheDocument();

    await user.click(within(detailDialog).getByRole('button', { name: getMessage('common.close') }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: getMessage('product.detail') })).not.toBeInTheDocument());

    const reopenedList = screen.getByRole('dialog', { name: getMessage('live.goodsList') });
    const actionRow = within(reopenedList).getAllByTestId('lot-row')[0];
    await user.click(within(actionRow).getByRole('button', { name: getMessage('product.bidNow') }));

    const closingListBackdrop = document.querySelector('.sheet-backdrop.is-closing .lot-list-sheet')?.closest('.sheet-backdrop') as HTMLElement | null;
    const bidDialog = await screen.findByRole('dialog', { name: getMessage('bid.confirmTitle') });
    const bidLayer = bidDialog.closest('.sheet-layer') as HTMLElement;
    expect(closingListBackdrop).not.toBeNull();
    expect(closingListBackdrop?.style.getPropertyValue('--sheet-exit-duration-ms')).toBe('150ms');
    expect(bidDialog.closest('.sheet-backdrop')).toBeNull();
    expect(bidLayer.style.getPropertyValue('--sheet-enter-duration-ms')).toBe('150ms');
    expect(bidLayer.style.getPropertyValue('--sheet-exit-duration-ms')).toBe('150ms');
    expect(Number(bidLayer.style.zIndex)).toBeGreaterThan(Number(closingListBackdrop?.style.zIndex ?? 0));
    expect(screen.queryByRole('dialog', { name: getMessage('product.detail') })).not.toBeInTheDocument();
  });

  it('shows paid winning lots as view-order actions and highlights the target order', async () => {
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_1001',
      title: 'Paid order room',
      merchantName: 'Order Merchant',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 328,
      watcherCount: 1208,
      videoUrl: '/media/live-room-demo.mp4'
    });
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [
        {
          id: 'lot_completed',
          auctionId: 'auc_completed',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          title: 'Completed Lot',
          description: 'A paid settled lot description.',
          status: 'SETTLED',
          startPrice: 0,
          currentPrice: 79000,
          finalPrice: 79000,
          endTsMs: now - 240_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 } }
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));
    const drawer = await screen.findByRole('dialog', { name: getMessage('live.goodsList') });
    await user.click(within(drawer).getByTestId('lot-row'));

    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    const viewOrderButton = within(detailDialog).getByRole('button', { name: detailViewOrderText });
    await user.click(viewOrderButton);

    await waitFor(() => expect(window.location.pathname).toBe('/orders'));
    expect(window.location.search).toContain('tab=completed');
    expect(window.location.search).toContain('orderId=ord_completed');
    const highlightedOrder = await screen.findByTestId('order-record-ord_completed');
    expect(highlightedOrder).toHaveClass('is-highlighted');
  });

  it('keeps the detail sheet chrome fixed and expands the ranking list on demand', async () => {
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: getMessage('auction.lookAround') });

    await act(async () => {
      emitLatestMockControl(sockets, rankingUpdated([
            { rank: 1, bidderId: 'u2', bidderNickname: '用户**02', price: 150100},
            { rank: 2, bidderId: 'u3', bidderNickname: '用户**03', price: 150000},
            { rank: 3, bidderId: 'u4', bidderNickname: '用户**04', price: 149900},
            { rank: 4, bidderId: 'u5', bidderNickname: '用户**05', price: 149800}
          ]));
    });

    await user.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    expect(detailDialog).toHaveClass('detail-sheet');
    expect(detailDialog.querySelector('.detail-sheet-header')).toBeInTheDocument();
    expect(detailDialog.querySelector('.detail-scroll-body')).toBeInTheDocument();
    expect(detailDialog.querySelector('.detail-sticky-actions')).toBeInTheDocument();

    expect(within(detailDialog).getByText('用户**05')).toBeInTheDocument();
    const toggle = within(detailDialog).getByRole('button', { name: detailExpandRankingText });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(await within(detailDialog).findByText('用户**05')).toBeInTheDocument();
    expect(within(detailDialog).getByRole('button', { name: detailCollapseRankingText })).toHaveAttribute('aria-expanded', 'true');
  });

  it('limits the lot detail ranking to top eight and places the toggle below the list', async () => {
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: getMessage('auction.lookAround') });

    await act(async () => {
      emitLatestMockControl(sockets, rankingUpdated(Array.from({ length: 9 }, (_, index) => ({
            rank: index + 1,
            bidderId: `u${index + 2}`,
            bidderNickname: `排名用户${index + 1}`,
            price: 150_100 - index * 100
          }))));
    });

    await user.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    const rankingPanel = detailDialog.querySelector('.detail-ranking-panel') as HTMLElement;
    const detailTitle = detailDialog.querySelector('.detail-header-title') as HTMLElement;
    expect(within(detailTitle).getByRole('heading', { name: getMessage('product.detail') })).toBeInTheDocument();
    expect(within(detailTitle).getByText('竞拍中')).toBeInTheDocument();
    expect(detailDialog.querySelector('.detail-status-strip')).toBeNull();
    expect(rankingPanel).toBeInTheDocument();
    expect(rankingPanel).not.toHaveClass('is-expanded');
    expect(within(rankingPanel).getByText('排名用户4')).toBeInTheDocument();
    expect(rankingPanel.querySelectorAll('.ranking-row')).toHaveLength(8);

    const firstPrice = within(rankingPanel).getByText('¥1501.00');
    expect(firstPrice).toHaveClass('detail-ranking-price');
    expect(firstPrice).toHaveClass('is-first');
    const toggle = within(rankingPanel).getByRole('button', { name: detailExpandRankingText });
    expect(toggle.closest('.detail-ranking-actions')).not.toBeNull();

    await user.click(toggle);
    expect(await within(rankingPanel).findByText('排名用户8')).toBeInTheDocument();
    expect(within(rankingPanel).queryByText('排名用户9')).not.toBeInTheDocument();
    expect(rankingPanel.querySelectorAll('.ranking-row')).toHaveLength(8);
    expect(rankingPanel).toHaveClass('is-expanded');
    await user.click(within(rankingPanel).getByRole('button', { name: detailCollapseRankingText }));
    expect(rankingPanel).not.toHaveClass('is-expanded');
    expect(rankingPanel.querySelectorAll('.ranking-row')).toHaveLength(8);
  });

  it('applies backend-shaped snapshot and ranking websocket payloads', async () => {
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: getMessage('auction.lookAround') });

    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'room.snapshot',
        payload: {
          auctionId: 'auc_2001',
          status: 'RUNNING',
          currentPrice: 150900,
          leaderBidderId: 'u9',
          endTime: new Date(now + 300_000).toISOString(),
          bidCount: 5,
          participantCount: 7
        }
      });
      emitLatestMockControl(sockets, rankingUpdated([{ rank: 1, bidderId: 'u9', bidderNickname: '后端用户', price: 150900 }]));
    });

    expect((await screen.findAllByText(/1509\.00/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    expect(within(detailDialog).getByText('后端用户')).toBeInTheDocument();
  });

  it('updates the live ranking immediately from bid.accepted while ranking snapshot is delayed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'bid.accepted',
          payload: {
            auctionId: 'auc_2001',
            bidderId: 'u5',
            bidderNickname: '实时用户',
            price: 150200,
            currentPrice: 150200,
            leaderBidderId: 'u5',
            accepted: true,
            bidTsMs: now + 1000,
            endTime: new Date(now + 120_000).toISOString()
          }
        });
      });

      const rankingRail = document.querySelector('.live-ranking-rail') as HTMLElement;
      expect(rankingRail).toHaveTextContent('实时用户');
      expect(rankingRail).toHaveTextContent('1502.00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('still consumes bid.accepted when room and ranking seq values are ahead', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      await act(async () => {
        emitLatestMockControl(sockets, { type: 'room.online', seq: 1, payload: { roomId: 'room_1001', online: 329 } });
        emitLatestMockControl(sockets, {
          ...rankingUpdated([{ rank: 1, bidderId: 'u8', bidderNickname: '旧榜用户', price: 150100 }]),
          seq: 2
        });
        emitLatestMockControl(sockets, {
          type: 'bid.accepted',
          seq: 1,
          payload: {
            auctionId: 'auc_2001',
            bidderId: 'u5',
            bidderNickname: '实时用户',
            price: 150200,
            currentPrice: 150200,
            leaderBidderId: 'u5',
            accepted: true,
            bidTsMs: now + 1000,
            endTime: new Date(now + 120_000).toISOString()
          }
        });
      });

      const rankingRail = document.querySelector('.live-ranking-rail') as HTMLElement;
      expect(rankingRail).toHaveTextContent('实时用户');
      expect(rankingRail).toHaveTextContent('1502.00');
      fireEvent.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
      await flushApp();
      const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
      expect(within(detailDialog).getAllByText(/1502\.00/).length).toBeGreaterThan(0);
      expect(within(detailDialog).getByText('实时用户')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the right ranking rail synchronized with the detail sheet after ranking.updated', async () => {
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: getMessage('auction.lookAround') });

    await act(async () => {
      emitLatestMockControl(sockets, rankingUpdated([{ rank: 1, bidderId: 'u8', bidderNickname: '旧榜用户', price: 150100 }]));
    });

    await user.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
    const detailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    expect(within(detailDialog).getByText('旧榜用户')).toBeInTheDocument();
    const rankingRail = document.querySelector('.live-ranking-rail') as HTMLElement;
    expect(rankingRail.querySelector('.live-ranking-top-list [data-bidder-id="u8"] .live-ranking-name')).toHaveTextContent('旧榜用户');
    expect(document.querySelector('.live-ranking-ghost')).not.toBeInTheDocument();
    expect(document.querySelector('.live-ranking-row.is-entering')).not.toBeInTheDocument();
    expect(document.querySelector('.live-ranking-row.is-shifted-down')).not.toBeInTheDocument();

    await act(async () => {
      emitLatestMockControl(sockets, rankingUpdated([{ rank: 1, bidderId: 'u10', bidderNickname: '右侧同步用户', price: 151000 }]));
    });

    expect(within(detailDialog).getByText('右侧同步用户')).toBeInTheDocument();
    expect(rankingRail.querySelector('.live-ranking-top-list [data-bidder-id="u10"] .live-ranking-name')).toHaveTextContent('右侧同步用户');
    expect(rankingRail).toHaveTextContent('1510.00');
    expect(document.querySelector('.live-ranking-ghost')).not.toBeInTheDocument();
    expect(document.querySelector('.live-ranking-row.is-entering')).not.toBeInTheDocument();
    expect(document.querySelector('.live-ranking-row.is-shifted-down')).not.toBeInTheDocument();
  });

  it('shows a right-docked live ranking rail, appends the current user, and collapses it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      await act(async () => {
        emitLatestMockControl(sockets, rankingUpdated([
          { rank: 1, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
          { rank: 2, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
          { rank: 3, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
          { rank: 4, bidderId: 'u5', bidderNickname: '用户**05', price: 149800 },
          { rank: 5, bidderId: 'u6', bidderNickname: '用户**06', price: 149700 },
          { rank: 6, bidderId: 'u7', bidderNickname: '用户**07', price: 149600 },
          { rank: 7, bidderId: 'u8', bidderNickname: '用户**08', price: 149500 },
          { rank: 8, bidderId: 'u9', bidderNickname: '用户**09', price: 149400 },
          { rank: 9, bidderId: 'u1', bidderNickname: '我', price: 149300 }
        ]));
      });

      const rankingRail = document.querySelector('.live-ranking-rail');
      expect(rankingRail).toBeInTheDocument();
      expect(document.querySelectorAll('.live-ranking-row')).toHaveLength(9);
      expect(rankingRail).toHaveTextContent('用户**09');
      expect(rankingRail).toHaveTextContent('我');
      expect(rankingRail).not.toHaveTextContent('当前出价前8名');
      expect(screen.getByRole('button', { name: getMessage('live.rankingCollapse') })).toHaveTextContent('收起');

      const collapseButton = screen.getByRole('button', { name: getMessage('live.rankingCollapse') });
      expect(collapseButton.firstElementChild?.tagName).toBe('B');
      expect(collapseButton.lastElementChild?.textContent).toBe('>');

      fireEvent.click(document.querySelector('.live-ranking-toggle') as Element);
      expect(document.querySelector('.live-ranking-rail.is-collapsed')).toBeInTheDocument();
      expect(document.querySelectorAll('.live-ranking-row')).toHaveLength(0);
      const expandButton = screen.getByRole('button', { name: getMessage('live.rankingExpand') });
      expect(expandButton.firstElementChild?.tagName).toBe('B');
      expect(expandButton.lastElementChild?.textContent).toBe('<');
      expect(screen.getByRole('button', { name: getMessage('live.rankingExpand') })).toHaveTextContent('排行榜');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders fixed ranking slots, placeholders, medals, and the pinned current user row', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      await act(async () => {
        emitLatestMockControl(sockets, rankingUpdated([
              { rank: 1, bidderId: 'u2', bidderNickname: '石榴与姜冬', price: 150100},
              { rank: 2, bidderId: 'u3', bidderNickname: '用户A23', price: 149800},
              { rank: 3, bidderId: 'u4', bidderNickname: '云拍小王', price: 148800}
            ]));
      });

      const rankingRail = document.querySelector('.live-ranking-rail') as HTMLElement;
      expect(rankingRail).toHaveTextContent(getMessage('auction.ranking'));
      expect(document.querySelectorAll('.live-ranking-top-list .live-ranking-row')).toHaveLength(8);
      expect(document.querySelectorAll('.live-ranking-row.is-placeholder')).toHaveLength(5);
      expect(document.querySelectorAll('.live-ranking-price.is-empty').length).toBeGreaterThanOrEqual(6);
      expect(document.querySelector('.live-ranking-rank.is-gold')).toBeInTheDocument();
      expect(document.querySelector('.live-ranking-rank.is-silver')).toBeInTheDocument();
      expect(document.querySelector('.live-ranking-rank.is-bronze')).toBeInTheDocument();
      expect(document.querySelector('.live-ranking-rank.is-plain')).toHaveTextContent('4');
      expect(document.querySelector('.live-ranking-row.is-leading .live-ranking-name')).toHaveTextContent('石榴与姜冬');
      expect(document.querySelector('.live-ranking-row.is-leading .live-ranking-price')).toHaveClass('is-leading-price');
      expect(document.querySelector('.live-ranking-current-row')).toHaveTextContent('我');
      expect(document.querySelector('.live-ranking-current-row .live-ranking-rank')).toHaveTextContent('-');
      expect(document.querySelector('.live-ranking-current-row .live-ranking-price')).toHaveTextContent('-');
      expect(document.querySelector('.live-ranking-divider')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('animates ranking changes for other bidders, current user bids, and interrupted updates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      const baseItems = [
        { rank: 1, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
        { rank: 2, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
        { rank: 3, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
        { rank: 4, bidderId: 'u5', bidderNickname: '用户**05', price: 149800 },
        { rank: 5, bidderId: 'u1', bidderNickname: '我', price: 149700 },
        { rank: 6, bidderId: 'u6', bidderNickname: '用户**06', price: 149600 },
        { rank: 7, bidderId: 'u7', bidderNickname: '用户**07', price: 149500 },
        { rank: 8, bidderId: 'u8', bidderNickname: '用户**08', price: 149400 },
        { rank: 9, bidderId: 'u9', bidderNickname: '用户**09', price: 149300 }
      ];

      await act(async () => {
        emitLatestMockControl(sockets, rankingUpdated(baseItems));
      });

      await act(async () => {
        emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u5', price: 150200, currentPrice: 150200, leaderBidderId: 'u5', accepted: true, endTime: new Date(now + 120_000).toISOString() } });
        emitLatestMockControl(sockets, rankingUpdated([
          { rank: 1, bidderId: 'u5', bidderNickname: '用户**05', price: 150200 },
          { rank: 2, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
          { rank: 3, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
          { rank: 4, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
          ...baseItems.slice(4)
        ]));
      });
      expect(document.querySelector('.live-ranking-ghost.is-other-bid')).toBeInTheDocument();
      expect(document.querySelector('.live-ranking-row.is-shifted-down')).toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u1', price: 150300, currentPrice: 150300, leaderBidderId: 'u1', accepted: true, endTime: new Date(now + 120_000).toISOString() } });
        emitLatestMockControl(sockets, rankingUpdated([
          { rank: 1, bidderId: 'u1', bidderNickname: '我', price: 150300 },
          { rank: 2, bidderId: 'u5', bidderNickname: '用户**05', price: 150200 },
          { rank: 3, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
          { rank: 4, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
          { rank: 5, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
          { rank: 6, bidderId: 'u6', bidderNickname: '用户**06', price: 149600 },
          { rank: 7, bidderId: 'u7', bidderNickname: '用户**07', price: 149500 },
          { rank: 8, bidderId: 'u8', bidderNickname: '用户**08', price: 149400 },
          { rank: 9, bidderId: 'u9', bidderNickname: '用户**09', price: 149300 }
        ]));
      });
      expect(document.querySelector('.live-ranking-ghost.is-other-bid')).not.toBeInTheDocument();
      expect(document.querySelector('.live-ranking-ghost.is-self-bid')).toBeInTheDocument();
      expect(document.querySelector('.live-ranking-row.is-entering')).toBeInTheDocument();
      expect(document.querySelector('.live-ranking-current-row')).not.toHaveClass('is-exiting');
      expect(document.querySelector('.live-ranking-current-row')).not.toHaveClass('is-shifted-down');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(document.querySelector('.live-ranking-ghost')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a top-slot origin when a visible bidder jumps to first place', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      const baseItems = [
        { rank: 1, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
        { rank: 2, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
        { rank: 3, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
        { rank: 4, bidderId: 'u5', bidderNickname: '用户**05', price: 149800 },
        { rank: 5, bidderId: 'u6', bidderNickname: '用户**06', price: 149700 },
        { rank: 6, bidderId: 'u7', bidderNickname: '用户**07', price: 149600 },
        { rank: 7, bidderId: 'u8', bidderNickname: '用户**08', price: 149500 },
        { rank: 8, bidderId: 'u9', bidderNickname: '用户**09', price: 149400 }
      ];

      await act(async () => {
        emitLatestMockControl(sockets, rankingUpdated(baseItems));
      });

      await act(async () => {
        emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u5', price: 150200, currentPrice: 150200, leaderBidderId: 'u5', accepted: true, endTime: new Date(now + 120_000).toISOString() } });
        emitLatestMockControl(sockets, rankingUpdated([
          { rank: 1, bidderId: 'u5', bidderNickname: '用户**05', price: 150200 },
          { rank: 2, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
          { rank: 3, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
          { rank: 4, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
          ...baseItems.slice(4)
        ]));
      });

      const ghost = document.querySelector('.live-ranking-ghost') as HTMLElement;
      expect(ghost).toHaveClass('is-top-slot-to-first');
      expect(ghost).toHaveAttribute('data-origin', 'top-slot');
      expect(ghost).toHaveAttribute('data-from-rank', '4');
      expect(ghost).toHaveAttribute('data-to-rank', '1');
      expect(ghost.querySelector('.live-ranking-rank')).toHaveTextContent('1');
      expect(ghost.querySelector('.live-ranking-price')).toHaveTextContent('1502.00');
      expect(document.querySelector('[data-bidder-id="u2"]')).toHaveClass('is-shifted-down');
      expect(document.querySelector('[data-bidder-id="u3"]')).toHaveClass('is-shifted-down');
      expect(document.querySelector('[data-bidder-id="u4"]')).toHaveClass('is-shifted-down');
      expect(document.querySelector('[data-bidder-id="u5"]')).toHaveClass('is-moving-target');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the divider origin and drops the eighth row when an outside bidder wins', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      const baseItems = [
        { rank: 1, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
        { rank: 2, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
        { rank: 3, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
        { rank: 4, bidderId: 'u5', bidderNickname: '用户**05', price: 149800 },
        { rank: 5, bidderId: 'u6', bidderNickname: '用户**06', price: 149700 },
        { rank: 6, bidderId: 'u7', bidderNickname: '用户**07', price: 149600 },
        { rank: 7, bidderId: 'u8', bidderNickname: '用户**08', price: 149500 },
        { rank: 8, bidderId: 'u9', bidderNickname: '用户**09', price: 149400 },
        { rank: 12, bidderId: 'u12', bidderNickname: '用户**12', price: 148900 }
      ];

      await act(async () => {
        emitLatestMockControl(sockets, rankingUpdated(baseItems));
      });

      await act(async () => {
        emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u12', price: 150300, currentPrice: 150300, leaderBidderId: 'u12', accepted: true, endTime: new Date(now + 120_000).toISOString() } });
        emitLatestMockControl(sockets, rankingUpdated([
          { rank: 1, bidderId: 'u12', bidderNickname: '用户**12', price: 150300 },
          { rank: 2, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
          { rank: 3, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
          { rank: 4, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
          { rank: 5, bidderId: 'u5', bidderNickname: '用户**05', price: 149800 },
          { rank: 6, bidderId: 'u6', bidderNickname: '用户**06', price: 149700 },
          { rank: 7, bidderId: 'u7', bidderNickname: '用户**07', price: 149600 },
          { rank: 8, bidderId: 'u8', bidderNickname: '用户**08', price: 149500 },
          { rank: 9, bidderId: 'u9', bidderNickname: '用户**09', price: 149400 }
        ]));
      });

      const ghost = document.querySelector('.live-ranking-ghost') as HTMLElement;
      expect(ghost).toHaveClass('is-divider-to-first');
      expect(ghost).toHaveAttribute('data-origin', 'divider');
      expect(ghost).toHaveAttribute('data-from-rank', '12');
      expect(document.querySelectorAll('.live-ranking-row.is-shifted-down')).toHaveLength(7);
      const exitRow = document.querySelector('.live-ranking-exit-row') as HTMLElement;
      expect(exitRow).toHaveClass('live-ranking-row');
      expect(exitRow).toHaveClass('is-exiting-to-divider');
      expect(exitRow).not.toHaveClass('live-ranking-ghost');
      expect(exitRow).toHaveAttribute('data-bidder-id', 'u9');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the pinned current user row stable when the ninth-ranked current user wins', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      const baseItems = [
        { rank: 1, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
        { rank: 2, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
        { rank: 3, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
        { rank: 4, bidderId: 'u5', bidderNickname: '用户**05', price: 149800 },
        { rank: 5, bidderId: 'u6', bidderNickname: '用户**06', price: 149700 },
        { rank: 6, bidderId: 'u7', bidderNickname: '用户**07', price: 149600 },
        { rank: 7, bidderId: 'u8', bidderNickname: '用户**08', price: 149500 },
        { rank: 8, bidderId: 'u9', bidderNickname: '用户**09', price: 149400 },
        { rank: 9, bidderId: 'u1', bidderNickname: '我', price: 148800 }
      ];

      await act(async () => {
        emitLatestMockControl(sockets, rankingUpdated(baseItems));
      });

      await act(async () => {
        emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u1', price: 150400, currentPrice: 150400, leaderBidderId: 'u1', accepted: true, endTime: new Date(now + 120_000).toISOString() } });
        emitLatestMockControl(sockets, rankingUpdated([
          { rank: 1, bidderId: 'u1', bidderNickname: '我', price: 150400 },
          { rank: 2, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
          { rank: 3, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
          { rank: 4, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
          { rank: 5, bidderId: 'u5', bidderNickname: '用户**05', price: 149800 },
          { rank: 6, bidderId: 'u6', bidderNickname: '用户**06', price: 149700 },
          { rank: 7, bidderId: 'u7', bidderNickname: '用户**07', price: 149600 },
          { rank: 8, bidderId: 'u8', bidderNickname: '用户**08', price: 149500 },
          { rank: 9, bidderId: 'u9', bidderNickname: '用户**09', price: 149400 }
        ]));
      });

      const ghost = document.querySelector('.live-ranking-ghost') as HTMLElement;
      expect(ghost).toHaveClass('is-current-row-to-first');
      expect(ghost).toHaveClass('is-self-bid');
      expect(ghost).toHaveAttribute('data-origin', 'current-row');
      expect(ghost).toHaveAttribute('data-from-rank', '9');
      expect(ghost).toHaveStyle({ '--ranking-ghost-duration-ms': '1000ms' });
      const currentRow = document.querySelector('.live-ranking-current-row') as HTMLElement;
      expect(currentRow).not.toHaveClass('is-exiting');
      expect(currentRow).not.toHaveClass('is-shifted-down');
      expect(currentRow.querySelector('.live-ranking-rank')).toHaveTextContent('9');
      expect(currentRow.querySelector('.live-ranking-price')).toHaveTextContent('1488.00');

      const exitRow = document.querySelector('.live-ranking-exit-row') as HTMLElement;
      expect(exitRow).toHaveClass('live-ranking-row');
      expect(exitRow).not.toHaveClass('live-ranking-ghost');
      expect(exitRow).toHaveAttribute('data-bidder-id', 'u9');

      await act(async () => {
        vi.advanceTimersByTime(520);
      });

      expect(currentRow.querySelector('.live-ranking-rank')).toHaveTextContent('1');
      expect(currentRow.querySelector('.live-ranking-price')).toHaveTextContent('1504.00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('animates only the price when the leader bids again without a rank change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();
      await flushApp();

      const baseItems = [
        { rank: 1, bidderId: 'u2', bidderNickname: '用户**02', price: 150100 },
        { rank: 2, bidderId: 'u3', bidderNickname: '用户**03', price: 150000 },
        { rank: 3, bidderId: 'u4', bidderNickname: '用户**04', price: 149900 },
        { rank: 4, bidderId: 'u5', bidderNickname: '用户**05', price: 149800 }
      ];

      await act(async () => {
        emitLatestMockControl(sockets, rankingUpdated(baseItems));
      });

      await act(async () => {
        emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u2', price: 150300, currentPrice: 150300, leaderBidderId: 'u2', accepted: true, endTime: new Date(now + 120_000).toISOString() } });
        emitLatestMockControl(sockets, rankingUpdated([
          { rank: 1, bidderId: 'u2', bidderNickname: '用户**02', price: 150300 },
          ...baseItems.slice(1)
        ]));
      });

      expect(document.querySelector('.live-ranking-ghost')).not.toBeInTheDocument();
      expect(document.querySelector('.live-ranking-row.is-shifted-down')).not.toBeInTheDocument();
      expect(document.querySelector('.live-ranking-row.is-price-updating')).toBeInTheDocument();
      expect(document.querySelector('.live-ranking-row.is-leading .live-ranking-price')).toHaveTextContent('1503.00');

      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(document.querySelector('.live-ranking-row.is-price-updating')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the live ranking rail when the room has no running lot', async () => {
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [
        {
          id: 'lot_3002',
          auctionId: 'auc_2002',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: '翡翠冰种吊坠',
          status: 'READY',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 } }
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();

    await screen.findByText('云上珠宝');
    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.live-ranking-rail')).not.toBeInTheDocument());
  });

  it('does not show the current lot card when the room has no running lot', async () => {
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [
        {
          id: 'lot_3002',
          auctionId: 'auc_2002',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: '缈＄繝鍐扮鍚婂潬',
          status: 'READY',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 } }
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();

    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: getMessage('auction.lookAround') })).not.toBeInTheDocument());
    expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument();
  });

  it('auto-refreshes a scheduled lot when its start time arrives without a websocket event', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const scheduledStartMs = now + 1000;
    const scheduledLot = {
      id: 'lot_scheduled',
      auctionId: 'auc_scheduled',
      roomId: 'room_1001',
      merchantId: 'merchant_01',
      categoryId: 'jewelry',
      title: '定时开拍翡翠戒指',
      status: 'WARMING_UP' as const,
      startPrice: 0,
      currentPrice: 0,
      startTsMs: scheduledStartMs,
      endTsMs: now + 300_000,
      ruleSnapshot: { incrementRule: { type: 'fixed' as const, amount: 200, maxBidSteps: 10 } }
    };
    vi.mocked(api.getLiveRoom).mockResolvedValue({
      id: 'room_1001',
      title: '珠宝严选直播间',
      merchantName: '云上珠宝',
      status: 'LIVE',
      videoSource: 'recorded',
      onlineCount: 328,
      watcherCount: 1208,
      videoUrl: '/media/live-room-demo.mp4'
    });
    vi.mocked(api.listLiveRoomLots)
      .mockResolvedValueOnce({
        items: [scheduledLot],
        total: 1,
        page: 1,
        page_size: 20
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...scheduledLot,
            status: 'RUNNING' as const,
            currentPrice: 2000
          }
        ],
        total: 1,
        page: 1,
        page_size: 20
      });

    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      expect(api.listLiveRoomLots).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(600);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      await flushApp();
      expect(api.listLiveRoomLots).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: '定时开拍翡翠戒指' })).toBeInTheDocument();
      expect(document.querySelector('.auction-float-card')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pops the current lot card up from the goods button when an auction starts', async () => {
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [
        {
          id: 'lot_3002',
          auctionId: 'auc_2002',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: '缈＄繝鍐扮鍚婂潬',
          status: 'READY',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 } }
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();

    await waitFor(() => expect(api.listLiveRoomLots).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument());
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'auction.started',
        payload: {
          auctionId: 'auc_2002',
          state: {
            auctionId: 'auc_2002',
            status: 'RUNNING',
            currentPrice: 2000,
            leaderBidderId: 'u8',
            endTime: new Date(now + 300_000).toISOString()
          }
        }
      });
    });

    expect(await screen.findByRole('button', { name: '缈＄繝鍐扮鍚婂潬' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.auction-float-card')).toBeInTheDocument());
  });

  it('starts the current lot card from a backend nested auction state payload', async () => {
    vi.mocked(api.listLiveRoomLots).mockResolvedValueOnce({
      items: [
        {
          id: 'lot_backend_started',
          auctionId: 'auc_2002',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: '后端嵌套开拍',
          status: 'READY',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 } }
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();

    await waitFor(() => expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument());
    await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'auction.started',
        payload: {
          state: {
            auctionId: 'auc_2002',
            status: 'RUNNING',
            currentPrice: 2000,
            leaderBidderId: 'u8',
            endTime: new Date(now + 300_000).toISOString()
          }
        }
      });
    });

    expect(await screen.findByRole('button', { name: '后端嵌套开拍' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.auction-float-card')).toBeInTheDocument());
  });

  it('starts showing the current lot card as soon as a sheet begins closing', async () => {
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: getMessage('auction.lookAround') }));
    expect(await screen.findByRole('dialog', { name: getMessage('product.detail') })).toBeInTheDocument();

    vi.useFakeTimers();
    try {
      const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('common.close') }));
      expect(document.querySelector('.sheet-backdrop.is-closing')).toBeInTheDocument();
      expect(document.querySelector('.auction-float-card')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByRole('dialog', { name: getMessage('product.detail') })).not.toBeInTheDocument();
      expect(document.querySelector('.auction-float-card')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('crossfades detail close and quick-bid open when bidding from the detail sheet', async () => {
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();

    vi.useFakeTimers();
    try {
      await flushApp();
      fireEvent.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
      await flushApp();
      const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
      fireEvent.click(within(detailDialog).getByRole('button', { name: detailEnrollAndPayText }));
      await flushApp();
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('product.bidNow') }));
      await flushApp();

      expect(document.querySelector('.detail-sheet')).toBeInTheDocument();
      expect(document.querySelector('.sheet-backdrop.is-closing .detail-sheet')).toBeInTheDocument();
      expect(document.querySelector('.quick-bid-sheet')).toBeInTheDocument();
      expect(document.querySelector('.sheet-layer .quick-bid-sheet')).toBeInTheDocument();
      expect(document.querySelector('.sheet-backdrop .quick-bid-sheet')).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: getMessage('bid.confirmTitle') })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(document.querySelector('.detail-sheet')).not.toBeInTheDocument();
      expect(document.querySelector('.quick-bid-sheet')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts the quick-bid ended auto-return text down to zero before closing with animation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      fireEvent.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
      await flushApp();
      const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
      fireEvent.click(within(detailDialog).getByRole('button', { name: detailEnrollAndPayText }));
      await flushApp();
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('product.bidNow') }));
      await flushApp();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.closed',
          payload: {
            auctionId: 'auc_2001',
            status: 'CLOSED_WON',
            winnerId: 'u2',
            price: 150100,
            closedAt: new Date(Date.now()).toISOString()
          }
        });
      });

      const bidDialog = screen.getByRole('dialog', { name: getMessage('bid.confirmTitle') });
      expect(within(bidDialog).getByRole('button', { name: getMessage('bid.endedAutoReturn', 'zh-CN', { seconds: 5 }) })).toBeDisabled();
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(within(bidDialog).getByRole('button', { name: getMessage('bid.endedAutoReturn', 'zh-CN', { seconds: 4 }) })).toBeDisabled();
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });
      expect(within(bidDialog).getByRole('button', { name: getMessage('bid.endedAutoReturn', 'zh-CN', { seconds: 0 }) })).toBeDisabled();
      expect(document.querySelector('.sheet-layer.is-closing .quick-bid-sheet')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(460);
      });
      expect(screen.queryByRole('dialog', { name: getMessage('bid.confirmTitle') })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the ended current lot card briefly with END, then sinks it into the goods button', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      expect(screen.getByRole('button', { name: getMessage('auction.lookAround') })).toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.closed',
          payload: {
            auctionId: 'auc_2001',
            status: 'CLOSED_WON',
            winnerId: 'u2',
            price: 150100,
            closedAt: new Date(Date.now()).toISOString()
          }
        });
      });

      expect(screen.getByText('END')).toBeInTheDocument();
      const endedAction = screen.getByRole('button', { name: getMessage('auction.closed') });
      expect(endedAction).toBeDisabled();
      expect(document.querySelector('.auction-float-card.is-ended')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(document.querySelector('.auction-float-card.is-leaving')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(380);
      });
      expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the final-ten-second countdown through the global auction alert layer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(api.getAuctionState).mockResolvedValueOnce({
      auctionId: 'auc_2001',
      status: 'RUNNING',
      currentPrice: 150100,
      leaderBidderId: 'u2',
      endTsMs: now + 9000,
      serverTsMs: now,
      bidCount: 36,
      participantCount: 128
    });
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      const pressureLayer = document.querySelector('.live-auction-alert.is-countdown.is-warning');
      expect(pressureLayer).toBeInTheDocument();
      expect(pressureLayer).toHaveTextContent('9');
      expect(document.querySelector('.live-auction-alert-layer')).toContainElement(pressureLayer);
      expect(document.querySelector('.live-countdown-pressure')).not.toBeInTheDocument();
      expect(document.querySelector('.auction-float-countdown.is-warning')).toBeInTheDocument();
      expect(document.querySelector('.live-auction-alert.is-countdown.is-critical')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('suppresses the countdown alert while a higher-priority auction alert is visible', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(api.getAuctionState).mockResolvedValueOnce({
      auctionId: 'auc_2001',
      status: 'RUNNING',
      currentPrice: 150100,
      leaderBidderId: 'u2',
      endTsMs: now + 3000,
      serverTsMs: now,
      bidCount: 36,
      participantCount: 128
    });
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      expect(document.querySelector('.live-auction-alert.is-countdown.is-critical')).toBeInTheDocument();
      expect(document.querySelector('.auction-float-countdown.is-critical')).toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'bid.accepted',
          payload: {
            auctionId: 'auc_2001',
            bidderId: 'u1',
            currentPrice: 150200,
            leaderBidderId: 'u1',
            bidTsMs: now + 1000
          }
        });
      });

      expect(document.querySelector('.live-auction-alert.is-leading')).toBeInTheDocument();
      expect(document.querySelector('.live-auction-alert.is-countdown')).not.toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(2600);
      });
      expect(document.querySelector('.live-auction-alert.is-leading')).not.toBeInTheDocument();
      expect(document.querySelector('.live-auction-alert.is-countdown.is-critical')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the countdown alert once the auction is closed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(api.getAuctionState).mockResolvedValueOnce({
      auctionId: 'auc_2001',
      status: 'RUNNING',
      currentPrice: 150100,
      leaderBidderId: 'u2',
      endTsMs: now + 2000,
      serverTsMs: now,
      bidCount: 36,
      participantCount: 128
    });
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      expect(document.querySelector('.live-auction-alert.is-countdown.is-critical')).toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.closed',
          payload: {
            auctionId: 'auc_2001',
            status: 'CLOSED_WON',
            winnerBidderId: 'u2',
            finalPrice: 150100,
            closedTsMs: Date.now()
          }
        });
      });

      expect(document.querySelector('.live-auction-alert.is-countdown')).not.toBeInTheDocument();
      expect(document.querySelector('.live-auction-alert.is-closed')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an atmospheric leading alert when the current user becomes leader', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'bid.accepted',
          payload: {
            auctionId: 'auc_2001',
            bidderId: 'u1',
            currentPrice: 150200,
            leaderBidderId: 'u1',
            bidTsMs: now + 1000
          }
        });
      });

      expect(screen.getByText('领先')).toBeInTheDocument();
      const leadingAlert = document.querySelector('.live-auction-alert.is-leading');
      expect(leadingAlert).toBeInTheDocument();
      expect(leadingAlert).toHaveTextContent('¥1502.00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows an outbid alert only when another bidder overtakes the current user', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'bid.accepted',
          payload: {
            auctionId: 'auc_2001',
            bidderId: 'u3',
            currentPrice: 150200,
            leaderBidderId: 'u3',
            bidTsMs: now + 1000
          }
        });
      });
      expect(screen.queryByText('被超越')).not.toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'bid.accepted',
          payload: {
            auctionId: 'auc_2001',
            bidderId: 'u1',
            currentPrice: 150300,
            leaderBidderId: 'u1',
            bidTsMs: now + 1500
          }
        });
      });
      await flushApp();
      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'bid.accepted',
          payload: {
            auctionId: 'auc_2001',
            bidderId: 'u4',
            currentPrice: 150400,
            leaderBidderId: 'u4',
            bidTsMs: now + 2000
          }
        });
      });

      expect(screen.getByText('被超越')).toBeInTheDocument();
      expect(screen.getByText('请立即加价夺回领先')).toBeInTheDocument();
      expect(document.querySelector('.live-auction-alert.is-outbid')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows extension and closed alerts from realtime auction events', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
	      await act(async () => {
	        emitLatestMockControl(sockets, {
	          type: 'timer.extended',
	          payload: {
	            auctionId: 'auc_2001',
	            endTime: new Date(now + 180_000).toISOString(),
	            serverTime: new Date(now).toISOString()
	          }
	        });
	      });
      expect(screen.getByText('竞拍延时')).toBeInTheDocument();
      expect(document.querySelector('.live-auction-alert.is-extended')).toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.closed',
	          payload: {
	            auctionId: 'auc_2001',
	            status: 'CLOSED_WON',
	            winnerId: 'u2',
	            price: 150300,
	            closedAt: new Date(now).toISOString(),
	            serverTime: new Date(now).toISOString()
	          }
	        });
	      });
      const closedAlert = document.querySelector('.live-auction-alert.is-closed');
      expect(closedAlert).toBeInTheDocument();
      expect(closedAlert).toHaveTextContent('竞拍结束');
    } finally {
      vi.useRealTimers();
	    }
	  });

	  it('shows hammering locally when the countdown reaches the end before a closed event arrives', async () => {
	    vi.useFakeTimers();
	    vi.setSystemTime(now);
	    installNativeRealtimeSocket();
	    try {
	      seedSession();
	      window.history.pushState(null, '', '/live/room_1001');
	      renderApp();

	      await flushApp();
	      await act(async () => {
	        vi.advanceTimersByTime(121_000);
	      });

	      fireEvent.click(screen.getByRole('button', { name: getMessage('live.goodsEntry') }));
	      await flushApp();
	      const drawer = screen.getByRole('dialog', { name: getMessage('live.goodsList') });
	      const currentLotRow = within(drawer).getAllByTestId('lot-row')[0];
	      expect(within(currentLotRow).getAllByText(getMessage('auction.hammerInProgress')).length).toBeGreaterThan(0);
	      expect(within(currentLotRow).getByRole('button', { name: getMessage('auction.hammerInProgress') })).toBeDisabled();
	    } finally {
	      vi.useRealTimers();
	    }
	  });

	  it('shows a global won alert instead of the old standalone celebration when the current user wins the lot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      expect(screen.queryByText(getMessage('celebration.win'))).not.toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.closed',
          payload: {
            auctionId: 'auc_2001',
            status: 'CLOSED_WON',
            winnerId: 'u1',
            price: 150200,
            closedAt: new Date(Date.now()).toISOString()
          }
        });
      });

      expect(screen.getByRole('status')).toHaveTextContent('竞拍成功');
      expect(document.querySelector('.live-auction-alert.is-won')).toBeInTheDocument();
      expect(document.querySelector('.live-auction-alert-cannon.is-left')).toBeInTheDocument();
      expect(document.querySelector('.live-auction-alert-cannon.is-right')).toBeInTheDocument();
      expect(document.querySelectorAll('.live-auction-alert-confetti-piece')).toHaveLength(16);
      expect(document.querySelector('.winning-celebration')).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(4200);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not show the ended current lot card when a live-room sheet is already open', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      fireEvent.click(screen.getByRole('button', { name: getMessage('auction.lookAround') }));
      await flushApp();
      expect(screen.getByRole('dialog', { name: getMessage('product.detail') })).toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.closed',
          payload: {
            auctionId: 'auc_2001',
            status: 'CLOSED_WON',
            winnerId: 'u2',
            price: 150100,
            closedAt: new Date(Date.now()).toISOString()
          }
        });
      });

      expect(screen.queryByRole('button', { name: getMessage('auction.closed') })).not.toBeInTheDocument();
      expect(document.querySelector('.auction-float-card.is-ended')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sinks the ended card early before popping a newly started lot card', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.closed',
          payload: {
            auctionId: 'auc_2001',
            status: 'CLOSED_WON',
            winnerId: 'u2',
            price: 150100,
            closedAt: new Date(Date.now()).toISOString()
          }
        });
      });
      expect(screen.getByText('END')).toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.started',
          payload: {
            auctionId: 'auc_2002',
            state: {
              auctionId: 'auc_2002',
              status: 'RUNNING',
              currentPrice: 2000,
              leaderBidderId: 'u8',
              endTime: new Date(now + 300_000).toISOString()
            }
          }
        });
      });
      expect(document.querySelector('.auction-float-card.is-leaving')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(380);
      });
      expect(screen.getByRole('button', { name: '翡翠冰种吊坠' })).toBeInTheDocument();
      expect(document.querySelector('.auction-float-card.is-entering')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the user temporarily hide the current card without blocking the next started lot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const sockets = installMockControlSocket();
    try {
      seedSession();
      window.history.pushState(null, '', '/live/room_1001');
      renderApp();

      await flushApp();
      fireEvent.click(screen.getByRole('button', { name: getMessage('auction.hideCurrentLot') }));
      expect(document.querySelector('.auction-float-card.is-leaving')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(380);
      });
      expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'timer.extended',
          payload: {
            auctionId: 'auc_2001',
            endTime: new Date(now + 360_000).toISOString()
          }
        });
      });
      expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.started',
          payload: {
            auctionId: 'auc_2002',
            state: {
              auctionId: 'auc_2002',
              status: 'RUNNING',
              currentPrice: 2000,
              leaderBidderId: 'u8',
              endTime: new Date(now + 300_000).toISOString()
            }
          }
        });
      });
      expect(screen.getByRole('button', { name: '翡翠冰种吊坠' })).toBeInTheDocument();
      expect(document.querySelector('.auction-float-card.is-entering')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps sheets mounted during their close animation', async () => {
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: getMessage('auction.lookAround') }));
    expect(await screen.findByRole('dialog', { name: getMessage('product.detail') })).toBeInTheDocument();

    vi.useFakeTimers();
    try {
      const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('common.close') }));
      expect(screen.getByRole('dialog', { name: getMessage('product.detail') })).toBeInTheDocument();
      expect(document.querySelector('.sheet-backdrop.is-closing')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.queryByRole('dialog', { name: getMessage('product.detail') })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders the digital human source from the live-room REST configuration without a user source switch', async () => {
    const user = userEvent.setup();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_1001',
      title: '数字人专场',
      merchantName: '云上珠宝',
      status: 'LIVE',
      videoSource: 'digitalHuman',
      onlineCount: 328,
      watcherCount: 1208,
      activeAuctionId: 'auc_2001',
      digitalHuman: {
        idleVideoUrl: '/media/AI_Presenter_Silent.mp4',
        speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4',
        ttsWsUrl: 'ws://127.0.0.1:8876/tts'
      }
    });

    renderApp();

    expect(await screen.findByTestId('digital-human-stage')).toBeInTheDocument();
    const stage = screen.getByTestId('digital-human-stage');
    expect(stage.querySelector('.digital-human-video.idle')).toHaveAttribute('src', '/media/AI_Presenter_Silent.mp4');
    expect(stage.querySelector('.digital-human-video.talk')).toHaveAttribute('src', '/media/AI_Presenter_Speaking.mp4');
    expect(screen.queryByRole('group', { name: getMessage('live.videoSource') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('live.sourceRecorded') })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: getMessage('live.soundEnable') }));
    expect(screen.getByTestId('digital-human-stage')).not.toHaveClass('is-speaking');
    expect(screen.queryByRole('button', { name: getMessage('digitalHuman.enableAudio') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('digitalHuman.send') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('digitalHuman.stop') })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(getMessage('digitalHuman.inputLabel'))).not.toBeInTheDocument();
  });

  it('switches the live room to digital human when AI assistant starts', async () => {
    const sockets = installMockControlSocket();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');

    renderApp();

    expect(await screen.findByTestId('live-room-video')).toBeInTheDocument();
    vi.mocked(api.getLiveRoom).mockResolvedValueOnce({
      id: 'room_1001',
      title: '珠宝严选直播间',
      merchantName: '云上珠宝',
      status: 'LIVE',
      videoSource: 'digitalHuman',
      aiAssistantEnabled: true,
      onlineCount: 328,
      watcherCount: 1208,
      activeAuctionId: 'auc_2001',
      digitalHuman: {
        idleVideoUrl: '/media/AI_Presenter_Silent.mp4',
        speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4'
      }
    });

    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'ai.assistant.switch',
        payload: {
          enabled: true,
          status: 'enabled',
          liveSessionId: 9001,
          videoSource: 'digitalHuman',
          liveRoom: {
            id: 9001,
            liveSessionId: 9001,
            aiAssistantEnabled: true,
            videoSource: 'digitalHuman',
            digitalHuman: {
              idleVideoUrl: '/media/AI_Presenter_Silent.mp4',
              speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4'
            }
          }
        }
      });
    });

    const stage = await screen.findByTestId('digital-human-stage');
    expect(stage).toBeInTheDocument();
    expect(stage.querySelector('.digital-human-video.idle')).toHaveAttribute('src', '/media/AI_Presenter_Silent.mp4');
    expect(screen.queryByTestId('live-room-video')).not.toBeInTheDocument();
  });

  it('plays live voice broadcast audio and shows the speaking digital human video', async () => {
    const sockets = installMockControlSocket();
    const audio = installMockAudioContext();
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');

    renderApp();

    expect(await screen.findByTestId('live-room-video')).toBeInTheDocument();

    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'live.voice_broadcast',
        liveSessionId: 9001,
        payload: {
          liveSessionId: 9001,
          audioBase64: btoa(String.fromCharCode(0, 0, 255, 127, 0, 128)),
          audioFormat: 'pcm_s16le',
          sampleRate: 24_000,
          channels: 1
        }
      });
      await Promise.resolve();
    });

    const stage = await screen.findByTestId('digital-human-stage');
    expect(stage).toHaveClass('is-speaking');
    expect(stage.querySelector('.digital-human-video.talk')).toHaveAttribute('src', '/media/AI_Presenter_Speaking.mp4');
    await waitFor(() => expect(audio.sources[0]?.start).toHaveBeenCalled());
    expect(audio.contexts[0]?.createBuffer).toHaveBeenCalledWith(1, 3, 24_000);
    expect(screen.queryByTestId('live-room-video')).not.toBeInTheDocument();
  });

  it('waits for a user gesture before replaying blocked live voice broadcast audio', async () => {
    const sockets = installMockControlSocket();
    const audio = installMockAudioContext({ initialState: 'suspended', resumeAllowed: false });
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');

    renderApp();

    expect(await screen.findByTestId('live-room-video')).toBeInTheDocument();

    await act(async () => {
      emitLatestMockControl(sockets, {
        type: 'live.voice_broadcast',
        liveSessionId: 9001,
        payload: {
          liveSessionId: 9001,
          audioBase64: btoa(String.fromCharCode(0, 0, 255, 127, 0, 128)),
          audioFormat: 'pcm_s16le',
          sampleRate: 24_000,
          channels: 1
        }
      });
      await Promise.resolve();
    });

    const blockedStage = await screen.findByTestId('digital-human-stage');
    await waitFor(() => expect(audio.contexts[0]?.resume).toHaveBeenCalled());
    expect(blockedStage).not.toHaveClass('is-speaking');
    expect(audio.sources).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(getMessage('live.voiceAudioBlockedTitle'));
    const allowPlayback = screen.getByRole('button', { name: getMessage('live.voiceAudioAllow') });

    audio.allowResume();
    await act(async () => {
      fireEvent.click(allowPlayback);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(audio.sources[0]?.start).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('button', { name: getMessage('live.voiceAudioAllow') })).not.toBeInTheDocument());
    expect(await screen.findByTestId('digital-human-stage')).toHaveClass('is-speaking');
  });
});
