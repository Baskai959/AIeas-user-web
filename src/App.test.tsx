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
        status: 'RUNNING',
        startPrice: 0,
        currentPrice: 150100,
        leaderBidderId: 'u2',
        endTsMs: now + 120_000,
        ruleSnapshot: { minIncrement: 100, antiSnipeSec: 15, extendSec: 10, ceilingPrice: 188800 },
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
        status: 'UPCOMING',
        startPrice: 0,
        currentPrice: 0,
        endTsMs: now + 420_000,
        ruleSnapshot: { minIncrement: 200 }
      }
    ],
    total: 2,
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
    auctionId: 'auc_2001',
    userId: 'u1',
    enrolled: true,
    depositLedgerId: 'dep1',
    depositAmount: 5000,
    depositStatus: 'FROZEN'
  })),
  listMyOrders: vi.fn(async () => ({ items: [{ id: 'ord_2001', auctionId: 'auc_2001', buyerId: 'u1', amount: 150100, status: 'PENDING_PAY' }], total: 1, page: 1, page_size: 20 })),
  getOrder: vi.fn(async () => ({ id: 'ord_2001', auctionId: 'auc_2001', buyerId: 'u1', amount: 150100, status: 'PENDING_PAY' })),
  payOrder: vi.fn(async () => ({ id: 'ord_2001', auctionId: 'auc_2001', buyerId: 'u1', amount: 150100, status: 'PAID', paidAt: '2026-05-24T20:00:00+08:00' })),
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
        ruleSnapshot: { minIncrement: 100 },
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
  searchMerchants: vi.fn(async () => ({
    items: [{ id: 'merchant_01', name: '云上珠宝', description: '珠宝直播拍卖商家', followerCount: 128000, rating: 4.9, liveRoomId: 'room_1001' }],
    total: 1,
    page: 1,
    page_size: 20
  })),
  getMerchant: vi.fn(async () => ({ id: 'merchant_01', name: '云上珠宝', description: '珠宝直播拍卖商家', followerCount: 128000, rating: 4.9, liveRoomId: 'room_1001' })),
  getLot: vi.fn(async () => ({
    id: 'lot_3002',
    auctionId: 'auc_2002',
    roomId: 'room_1001',
    merchantId: 'merchant_01',
    categoryId: 'jewelry',
    title: '翡翠冰种吊坠',
    status: 'UPCOMING',
    startPrice: 0,
    currentPrice: 0,
    endTsMs: now + 420_000,
    ruleSnapshot: { minIncrement: 200 }
  })),
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
          status: 'UPCOMING',
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
          status: 'RUNNING',
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

function renderWithRouter(initialPath = currentTestPath()) {
  window.history.pushState(null, '', initialPath);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App apiClient={api} />
    </QueryClientProvider>
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

function emitLatestMockControl(sockets: ReturnType<typeof installMockControlSocket>, message: unknown) {
  const socket = sockets[sockets.length - 1];
  expect(socket).toBeDefined();
  socket.emit(message);
}

describe('App flow', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.unstubAllGlobals();
    delete (import.meta.env as Record<string, string | undefined>).VITE_MOCK_CONTROL_URL;
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
    expect(screen.queryByText(getMessage('live.shopScore'))).not.toBeInTheDocument();
    expect(screen.getByTestId('live-room-video')).toHaveAttribute('src', '/media/live-room-demo.mp4');
    expect(window.location.pathname).toBe('/live/room_1001');
    expect(window.location.search).toBe('?from=home');

    await user.click(screen.getByTestId('live-room-close'));
    expect(await screen.findByText('珠宝严选直播间')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?focusRoomId=room_1001');
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
          status: 'UPCOMING',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { minIncrement: 200 }
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
  });

  it('uses the discover tab as a lot list and opens a running lot directly in the live room', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.discover') }));

    expect(await screen.findByText(getMessage('discoverLots.title'))).toBeInTheDocument();
    expect(await screen.findByText('18K 金钻石项链')).toBeInTheDocument();
    await waitFor(() => expect(api.searchLots).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'default', status: 'all', categoryId: 'all' })));

    await user.click(screen.getByRole('button', { name: getMessage('product.bidNow') }));
    expect(await screen.findByText('云上珠宝')).toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: getMessage('product.detail') })).toBeInTheDocument();

    await user.click(screen.getByTestId('live-room-close'));
    expect(await screen.findByText(getMessage('discoverLots.title'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/discover');
  });

  it('sends, appends, and toggles live-room comments', async () => {
    seedSession();
    window.history.pushState(null, '', '/live/room_1001');
    renderApp();
    const user = userEvent.setup();

    const input = await screen.findByLabelText(getMessage('live.commentInput'));
    expect(screen.queryByText('主播正在讲解细节')).not.toBeInTheDocument();
    expect(screen.queryByText(getMessage('live.chat.bid'))).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('live.commentSend') }));
    expect(screen.queryByText('出价很激烈')).not.toBeInTheDocument();

    await user.type(input, '出价很激烈{enter}');
    expect(await screen.findByText('出价很激烈')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('live.commentHide') }));
    expect(screen.queryByLabelText(getMessage('live.commentInput'))).not.toBeInTheDocument();
    const showButton = screen.getByRole('button', { name: getMessage('live.commentShow') });
    expect(showButton.querySelector('img')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: getMessage('live.goodsEntry') })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: getMessage('live.commentShow') }));
    expect(await screen.findByLabelText(getMessage('live.commentInput'))).toBeInTheDocument();
  });

  it('toggles live-room following and manages followed rooms from the following page', async () => {
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('discover.enterLive') }));

    await user.click(await screen.findByRole('button', { name: getMessage('live.follow') }));
    expect(await screen.findByRole('button', { name: getMessage('live.followed') })).toBeInTheDocument();
    expect(useLiveActivityStore.getState().followedRooms).toHaveLength(1);

    await user.click(screen.getByTestId('live-room-close'));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    await user.click(screen.getByRole('button', { name: getMessage('profile.following') }));

    expect(await screen.findByText(getMessage('profile.followingTitle'))).toBeInTheDocument();
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

    await user.click(screen.getByTestId('live-room-close'));
    await user.click(await screen.findByRole('button', { name: getMessage('nav.me') }));
    await user.click(screen.getByRole('button', { name: getMessage('profile.footprints') }));

    expect(await screen.findByText(getMessage('profile.footprintTitle'))).toBeInTheDocument();
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
    expect(await screen.findByText(getMessage('orders.title'))).toBeInTheDocument();
    expect(window.location.pathname).toBe('/orders');
    expect(window.location.search).toBe('?tab=all');
    await user.click(screen.getByRole('button', { name: getMessage('common.back') }));
    expect(await screen.findByText('Buyer One')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: getMessage('settings.title') }));
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
    renderApp();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: getMessage('login.submit') }));
    await user.click(await screen.findByRole('button', { name: getMessage('discover.enterLive') }));
    expect(screen.queryByText(getMessage('live.statsOnline', 'zh-CN', { count: 328 }))).not.toBeInTheDocument();
    expect(screen.getByText('1208')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: getMessage('auction.lookAround') })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '18K 金钻石项链' }));
    const firstDetailDialog = await screen.findByRole('dialog', { name: getMessage('product.detail') });
    expect(firstDetailDialog).toBeInTheDocument();
    await user.click(within(firstDetailDialog).getByRole('button', { name: getMessage('common.close') }));
    await user.click(await screen.findByRole('button', { name: getMessage('live.goodsEntry') }));

    const drawer = await screen.findByRole('dialog', { name: getMessage('live.goodsList') });
    expect(within(drawer).getByText('18K 金钻石项链')).toBeInTheDocument();
    expect(within(drawer).getByText(getMessage('auction.currentPriceLabel'))).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: getMessage('product.bidNow') }));
    expect(await screen.findByRole('dialog', { name: getMessage('product.detail') })).toBeInTheDocument();

    const detailDialog = screen.getByRole('dialog', { name: getMessage('product.detail') });
    await user.click(within(detailDialog).getByRole('button', { name: getMessage('auction.enroll') }));
    expect(await within(detailDialog).findByRole('button', { name: getMessage('auction.enrolled') })).toBeInTheDocument();
    await user.click(within(detailDialog).getByRole('button', { name: getMessage('common.close') }));
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
  });

  it('renders the lot list as a half-screen scroll sheet with the running lot pinned first and original sequence visible', async () => {
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
          status: 'UPCOMING',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { minIncrement: 100 }
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
          ruleSnapshot: { minIncrement: 100 }
        },
        {
          id: 'lot_3003',
          auctionId: 'auc_2003',
          roomId: 'room_1001',
          merchantId: 'merchant_01',
          categoryId: 'jewelry',
          title: 'Later third lot',
          status: 'UPCOMING',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 720_000,
          ruleSnapshot: { minIncrement: 100 }
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
    expect(within(rows[0]).getByText('#2')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Running second lot')).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute('data-original-index', '1');
    expect(within(rows[1]).getByText('#1')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Upcoming first lot')).toBeInTheDocument();
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
        emitLatestMockControl(sockets, {
          type: 'ranking.updated',
          payload: {
            auctionId: 'auc_2001',
            items: [
              { rank: 1, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
              { rank: 2, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
              { rank: 3, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
              { rank: 4, bidderId: 'u5', nicknameMask: '用户**05', price: 149800, bidTsMs: now - 3000 },
              { rank: 5, bidderId: 'u6', nicknameMask: '用户**06', price: 149700, bidTsMs: now - 4000 },
              { rank: 6, bidderId: 'u7', nicknameMask: '用户**07', price: 149600, bidTsMs: now - 5000 },
              { rank: 7, bidderId: 'u8', nicknameMask: '用户**08', price: 149500, bidTsMs: now - 6000 },
              { rank: 8, bidderId: 'u9', nicknameMask: '用户**09', price: 149400, bidTsMs: now - 7000 },
              { rank: 9, bidderId: 'u1', nicknameMask: '我', price: 149300, bidTsMs: now - 8000 }
            ]
          }
        });
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
        emitLatestMockControl(sockets, {
          type: 'ranking.updated',
          payload: {
            auctionId: 'auc_2001',
            items: [
              { rank: 1, bidderId: 'u2', nicknameMask: '石榴与姜冬', price: 150100, bidTsMs: now, avatarUrl: '/logo.png' },
              { rank: 2, bidderId: 'u3', nicknameMask: '用户A23', price: 149800, bidTsMs: now - 1000 },
              { rank: 3, bidderId: 'u4', nicknameMask: '云拍小王', price: 148800, bidTsMs: now - 2000 }
            ]
          }
        });
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
        { rank: 1, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
        { rank: 2, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
        { rank: 3, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
        { rank: 4, bidderId: 'u5', nicknameMask: '用户**05', price: 149800, bidTsMs: now - 3000 },
        { rank: 5, bidderId: 'u1', nicknameMask: '我', price: 149700, bidTsMs: now - 4000 },
        { rank: 6, bidderId: 'u6', nicknameMask: '用户**06', price: 149600, bidTsMs: now - 5000 },
        { rank: 7, bidderId: 'u7', nicknameMask: '用户**07', price: 149500, bidTsMs: now - 6000 },
        { rank: 8, bidderId: 'u8', nicknameMask: '用户**08', price: 149400, bidTsMs: now - 7000 },
        { rank: 9, bidderId: 'u9', nicknameMask: '用户**09', price: 149300, bidTsMs: now - 8000 }
      ];

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'ranking.updated', payload: { auctionId: 'auc_2001', items: baseItems } });
      });

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u5', price: 150200, currentPrice: 150200, leaderBidderId: 'u5', bidTsMs: now + 1000 } });
        emitLatestMockControl(sockets, {
          type: 'ranking.updated',
          payload: {
            auctionId: 'auc_2001',
            items: [
              { rank: 1, bidderId: 'u5', nicknameMask: '用户**05', price: 150200, bidTsMs: now + 1000 },
              { rank: 2, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
              { rank: 3, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
              { rank: 4, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
              ...baseItems.slice(4)
            ]
          }
        });
      });
      expect(document.querySelector('.live-ranking-ghost.is-other-bid')).toBeInTheDocument();
      expect(document.querySelector('.live-ranking-row.is-shifted-down')).toBeInTheDocument();

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u1', price: 150300, currentPrice: 150300, leaderBidderId: 'u1', bidTsMs: now + 1500 } });
        emitLatestMockControl(sockets, {
          type: 'ranking.updated',
          payload: {
            auctionId: 'auc_2001',
            items: [
              { rank: 1, bidderId: 'u1', nicknameMask: '我', price: 150300, bidTsMs: now + 1500 },
              { rank: 2, bidderId: 'u5', nicknameMask: '用户**05', price: 150200, bidTsMs: now + 1000 },
              { rank: 3, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
              { rank: 4, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
              { rank: 5, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
              { rank: 6, bidderId: 'u6', nicknameMask: '用户**06', price: 149600, bidTsMs: now - 5000 },
              { rank: 7, bidderId: 'u7', nicknameMask: '用户**07', price: 149500, bidTsMs: now - 6000 },
              { rank: 8, bidderId: 'u8', nicknameMask: '用户**08', price: 149400, bidTsMs: now - 7000 },
              { rank: 9, bidderId: 'u9', nicknameMask: '用户**09', price: 149300, bidTsMs: now - 8000 }
            ]
          }
        });
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
        { rank: 1, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
        { rank: 2, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
        { rank: 3, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
        { rank: 4, bidderId: 'u5', nicknameMask: '用户**05', price: 149800, bidTsMs: now - 3000 },
        { rank: 5, bidderId: 'u6', nicknameMask: '用户**06', price: 149700, bidTsMs: now - 4000 },
        { rank: 6, bidderId: 'u7', nicknameMask: '用户**07', price: 149600, bidTsMs: now - 5000 },
        { rank: 7, bidderId: 'u8', nicknameMask: '用户**08', price: 149500, bidTsMs: now - 6000 },
        { rank: 8, bidderId: 'u9', nicknameMask: '用户**09', price: 149400, bidTsMs: now - 7000 }
      ];

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'ranking.updated', payload: { auctionId: 'auc_2001', items: baseItems } });
      });

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u5', price: 150200, currentPrice: 150200, leaderBidderId: 'u5', bidTsMs: now + 1000 } });
        emitLatestMockControl(sockets, {
          type: 'ranking.updated',
          payload: {
            auctionId: 'auc_2001',
            items: [
              { rank: 1, bidderId: 'u5', nicknameMask: '用户**05', price: 150200, bidTsMs: now + 1000 },
              { rank: 2, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
              { rank: 3, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
              { rank: 4, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
              ...baseItems.slice(4)
            ]
          }
        });
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
        { rank: 1, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
        { rank: 2, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
        { rank: 3, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
        { rank: 4, bidderId: 'u5', nicknameMask: '用户**05', price: 149800, bidTsMs: now - 3000 },
        { rank: 5, bidderId: 'u6', nicknameMask: '用户**06', price: 149700, bidTsMs: now - 4000 },
        { rank: 6, bidderId: 'u7', nicknameMask: '用户**07', price: 149600, bidTsMs: now - 5000 },
        { rank: 7, bidderId: 'u8', nicknameMask: '用户**08', price: 149500, bidTsMs: now - 6000 },
        { rank: 8, bidderId: 'u9', nicknameMask: '用户**09', price: 149400, bidTsMs: now - 7000 },
        { rank: 12, bidderId: 'u12', nicknameMask: '用户**12', price: 148900, bidTsMs: now - 9000 }
      ];

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'ranking.updated', payload: { auctionId: 'auc_2001', items: baseItems } });
      });

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u12', price: 150300, currentPrice: 150300, leaderBidderId: 'u12', bidTsMs: now + 1000 } });
        emitLatestMockControl(sockets, {
          type: 'ranking.updated',
          payload: {
            auctionId: 'auc_2001',
            items: [
              { rank: 1, bidderId: 'u12', nicknameMask: '用户**12', price: 150300, bidTsMs: now + 1000 },
              { rank: 2, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
              { rank: 3, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
              { rank: 4, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
              { rank: 5, bidderId: 'u5', nicknameMask: '用户**05', price: 149800, bidTsMs: now - 3000 },
              { rank: 6, bidderId: 'u6', nicknameMask: '用户**06', price: 149700, bidTsMs: now - 4000 },
              { rank: 7, bidderId: 'u7', nicknameMask: '用户**07', price: 149600, bidTsMs: now - 5000 },
              { rank: 8, bidderId: 'u8', nicknameMask: '用户**08', price: 149500, bidTsMs: now - 6000 },
              { rank: 9, bidderId: 'u9', nicknameMask: '用户**09', price: 149400, bidTsMs: now - 7000 }
            ]
          }
        });
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
        { rank: 1, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
        { rank: 2, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
        { rank: 3, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
        { rank: 4, bidderId: 'u5', nicknameMask: '用户**05', price: 149800, bidTsMs: now - 3000 },
        { rank: 5, bidderId: 'u6', nicknameMask: '用户**06', price: 149700, bidTsMs: now - 4000 },
        { rank: 6, bidderId: 'u7', nicknameMask: '用户**07', price: 149600, bidTsMs: now - 5000 },
        { rank: 7, bidderId: 'u8', nicknameMask: '用户**08', price: 149500, bidTsMs: now - 6000 },
        { rank: 8, bidderId: 'u9', nicknameMask: '用户**09', price: 149400, bidTsMs: now - 7000 },
        { rank: 9, bidderId: 'u1', nicknameMask: '我', price: 148800, bidTsMs: now - 9000 }
      ];

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'ranking.updated', payload: { auctionId: 'auc_2001', items: baseItems } });
      });

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u1', price: 150400, currentPrice: 150400, leaderBidderId: 'u1', bidTsMs: now + 1000 } });
        emitLatestMockControl(sockets, {
          type: 'ranking.updated',
          payload: {
            auctionId: 'auc_2001',
            items: [
              { rank: 1, bidderId: 'u1', nicknameMask: '我', price: 150400, bidTsMs: now + 1000 },
              { rank: 2, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
              { rank: 3, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
              { rank: 4, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
              { rank: 5, bidderId: 'u5', nicknameMask: '用户**05', price: 149800, bidTsMs: now - 3000 },
              { rank: 6, bidderId: 'u6', nicknameMask: '用户**06', price: 149700, bidTsMs: now - 4000 },
              { rank: 7, bidderId: 'u7', nicknameMask: '用户**07', price: 149600, bidTsMs: now - 5000 },
              { rank: 8, bidderId: 'u8', nicknameMask: '用户**08', price: 149500, bidTsMs: now - 6000 },
              { rank: 9, bidderId: 'u9', nicknameMask: '用户**09', price: 149400, bidTsMs: now - 7000 }
            ]
          }
        });
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
        { rank: 1, bidderId: 'u2', nicknameMask: '用户**02', price: 150100, bidTsMs: now },
        { rank: 2, bidderId: 'u3', nicknameMask: '用户**03', price: 150000, bidTsMs: now - 1000 },
        { rank: 3, bidderId: 'u4', nicknameMask: '用户**04', price: 149900, bidTsMs: now - 2000 },
        { rank: 4, bidderId: 'u5', nicknameMask: '用户**05', price: 149800, bidTsMs: now - 3000 }
      ];

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'ranking.updated', payload: { auctionId: 'auc_2001', items: baseItems } });
      });

      await act(async () => {
      emitLatestMockControl(sockets, { type: 'bid.accepted', payload: { auctionId: 'auc_2001', bidderId: 'u2', price: 150300, currentPrice: 150300, leaderBidderId: 'u2', bidTsMs: now + 1000 } });
        emitLatestMockControl(sockets, {
          type: 'ranking.updated',
          payload: {
            auctionId: 'auc_2001',
            items: [
              { rank: 1, bidderId: 'u2', nicknameMask: '用户**02', price: 150300, bidTsMs: now + 1000 },
              ...baseItems.slice(1)
            ]
          }
        });
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
          status: 'UPCOMING',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { minIncrement: 200 }
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
          status: 'UPCOMING',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { minIncrement: 200 }
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
          status: 'UPCOMING',
          startPrice: 0,
          currentPrice: 0,
          endTsMs: now + 420_000,
          ruleSnapshot: { minIncrement: 200 }
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
          currentPrice: 2000,
          leaderBidderId: 'u8',
          endTsMs: now + 300_000,
          startTsMs: now
        }
      });
    });

    expect(await screen.findByRole('button', { name: '缈＄繝鍐扮鍚婂潬' })).toBeInTheDocument();
    expect(document.querySelector('.auction-float-card.is-entering')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.auction-float-card.is-visible')).toBeInTheDocument());
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
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('auction.enroll') }));
      await flushApp();
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('product.bidNow') }));
      await flushApp();

      expect(document.querySelector('.detail-sheet')).toBeInTheDocument();
      expect(document.querySelector('.sheet-backdrop.is-closing .detail-sheet')).toBeInTheDocument();
      expect(document.querySelector('.quick-bid-sheet')).toBeInTheDocument();
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
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('auction.enroll') }));
      await flushApp();
      fireEvent.click(within(detailDialog).getByRole('button', { name: getMessage('product.bidNow') }));
      await flushApp();

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
      expect(document.querySelector('.sheet-backdrop.is-closing')).toBeInTheDocument();
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
            winnerBidderId: 'u2',
            finalPrice: 150100,
            closedTsMs: Date.now()
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

  it('plays side-cannon celebration when the current user wins the lot', async () => {
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
            winnerBidderId: 'u1',
            finalPrice: 150200,
            closedTsMs: Date.now()
          }
        });
      });

      expect(screen.getByRole('status')).toHaveTextContent(getMessage('celebration.win'));
      expect(document.querySelector('.winning-cannon.is-left')).toBeInTheDocument();
      expect(document.querySelector('.winning-cannon.is-right')).toBeInTheDocument();
      expect(document.querySelectorAll('.winning-confetti-piece')).toHaveLength(16);

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
            winnerBidderId: 'u2',
            finalPrice: 150100,
            closedTsMs: Date.now()
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
            winnerBidderId: 'u2',
            finalPrice: 150100,
            closedTsMs: Date.now()
          }
        });
      });
      expect(screen.getByText('END')).toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.started',
          payload: {
            auctionId: 'auc_2002',
            currentPrice: 2000,
            leaderBidderId: 'u8',
            endTsMs: now + 300_000,
            startTsMs: now
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
            newEndTsMs: now + 360_000
          }
        });
      });
      expect(document.querySelector('.auction-float-card')).not.toBeInTheDocument();

      await act(async () => {
        emitLatestMockControl(sockets, {
          type: 'auction.started',
          payload: {
            auctionId: 'auc_2002',
            currentPrice: 2000,
            leaderBidderId: 'u8',
            endTsMs: now + 300_000,
            startTsMs: now
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
    class MockWebSocket extends EventTarget {
      static readonly OPEN = 1;
      static readonly CLOSED = 3;
      binaryType = '';
      readyState = MockWebSocket.OPEN;
      constructor(public readonly url: string) {
        super();
        window.setTimeout(() => this.dispatchEvent(new Event('open')), 0);
      }
      send = vi.fn();
      close = vi.fn(() => {
        this.readyState = MockWebSocket.CLOSED;
      });
    }
    vi.stubGlobal('WebSocket', MockWebSocket);
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
    expect(screen.queryByRole('group', { name: getMessage('live.videoSource') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('live.sourceRecorded') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('digitalHuman.enableAudio') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('digitalHuman.send') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: getMessage('digitalHuman.stop') })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(getMessage('digitalHuman.inputLabel'))).not.toBeInTheDocument();
  });
});
