import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type TouchEvent as ReactTouchEvent, type TransitionEvent as ReactTransitionEvent, type UIEvent as ReactUIEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams, type Location, type NavigateFunction } from 'react-router-dom';
import { Button, DotLoading, SafeArea, Tabs } from 'antd-mobile';
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Check,
  Gavel,
  MapPin,
  Minus,
  Package,
  Plus,
  Radio,
  Search,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Trophy,
  Users,
  VideoOff,
  WalletCards,
  Wifi,
  X
} from 'lucide-react';
import commentIconUrl from '../../Icon/comment.svg';
import closeCommentIconUrl from '../../Icon/close_comment.svg';
import logoUrl from '../../logo.png';
import { createTranslator, defaultLocale, type Locale, type MessageKey } from '../i18n/messages';
import { classifyAuctionRecord, groupAuctionRecords, myAuctionTabKeys, previewLotStatusKind, selectCurrentRunningLot, selectPreviewLot } from '../services/auctionViews';
import {
  QUICK_BID_MAX_STEPS,
  buildBidPlacePayload,
  getMinBidIntervalMs,
  getQuickBidIntervalRemainingMs,
  getQuickBidPrice,
  isQuickBidOutdated,
  validateBidPrice,
  type BidValidationResult,
  type BidRuleInput
} from '../services/bidding';
import { ApiClient, defaultApiClient } from '../services/api';
import { demoCategories, demoLiveRoom, demoLiveRoomPage, demoLiveRoomStats, demoLotPage, findDemoLiveRoom } from '../services/mockData';
import {
  isFreshRealtimeMessage,
  MockRealtimeClient,
  MockRealtimeControlClient,
  NativeWebSocketClient,
  nextRealtimeSeq,
  type RealtimeClient,
  type RealtimeMessage
} from '../services/realtime';
import type {
  AuctionState,
  EnrollResult,
  LiveChatMessage,
  LiveRoom,
  FollowedLiveRoom,
  LiveRoomFootprint,
  LiveRoomLot,
  LiveRoomSortKey,
  LiveRoomStats,
  LiveRoomStatusFilter,
  LoginResult,
  LotSortKey,
  LotStatusFilter,
  Merchant,
  Order,
  RankingItem,
  AvatarCropState,
  MyAuctionTabKey,
  UserAuctionRecord,
  UserProfile
} from '../services/types';
import { useLiveActivityStore } from '../store/liveActivity';
import { usePreferencesStore } from '../store/preferences';
import { mergeProfile, useProfileStore } from '../store/profile';
import { useSessionStore } from '../store/session';
import { formatCountdown, formatMoney, makeRequestId, msUntil } from '../utils/format';
import { MainTabShell, type MainTab } from '../layout/MainTabShell';

let activeLocale: Locale = defaultLocale;
let t = createTranslator(activeLocale);
const liveVideoFallback = '/media/live-room-demo.mp4';
const avatarScaleMin = 1;
const avatarScaleMax = 2.6;

type PointerPoint = { x: number; y: number };
type SearchTab = 'lots' | 'liveRooms' | 'merchants';

type AppLocationState = {
  returnTo?: string;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

type FeedDragState = {
  pointerId?: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  viewportHeight: number;
  baseTrackIndex: number;
};

const feedTapMaxDurationMs = 250;
const feedTapMaxMovePx = 8;

function feedTrackTransform(trackIndex: number, offsetPx = 0): string {
  const percent = trackIndex === 0 ? 0 : -trackIndex * 100;
  return offsetPx === 0 ? `translate3d(0, ${percent}%, 0)` : `translate3d(0, calc(${percent}% + ${offsetPx}px), 0)`;
}

function isFeedInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('button, a, input, textarea, select, [role="button"]'));
}

interface AppProps {
  apiClient?: ApiClient;
}

function parseSearchTab(tab: string | null): SearchTab {
  if (tab === 'liveRooms' || tab === 'merchants') return tab;
  return 'lots';
}

function parseMainTab(tab: string | null): MainTab | undefined {
  if (tab === 'discover' || tab === 'me' || tab === 'home') return tab;
  return undefined;
}

function parseMyAuctionTab(tab: string | null): MyAuctionTabKey {
  if (tab === 'pendingBid' || tab === 'pendingPay' || tab === 'pendingShipment' || tab === 'pendingReceipt' || tab === 'completed') return tab;
  return 'all';
}

function currentPath(location: Pick<Location, 'pathname' | 'search'>): string {
  return `${location.pathname}${location.search}`;
}

function mainPath(tab: MainTab, focusRoomId?: string): string {
  if (tab === 'home') {
    if (!focusRoomId) return '/';
    const params = new URLSearchParams({ focusRoomId });
    return `/?${params.toString()}`;
  }
  return `/${tab}`;
}

function searchPath(keyword: string, tab: SearchTab): string {
  const params = new URLSearchParams();
  if (keyword) params.set('q', keyword);
  if (tab) params.set('tab', tab);
  const query = params.toString();
  return query ? `/search?${query}` : '/search';
}

function livePath(roomId: string, lotId?: string, from?: MainTab): string {
  const params = new URLSearchParams();
  if (lotId) params.set('lotId', lotId);
  if (from) params.set('from', from);
  const query = params.toString();
  return query ? `/live/${roomId}?${query}` : `/live/${roomId}`;
}

function ordersPath(tab: MyAuctionTabKey): string {
  return `/orders?${new URLSearchParams({ tab }).toString()}`;
}

function transitionRouteUpdate(update: () => void): void {
  const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
  if (startViewTransition) {
    void startViewTransition.call(document, update).finished.catch(() => undefined);
    return;
  }
  update();
}

function navigateWithTransition(navigate: NavigateFunction, to: string, options?: { replace?: boolean; state?: AppLocationState }): void {
  transitionRouteUpdate(() => navigate(to, options));
}

function loginReturnPath(location: Location<AppLocationState | null>): string {
  const returnTo = location.state?.returnTo;
  return returnTo && returnTo !== '/login' ? returnTo : '/';
}

function liveReturnPath(location: Location<AppLocationState | null>, focusRoomId?: string): string {
  const path = currentPath(location);
  if (location.pathname === '/login' || location.pathname.startsWith('/live/')) return mainPath('home', focusRoomId);
  if (location.pathname === '/') return mainPath('home', focusRoomId);
  return path;
}

function fallbackLiveReturnPath(roomId: string, from?: MainTab): string {
  if (from === 'home') return mainPath('home', roomId);
  if (from) return mainPath(from);
  return mainPath('home', roomId);
}

function liveSourceTabFromPath(path: string): MainTab | undefined {
  if (path === '/' || path.startsWith('/?')) return 'home';
  if (path.startsWith('/discover')) return 'discover';
  if (path.startsWith('/me')) return 'me';
  return undefined;
}

export default function AppRoutes({ apiClient = defaultApiClient }: AppProps) {
  const locale = usePreferencesStore((state) => state.locale);
  const accessToken = useSessionStore((state) => state.accessToken);
  const location = useLocation();
  activeLocale = locale;
  t = createTranslator(locale);

  useEffect(() => {
    (apiClient as ApiClient & { setToken?: (token: string) => void }).setToken?.(accessToken);
  }, [accessToken, apiClient]);

  return (
    <main className={location.pathname.startsWith('/live/') ? 'app-shell live-shell' : 'app-shell'}>
      <SafeArea position="top" />
      <Routes>
        <Route path="/login" element={<LoginRoute apiClient={apiClient} />} />
        <Route element={<RequireAuth />}>
          <Route index element={<MainRoutePage apiClient={apiClient} tab="home" />} />
          <Route path="/discover" element={<MainRoutePage apiClient={apiClient} tab="discover" />} />
          <Route path="/me" element={<MainRoutePage apiClient={apiClient} tab="me" />} />
          <Route path="/category/:categoryId" element={<CategoryRoutePage apiClient={apiClient} />} />
          <Route path="/search" element={<SearchRoutePage apiClient={apiClient} />} />
          <Route path="/merchant/:merchantId" element={<MerchantRoutePage apiClient={apiClient} />} />
          <Route path="/product/:lotId" element={<ProductRoutePage apiClient={apiClient} />} />
          <Route path="/live/:roomId" element={<LiveRoutePage apiClient={apiClient} />} />
          <Route path="/result/:auctionId" element={<ResultRoutePage apiClient={apiClient} />} />
          <Route path="/pay/:orderId" element={<PayRoutePage apiClient={apiClient} />} />
          <Route path="/settings" element={<SettingsRoutePage apiClient={apiClient} />} />
          <Route path="/orders" element={<OrdersRoutePage apiClient={apiClient} />} />
          <Route path="/following" element={<FollowingRoutePage />} />
          <Route path="/footprints" element={<FootprintsRoutePage />} />
          <Route path="/history" element={<HistoryRoutePage apiClient={apiClient} />} />
        </Route>
        <Route path="*" element={<Navigate to={accessToken ? '/' : '/login'} replace />} />
      </Routes>
    </main>
  );
}

function RequireAuth() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const location = useLocation();
  if (!accessToken) {
    return <Navigate to="/login" replace state={{ returnTo: currentPath(location) }} />;
  }
  return <Outlet />;
}

function LoginRoute({ apiClient }: { apiClient: ApiClient }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const setSession = useSessionStore((state) => state.setSession);
  const navigate = useNavigate();
  const location = useLocation() as Location<AppLocationState | null>;
  const returnTo = loginReturnPath(location);

  if (accessToken) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <LoginPage
      apiClient={apiClient}
      onLoggedIn={(session) => {
        setSession(session);
        navigateWithTransition(navigate, returnTo, { replace: true });
      }}
    />
  );
}

function useAppNavigation() {
  const navigate = useNavigate();
  const location = useLocation() as Location<AppLocationState | null>;

  const openLot = (lot: LiveRoomLot) => {
    const status = stateFromLot(lot).status;
    if (status === 'RUNNING' || status === 'EXTENDED') {
      const returnTo = liveReturnPath(location, lot.roomId);
      navigateWithTransition(navigate, livePath(lot.roomId, lot.id, liveSourceTabFromPath(returnTo)), { state: { returnTo } });
      return;
    }
    navigateWithTransition(navigate, `/product/${lot.id}`);
  };

  const openRoom = (roomId: string, lotId?: string) => {
    const returnTo = liveReturnPath(location, roomId);
    navigateWithTransition(navigate, livePath(roomId, lotId, liveSourceTabFromPath(returnTo)), { state: { returnTo } });
  };

  return { navigate, openLot, openRoom };
}

function MainRoutePage({ apiClient, tab }: { apiClient: ApiClient; tab: MainTab }) {
  const user = useSessionStore((state) => state.user);
  const updateUser = useSessionStore((state) => state.updateUser);
  const [searchParams] = useSearchParams();
  const { navigate, openLot, openRoom } = useAppNavigation();

  return (
    <MainTabShell activeTab={tab} onTabChange={(nextTab) => navigateWithTransition(navigate, mainPath(nextTab))} t={t}>
      {tab === 'home' ? (
        <DiscoverPage apiClient={apiClient} focusRoomId={searchParams.get('focusRoomId') ?? undefined} onOpenRoom={(roomId) => openRoom(roomId)} />
      ) : tab === 'discover' ? (
        <LotDiscoveryPage apiClient={apiClient} onOpenLot={openLot} onOpenMerchant={(merchantId) => navigateWithTransition(navigate, `/merchant/${merchantId}`)} />
      ) : (
        <MePage
          apiClient={apiClient}
          userId={user?.id ?? 'u1'}
          sessionUser={user}
          onOpenOrders={(tab) => navigateWithTransition(navigate, ordersPath(tab))}
          onOpenFollowing={() => navigateWithTransition(navigate, '/following')}
          onOpenFootprints={() => navigateWithTransition(navigate, '/footprints')}
          onSettings={() => navigateWithTransition(navigate, '/settings')}
          onProfileUpdated={(profile) => updateUser({ nickname: profile.nickname, avatarUrl: profile.avatarUrl })}
        />
      )}
    </MainTabShell>
  );
}

function CategoryRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { categoryId = 'jewelry' } = useParams();
  const { navigate, openLot } = useAppNavigation();
  return <CategoryDetailPage apiClient={apiClient} categoryId={categoryId} onBack={() => navigateWithTransition(navigate, '/')} onOpenLot={openLot} />;
}

function SearchRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const [searchParams] = useSearchParams();
  const { navigate, openLot, openRoom } = useAppNavigation();
  return (
    <SearchPage
      apiClient={apiClient}
      initialKeyword={searchParams.get('q') ?? ''}
      initialTab={parseSearchTab(searchParams.get('tab'))}
      onBack={() => navigateWithTransition(navigate, '/')}
      onSearch={(keyword, tab) => navigateWithTransition(navigate, searchPath(keyword.trim(), tab))}
      onOpenRoom={(roomId) => openRoom(roomId)}
      onOpenLot={openLot}
      onOpenMerchant={(merchantId) => navigateWithTransition(navigate, `/merchant/${merchantId}`)}
    />
  );
}

function MerchantRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { merchantId = 'merchant_01' } = useParams();
  const { navigate, openLot, openRoom } = useAppNavigation();
  return <MerchantPage apiClient={apiClient} merchantId={merchantId} onBack={() => navigateWithTransition(navigate, '/')} onOpenRoom={(roomId) => openRoom(roomId)} onOpenLot={openLot} />;
}

function ProductRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { lotId = 'lot_3001' } = useParams();
  const { navigate, openRoom } = useAppNavigation();
  return <ProductPage apiClient={apiClient} lotId={lotId} onBack={() => navigateWithTransition(navigate, '/')} onOpenRoom={(roomId, lotId) => openRoom(roomId, lotId)} />;
}

function LiveRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { roomId = demoLiveRoom.id } = useParams();
  const [searchParams] = useSearchParams();
  const user = useSessionStore((state) => state.user);
  const navigate = useNavigate();
  const location = useLocation() as Location<AppLocationState | null>;
  const from = parseMainTab(searchParams.get('from'));
  const returnTo = location.state?.returnTo ?? fallbackLiveReturnPath(roomId, from);

  return (
    <LiveRoomPage
      apiClient={apiClient}
      roomId={roomId}
      initialLotId={searchParams.get('lotId') ?? undefined}
      userId={user?.id ?? 'u1'}
      onBack={() => navigateWithTransition(navigate, returnTo)}
      onPay={(orderId) => navigateWithTransition(navigate, `/pay/${orderId}`)}
    />
  );
}

function ResultRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { auctionId = 'auc_2001' } = useParams();
  const navigate = useNavigate();
  return <ResultPage apiClient={apiClient} auctionId={auctionId} onBack={() => navigateWithTransition(navigate, '/')} onPay={(orderId) => navigateWithTransition(navigate, `/pay/${orderId}`)} />;
}

function PayRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { orderId = 'ord_2001' } = useParams();
  const navigate = useNavigate();
  return <PayPage apiClient={apiClient} orderId={orderId} onBack={(auctionId) => navigateWithTransition(navigate, `/result/${auctionId}`)} />;
}

function SettingsRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const user = useSessionStore((state) => state.user);
  const updateUser = useSessionStore((state) => state.updateUser);
  const navigate = useNavigate();
  return (
    <SettingsPage
      apiClient={apiClient}
      sessionUser={user}
      onBack={() => navigateWithTransition(navigate, '/me')}
      onProfileUpdated={(profile) => updateUser({ nickname: profile.nickname, avatarUrl: profile.avatarUrl })}
    />
  );
}

function OrdersRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const [searchParams] = useSearchParams();
  const { navigate, openLot } = useAppNavigation();
  return (
    <OrdersPage
      apiClient={apiClient}
      activeTab={parseMyAuctionTab(searchParams.get('tab'))}
      onBack={() => navigateWithTransition(navigate, '/me')}
      onTabChange={(tab) => navigateWithTransition(navigate, ordersPath(tab))}
      onOpenLot={openLot}
      onOpenPay={(orderId) => navigateWithTransition(navigate, `/pay/${orderId}`)}
    />
  );
}

function FollowingRoutePage() {
  const { navigate, openRoom } = useAppNavigation();
  return <FollowingPage onBack={() => navigateWithTransition(navigate, '/me')} onOpenRoom={(roomId) => openRoom(roomId)} />;
}

function FootprintsRoutePage() {
  const { navigate, openRoom } = useAppNavigation();
  return <FootprintsPage onBack={() => navigateWithTransition(navigate, '/me')} onOpenRoom={(roomId) => openRoom(roomId)} />;
}

function HistoryRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const navigate = useNavigate();
  return <HistoryPage apiClient={apiClient} onBack={() => navigateWithTransition(navigate, '/')} />;
}

function LoginPage({ apiClient, onLoggedIn }: { apiClient: ApiClient; onLoggedIn: (session: LoginResult) => void }) {
  const [account, setAccount] = useState('buyer001');
  const [password, setPassword] = useState('Passw0rd!');
  const login = useMutation({
    mutationFn: () => apiClient.login({ account, password, role: 'buyer' }),
    onSuccess: onLoggedIn
  });

  return (
    <section className="login-page">
      <div className="login-hero">
        <img src={logoUrl} alt={t('app.title')} />
        <h1>{t('app.title')}</h1>
        <p>{t('app.subtitle')}</p>
      </div>
      <form className="auth-form">
        <label className="field-label" htmlFor="login-account">
          {t('login.account')}
        </label>
        <input id="login-account" value={account} onChange={(event) => setAccount(event.currentTarget.value)} />
        <label className="field-label" htmlFor="login-password">
          {t('login.password')}
        </label>
        <input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} />
      </form>
      <Button block color="primary" size="large" loading={login.isPending} onClick={() => login.mutate()}>
        {t('login.submit')}
      </Button>
      <p className="helper-text">{t('login.demoHint')}</p>
    </section>
  );
}

function LotDiscoveryPage({ apiClient, onOpenLot, onOpenMerchant }: { apiClient: ApiClient; onOpenLot: (lot: LiveRoomLot) => void; onOpenMerchant: (id: string) => void }) {
  const [lotSort, setLotSort] = useState<LotSortKey>('default');
  const [lotStatus, setLotStatus] = useState<LotStatusFilter>('all');
  const [categoryId, setCategoryId] = useState('all');
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.listCategories(), placeholderData: { items: demoCategories, total: demoCategories.length, page: 1, page_size: 20 } });
  const lots = useQuery({
    queryKey: ['discover-lots', lotSort, lotStatus, categoryId],
    queryFn: () => apiClient.searchLots({ sort: lotSort, status: lotStatus, categoryId })
  });

  return (
    <section className="search-page discover-lots-page">
      <header className="simple-page-header discover-lots-header">
        <div>
          <p className="eyebrow">{t('nav.discover')}</p>
          <h1>{t('discoverLots.title')}</h1>
        </div>
      </header>
      <FilterRow>
        <FilterSelect label={t('filter.sort')} value={lotSort} onChange={(value) => setLotSort(value as LotSortKey)} options={lotSortOptions()} />
        <FilterSelect label={t('filter.status')} value={lotStatus} onChange={(value) => setLotStatus(value as LotStatusFilter)} options={lotStatusOptions()} />
        <FilterSelect
          label={t('filter.category')}
          value={categoryId}
          onChange={setCategoryId}
          options={[{ value: 'all', label: t('status.all') }, ...(categories.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))]}
        />
      </FilterRow>
      <ResultList loading={lots.isLoading} empty={!lots.data?.items.length}>
        {(lots.data?.items ?? []).map((lot) => (
          <LotResultCard key={lot.id} lot={lot} onOpen={() => onOpenLot(lot)} onOpenMerchant={onOpenMerchant} />
        ))}
      </ResultList>
    </section>
  );
}

function CategoryDetailPage({ apiClient, categoryId, onBack, onOpenLot }: { apiClient: ApiClient; categoryId: string; onBack: () => void; onOpenLot: (lot: LiveRoomLot) => void }) {
  const [lotSort, setLotSort] = useState<LotSortKey>('default');
  const [lotStatus, setLotStatus] = useState<LotStatusFilter>('all');
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.listCategories(), placeholderData: { items: demoCategories, total: demoCategories.length, page: 1, page_size: 20 } });
  const lots = useQuery({
    queryKey: ['category-lots', categoryId, lotSort, lotStatus],
    queryFn: () => apiClient.searchLots({ categoryId, sort: lotSort, status: lotStatus })
  });
  const category = categories.data?.items.find((item) => item.id === categoryId);

  return (
    <section className="category-detail-page">
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> {t('common.back')}
        </button>
        <div>
          <p className="eyebrow">{t('nav.category')}</p>
          <h1>{category?.name ?? t('category.detailTitle')}</h1>
        </div>
      </header>
      <FilterRow>
        <FilterSelect label={t('filter.sort')} value={lotSort} onChange={(value) => setLotSort(value as LotSortKey)} options={lotSortOptions()} />
        <FilterSelect label={t('filter.status')} value={lotStatus} onChange={(value) => setLotStatus(value as LotStatusFilter)} options={lotStatusOptions()} />
      </FilterRow>
      <ResultList loading={lots.isLoading} empty={!lots.data?.items.length}>
        {(lots.data?.items ?? []).map((lot) => (
          <LotResultCard key={lot.id} lot={lot} onOpen={() => onOpenLot(lot)} />
        ))}
      </ResultList>
    </section>
  );
}

function DiscoverPage({ apiClient, focusRoomId, onOpenRoom }: { apiClient: ApiClient; focusRoomId?: string; onOpenRoom: (roomId: string) => void }) {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const trackRef = useRef<HTMLDivElement | null>(null);
  const feedDragRef = useRef<FeedDragState>();
  const feedTouchRef = useRef<FeedDragState>();
  const feedTransitioningRef = useRef(false);
  const resetFrameRef = useRef<number>();
  const restoreFrameRef = useRef<number>();
  const dragFrameRef = useRef<number>();
  const pendingDragOffsetRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [trackIndex, setTrackIndex] = useState(0);
  const [trackTransitionEnabled, setTrackTransitionEnabled] = useState(true);
  const rooms = useQuery({
    queryKey: ['discover-live-rooms'],
    queryFn: () => apiClient.searchLiveRooms({ status: 'live', sort: 'watchers' })
  });
  const roomItems = useMemo(() => rooms.data?.items ?? [], [rooms.data?.items]);
  const roomLotQueries = useQueries({
    queries: roomItems.map((room) => ({
      queryKey: ['discover-room-lots', room.id],
      queryFn: () => apiClient.listLiveRoomLots(room.id),
      enabled: Boolean(room.id)
    }))
  });
  const previewLots = useMemo(() => roomLotQueries.flatMap((query) => query.data?.items ?? []), [roomLotQueries]);
  const feedSlides = useMemo(() => createLoopedFeedSlides(roomItems), [roomItems]);
  const activeRoomId = roomItems[activeIndex]?.id ?? '';
  const trackTransform = feedTrackTransform(trackIndex);
  const trackClassName = trackTransitionEnabled ? 'discover-track' : 'discover-track is-resetting';

  const cancelResetFrames = useCallback(() => {
    if (resetFrameRef.current !== undefined) {
      window.cancelAnimationFrame(resetFrameRef.current);
      resetFrameRef.current = undefined;
    }
    if (restoreFrameRef.current !== undefined) {
      window.cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = undefined;
    }
  }, []);

  const cancelDragFrame = useCallback(() => {
    if (dragFrameRef.current !== undefined) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = undefined;
    }
  }, []);

  const writeTrackTransform = useCallback((nextTrackIndex: number, offsetPx = 0) => {
    if (!trackRef.current) return;
    trackRef.current.style.transform = feedTrackTransform(nextTrackIndex, offsetPx);
  }, []);

  const setImmediateTrackTransition = useCallback((enabled: boolean) => {
    setTrackTransitionEnabled(enabled);
    trackRef.current?.classList.toggle('is-resetting', !enabled);
  }, []);

  const scheduleDragTransform = useCallback((drag: FeedDragState) => {
    pendingDragOffsetRef.current = drag.lastY - drag.startY;
    if (dragFrameRef.current !== undefined) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = undefined;
      writeTrackTransform(drag.baseTrackIndex, pendingDragOffsetRef.current);
    });
  }, [writeTrackTransform]);

  const resetTrack = useCallback((nextTrackIndex: number) => {
    cancelResetFrames();
    setTrackTransitionEnabled(false);
    setTrackIndex(nextTrackIndex);
    resetFrameRef.current = window.requestAnimationFrame(() => {
      resetFrameRef.current = undefined;
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = undefined;
        setTrackTransitionEnabled(true);
        feedTransitioningRef.current = false;
      });
    });
  }, [cancelResetFrames]);

  useEffect(() => () => {
    cancelResetFrames();
    cancelDragFrame();
  }, [cancelDragFrame, cancelResetFrames]);

  useEffect(() => {
    setActiveIndex(0);
    resetTrack(roomItems.length > 1 ? 1 : 0);
  }, [resetTrack, roomItems.length]);

  useEffect(() => {
    if (!focusRoomId || !roomItems.length) return;
    const targetIndex = roomItems.findIndex((room) => room.id === focusRoomId);
    if (targetIndex < 0) return;
    setActiveIndex(targetIndex);
    resetTrack(roomItems.length > 1 ? targetIndex + 1 : targetIndex);
  }, [focusRoomId, resetTrack, roomItems]);

  useEffect(() => {
    feedSlides.forEach((slide, index) => {
      const video = videoRefs.current[slide.key];
      if (!video) return;
      if (index === trackIndex) {
        video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [feedSlides, trackIndex]);

  const getFeedViewportHeight = (element: HTMLElement) => element.clientHeight || element.getBoundingClientRect().height || window.innerHeight || 1;

  const switchFeed = useCallback(
    (step: number) => {
      if (roomItems.length < 2 || feedTransitioningRef.current) return;
      const nextIndex = loopIndex(activeIndex, roomItems.length, step);
      feedTransitioningRef.current = true;
      setTrackTransitionEnabled(true);
      setActiveIndex(nextIndex);
      if (step > 0 && activeIndex === roomItems.length - 1) {
        setTrackIndex(roomItems.length + 1);
        return;
      }
      if (step < 0 && activeIndex === 0) {
        setTrackIndex(0);
        return;
      }
      setTrackIndex(nextIndex + 1);
    },
    [activeIndex, roomItems.length]
  );

  const openRoomFromPreview = useCallback(() => {
    if (!activeRoomId || feedTransitioningRef.current) return;
    onOpenRoom(activeRoomId);
  }, [activeRoomId, onOpenRoom]);

  const finishFeedDrag = (drag?: FeedDragState) => {
    if (!drag) return;
    const offset = drag.lastY - drag.startY;
    const distance = Math.hypot(drag.lastX - drag.startX, offset);
    const elapsed = Date.now() - drag.startTime;
    cancelDragFrame();
    pendingDragOffsetRef.current = 0;
    setImmediateTrackTransition(true);
    if (elapsed < feedTapMaxDurationMs && distance < feedTapMaxMovePx) {
      writeTrackTransform(drag.baseTrackIndex);
      openRoomFromPreview();
      return;
    }
    if (Math.abs(offset) < drag.viewportHeight * 0.2 || roomItems.length < 2) {
      writeTrackTransform(drag.baseTrackIndex);
      return;
    }
    switchFeed(offset < 0 ? 1 : -1);
  };

  const onFeedTrackTransitionEnd = (event: ReactTransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || (event.propertyName && event.propertyName !== 'transform') || roomItems.length < 2) return;
    if (trackIndex === roomItems.length + 1) {
      resetTrack(1);
      return;
    }
    if (trackIndex === 0) {
      resetTrack(roomItems.length);
      return;
    }
    feedTransitioningRef.current = false;
  };

  const onFeedWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (roomItems.length < 2 || Math.abs(event.deltaY) < 48) return;
    event.preventDefault();
    switchFeed(event.deltaY > 0 ? 1 : -1);
  };

  const onFeedPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!roomItems.length || feedTransitioningRef.current) return;
    if (isFeedInteractiveTarget(event.target)) return;
    if (event.pointerType === 'touch') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    feedDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startTime: Date.now(),
      viewportHeight: getFeedViewportHeight(event.currentTarget),
      baseTrackIndex: trackIndex
    };
    setImmediateTrackTransition(false);
  };

  const onFeedPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = feedDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    if (roomItems.length > 1) scheduleDragTransform(drag);
  };

  const onFeedPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = feedDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    feedDragRef.current = undefined;
    finishFeedDrag(drag);
  };

  const onFeedTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    if (!roomItems.length || feedTransitioningRef.current || event.touches.length !== 1) return;
    if (isFeedInteractiveTarget(event.target)) return;
    const touch = event.touches[0];
    feedTouchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      startTime: Date.now(),
      viewportHeight: getFeedViewportHeight(event.currentTarget),
      baseTrackIndex: trackIndex
    };
    setImmediateTrackTransition(false);
  };

  const onFeedTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    const drag = feedTouchRef.current;
    if (!drag || event.touches.length !== 1) return;
    const touch = event.touches[0];
    drag.lastX = touch.clientX;
    drag.lastY = touch.clientY;
    if (roomItems.length > 1) scheduleDragTransform(drag);
  };

  const onFeedTouchEnd = () => {
    const drag = feedTouchRef.current;
    if (!drag) return;
    feedTouchRef.current = undefined;
    finishFeedDrag(drag);
  };

  if (rooms.isLoading) return <LoadingBlock />;
  if (!roomItems.length) {
    return (
      <section className="discover-page empty-discover">
        <EmptyState text={t('discover.empty')} />
      </section>
    );
  }

  return (
    <section
      className="discover-page"
      aria-label={t('discover.feed')}
      data-testid="discover-feed"
      data-active-room-id={activeRoomId}
      onWheel={onFeedWheel}
      onPointerDown={onFeedPointerDown}
      onPointerMove={onFeedPointerMove}
      onPointerUp={onFeedPointerEnd}
      onPointerCancel={onFeedPointerEnd}
      onTouchStart={onFeedTouchStart}
      onTouchMove={onFeedTouchMove}
      onTouchEnd={onFeedTouchEnd}
      onTouchCancel={onFeedTouchEnd}
    >
      <div ref={trackRef} className={trackClassName} style={{ transform: trackTransform }} onTransitionEnd={onFeedTrackTransitionEnd}>
        {feedSlides.map((slide, slideIndex) => {
          const room = slide.room;
          const activeLot = selectPreviewLot(room.id, previewLots);
          const activeLotStatusKind = activeLot ? previewLotStatusKind(activeLot) : undefined;
          const isActive = slideIndex === trackIndex;
          return (
            <article className={isActive ? 'discover-slide is-active is-focused' : 'discover-slide'} aria-current={isActive ? 'true' : undefined} data-room-id={room.id} key={slide.key}>
              <video
                className="discover-video"
                src={liveRoomPreviewVideoUrl(room) ?? liveVideoFallback}
                poster={room.coverUrl}
                muted
                loop
                playsInline
                preload="metadata"
                ref={(node) => {
                  videoRefs.current[slide.key] = node;
                }}
              />
              <div className="discover-gradient" />
              <div className="discover-copy" data-testid={isActive ? 'discover-preview-meta' : undefined}>
                <div className="discover-live-line">
                  <span className="discover-live-pill">
                    <Radio size={13} /> {statusLabel(room.status)}
                  </span>
                  <span className="discover-watcher-count">
                    <Users size={13} /> {room.watcherCount}
                  </span>
                </div>
                <p className="discover-merchant">@{room.merchantName}</p>
                <h2>{room.title}</h2>
                {activeLot ? (
                  <div className="discover-lot">
                    <VisualPlaceholder title={activeLot.title} imageUrl={activeLot.imageUrl} tone="gold" />
                    <strong>{activeLot.title}</strong>
                    <span className={activeLotStatusKind === 'running' ? 'discover-lot-status is-running' : 'discover-lot-status is-upcoming'}>
                      {activeLotStatusKind === 'running' ? t('auction.running') : t('auction.upcoming')}
                    </span>
                    <span className="discover-lot-price">{formatMoney(priceValue(activeLot, stateFromLot(activeLot)))}</span>
                  </div>
                ) : null}
              </div>
              <Button
                className="discover-enter-button"
                color="primary"
                data-testid={isActive ? 'discover-enter-live' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenRoom(room.id);
                }}
              >
                {t('discover.enterLive')}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function liveRoomPreviewVideoUrl(room: LiveRoom): string | undefined {
  if (room.videoSource === 'digitalHuman') return room.digitalHuman?.idleVideoUrl;
  return room.videoUrl;
}

function SearchPage({
  apiClient,
  initialKeyword,
  initialTab,
  onBack,
  onSearch,
  onOpenRoom,
  onOpenLot,
  onOpenMerchant
}: {
  apiClient: ApiClient;
  initialKeyword: string;
  initialTab: SearchTab;
  onBack: () => void;
  onSearch: (keyword: string, tab: SearchTab) => void;
  onOpenRoom: (roomId: string) => void;
  onOpenLot: (lot: LiveRoomLot) => void;
  onOpenMerchant: (merchantId: string) => void;
}) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [activeTab, setActiveTab] = useState<SearchTab>(initialTab);
  const [lotSort, setLotSort] = useState<LotSortKey>('default');
  const [lotStatus, setLotStatus] = useState<LotStatusFilter>('all');
  const [categoryId, setCategoryId] = useState('all');
  const [roomSort, setRoomSort] = useState<LiveRoomSortKey>('default');
  const [roomStatus, setRoomStatus] = useState<LiveRoomStatusFilter>('all');

  useEffect(() => setKeyword(initialKeyword), [initialKeyword]);
  useEffect(() => setActiveTab(initialTab), [initialTab]);

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.listCategories(), placeholderData: { items: demoCategories, total: demoCategories.length, page: 1, page_size: 20 } });
  const lots = useQuery({
    queryKey: ['search-lots', keyword, lotSort, lotStatus, categoryId],
    queryFn: () => apiClient.searchLots({ keyword, sort: lotSort, status: lotStatus, categoryId })
  });
  const rooms = useQuery({
    queryKey: ['search-live-rooms', keyword, roomSort, roomStatus],
    queryFn: () => apiClient.searchLiveRooms({ keyword, sort: roomSort, status: roomStatus })
  });
  const merchants = useQuery({
    queryKey: ['search-merchants', keyword],
    queryFn: () => apiClient.searchMerchants({ keyword })
  });

  const commitSearch = () => onSearch(keyword.trim(), activeTab);
  const switchTab = (tab: SearchTab) => {
    setActiveTab(tab);
    onSearch(keyword.trim(), tab);
  };

  return (
    <section className="search-page">
      <header className="search-header">
        <button className="back-button" type="button" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <label className="search-input" htmlFor="global-search">
          <Search size={18} />
          <input
            id="global-search"
            value={keyword}
            placeholder={t('search.placeholder')}
            onChange={(event) => setKeyword(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitSearch();
            }}
          />
        </label>
        <Button size="small" color="primary" onClick={commitSearch}>
          {t('search.submit')}
        </Button>
      </header>

      <Tabs activeKey={activeTab} onChange={(key) => switchTab(key as SearchTab)}>
        <Tabs.Tab title={t('search.lots')} key="lots">
          <FilterRow>
            <FilterSelect label={t('filter.sort')} value={lotSort} onChange={(value) => setLotSort(value as LotSortKey)} options={lotSortOptions()} />
            <FilterSelect label={t('filter.status')} value={lotStatus} onChange={(value) => setLotStatus(value as LotStatusFilter)} options={lotStatusOptions()} />
            <FilterSelect
              label={t('filter.category')}
              value={categoryId}
              onChange={setCategoryId}
              options={[{ value: 'all', label: t('status.all') }, ...(categories.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))]}
            />
          </FilterRow>
          <ResultList loading={lots.isLoading} empty={!lots.data?.items.length}>
            {(lots.data?.items ?? []).map((lot) => (
              <LotResultCard key={lot.id} lot={lot} onOpen={() => onOpenLot(lot)} onOpenMerchant={onOpenMerchant} />
            ))}
          </ResultList>
        </Tabs.Tab>
        <Tabs.Tab title={t('search.liveRooms')} key="liveRooms">
          <FilterRow>
            <FilterSelect label={t('filter.sort')} value={roomSort} onChange={(value) => setRoomSort(value as LiveRoomSortKey)} options={roomSortOptions()} />
            <FilterSelect label={t('filter.status')} value={roomStatus} onChange={(value) => setRoomStatus(value as LiveRoomStatusFilter)} options={roomStatusOptions()} />
          </FilterRow>
          <ResultList loading={rooms.isLoading} empty={!rooms.data?.items.length}>
            {(rooms.data?.items ?? []).map((room) => (
              <LiveRoomResultCard key={room.id} room={room} onOpen={() => onOpenRoom(room.id)} />
            ))}
          </ResultList>
        </Tabs.Tab>
        <Tabs.Tab title={t('search.merchants')} key="merchants">
          <ResultList loading={merchants.isLoading} empty={!merchants.data?.items.length}>
            {(merchants.data?.items ?? []).map((merchant) => (
              <MerchantResultCard key={merchant.id} merchant={merchant} onOpen={() => onOpenMerchant(merchant.id)} />
            ))}
          </ResultList>
        </Tabs.Tab>
      </Tabs>
    </section>
  );
}

function MerchantPage({ apiClient, merchantId, onBack, onOpenRoom, onOpenLot }: { apiClient: ApiClient; merchantId: string; onBack: () => void; onOpenRoom: (roomId: string) => void; onOpenLot: (lot: LiveRoomLot) => void }) {
  const [lotSort, setLotSort] = useState<LotSortKey>('default');
  const [lotStatus, setLotStatus] = useState<LotStatusFilter>('all');
  const [categoryId, setCategoryId] = useState('all');
  const merchant = useQuery({ queryKey: ['merchant', merchantId], queryFn: () => apiClient.getMerchant(merchantId) });
  const liveRoom = useQuery({ queryKey: ['merchant-live-room', merchant.data?.liveRoomId], queryFn: () => apiClient.getLiveRoom(merchant.data?.liveRoomId ?? ''), enabled: Boolean(merchant.data?.liveRoomId) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.listCategories(), placeholderData: { items: demoCategories, total: demoCategories.length, page: 1, page_size: 20 } });
  const lots = useQuery({
    queryKey: ['merchant-lots', merchantId, lotSort, lotStatus, categoryId],
    queryFn: () => apiClient.searchLots({ merchantId, sort: lotSort, status: lotStatus, categoryId })
  });
  const data = merchant.data;

  return (
    <section className="merchant-page">
      <header className="merchant-hero">
        <button className="merchant-back" type="button" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        {data ? (
          <>
            <div className="merchant-profile">
              <VisualPlaceholder title={data.name} imageUrl={data.avatarUrl} tone="blue" />
              <div>
                <h1>{data.name}</h1>
                <p>{data.description}</p>
              </div>
            </div>
            <div className="merchant-stats">
              <Metric label={t('merchant.followers')} value={formatCompactNumber(data.followerCount)} icon={<Users size={16} />} />
              <Metric label={t('merchant.rating')} value={String(data.rating ?? '-')} icon={<Star size={16} />} />
              <Metric label={t('merchant.location')} value={data.location ?? '-'} icon={<MapPin size={16} />} />
            </div>
          </>
        ) : (
          <LoadingBlock />
        )}
      </header>

      <div className="merchant-body">
        <SectionTitle eyebrow={t('merchant.liveWindow')} title={liveRoom.data?.title ?? t('merchant.noLive')} />
        {liveRoom.data ? <LiveRoomCard room={liveRoom.data} onOpen={() => onOpenRoom(liveRoom.data.id)} compact /> : null}

        <SectionTitle eyebrow={t('merchant.title')} title={t('merchant.allLots')} />
        <FilterRow>
          <FilterSelect label={t('filter.sort')} value={lotSort} onChange={(value) => setLotSort(value as LotSortKey)} options={lotSortOptions()} />
          <FilterSelect label={t('filter.status')} value={lotStatus} onChange={(value) => setLotStatus(value as LotStatusFilter)} options={lotStatusOptions()} />
          <FilterSelect
            label={t('filter.category')}
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: 'all', label: t('status.all') }, ...(categories.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))]}
          />
        </FilterRow>
        <ResultList loading={lots.isLoading} empty={!lots.data?.items.length}>
          {(lots.data?.items ?? []).map((lot) => (
            <LotResultCard key={lot.id} lot={lot} onOpen={() => onOpenLot(lot)} />
          ))}
        </ResultList>
      </div>
    </section>
  );
}

function ProductPage({ apiClient, lotId, onBack, onOpenRoom }: { apiClient: ApiClient; lotId: string; onBack: () => void; onOpenRoom: (roomId: string, lotId: string) => void }) {
  const lot = useQuery({ queryKey: ['lot', lotId], queryFn: () => apiClient.getLot(lotId) });
  const merchant = useQuery({ queryKey: ['lot-merchant', lot.data?.merchantId], queryFn: () => apiClient.getMerchant(lot.data?.merchantId ?? ''), enabled: Boolean(lot.data?.merchantId) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.listCategories(), placeholderData: { items: demoCategories, total: demoCategories.length, page: 1, page_size: 20 } });
  const item = lot.data;
  const state = item ? stateFromLot(item) : undefined;
  const category = categories.data?.items.find((candidate) => candidate.id === item?.categoryId);

  return (
    <section className="product-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> {t('common.back')}
      </button>
      {item && state ? (
        <>
          <div className="product-cover">
            <VisualPlaceholder title={item.title} imageUrl={item.imageUrl} tone="red" />
            <span className="status-badge">{lotStatusLabel(state.status)}</span>
          </div>
          <div className="product-panel">
            <p className="price-label">{priceLabel(item, state)}</p>
            <h1>{formatMoney(priceValue(item, state))}</h1>
            <h2>{item.title}</h2>
            <p>{item.description ?? item.subtitle}</p>
            <div className="product-meta">
              <span>{t('product.merchant')}: {merchant.data?.name ?? '-'}</span>
              <span>{t('product.category')}: {category?.name ?? '-'}</span>
              <span>{t('product.publishedAt')}: {formatDate(item.publishedAt)}</span>
            </div>
            <div className="price-grid compact">
              <Metric label={t('auction.participants')} value={String(item.participantCount ?? 0)} icon={<Users size={16} />} />
              <Metric label={t('auction.bidCount')} value={String(item.bidCount ?? 0)} icon={<Gavel size={16} />} />
              <Metric label={t('auction.increment')} value={formatMoney(Number(item.ruleSnapshot?.minIncrement ?? 100))} icon={<Plus size={16} />} />
              <Metric label={t('auction.deposit')} value={formatMoney(item.depositAmount ?? 0)} icon={<WalletCards size={16} />} />
            </div>
            <Button block color="danger" disabled={state.status !== 'RUNNING' && state.status !== 'EXTENDED'} onClick={() => onOpenRoom(item.roomId, item.id)}>
              {state.status === 'RUNNING' || state.status === 'EXTENDED' ? t('product.goLive') : t('product.liveUnavailable')}
            </Button>
          </div>
        </>
      ) : (
        <LoadingBlock />
      )}
    </section>
  );
}

function MePage({
  apiClient,
  userId,
  sessionUser,
  onOpenOrders,
  onOpenFollowing,
  onOpenFootprints,
  onSettings,
  onProfileUpdated
}: {
  apiClient: ApiClient;
  userId: string;
  sessionUser?: LoginResult['user'];
  onOpenOrders: (tab: MyAuctionTabKey) => void;
  onOpenFollowing: () => void;
  onOpenFootprints: () => void;
  onSettings: () => void;
  onProfileUpdated: (profile: UserProfile) => void;
}) {
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const profileOverride = useProfileStore((state) => state.profileOverride);
  const setProfileOverride = useProfileStore((state) => state.setProfileOverride);
  const followedCount = useLiveActivityStore((state) => state.followedRooms.length);
  const footprintCount = useLiveActivityStore((state) => state.footprints.length);
  const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: () => apiClient.getMyProfile() });
  const recordsQuery = useQuery({ queryKey: ['my-auction-records'], queryFn: () => apiClient.listMyAuctionRecords(), placeholderData: { items: [], total: 0, page: 1, page_size: 20 } });
  const baseProfile = profileQuery.data ?? profileFromSession(userId, sessionUser);
  const profile = mergeProfile(baseProfile, profileOverride);
  const groupedRecords = groupAuctionRecords(recordsQuery.data?.items ?? []);
  const avatarMutation = useMutation({
    mutationFn: (avatarUrl: string) => apiClient.updateMyProfile({ userId: profile.userId, avatarUrl, nickname: profile.nickname }),
    onSuccess: (saved) => {
      const nextProfile = mergeProfile(saved, { avatarUrl: saved.avatarUrl });
      setProfileOverride(nextProfile);
      onProfileUpdated(nextProfile);
      setShowAvatarDialog(false);
    }
  });
  const statusItems = userRecordStatusItems(groupedRecords);
  const orderShortcutItems = statusItems.filter((item) => item.key !== 'all');

  return (
    <section className="me-page">
      <header className="me-hero">
        <button className="icon-button" type="button" onClick={onSettings} aria-label={t('settings.title')}>
          <Settings size={21} />
        </button>
        <div className="me-profile-card">
          <button className="me-avatar-button" type="button" onClick={() => setShowAvatarDialog(true)} aria-label={t('profile.viewAvatar')}>
            <AvatarView profile={profile} />
          </button>
          <div>
            <h1>{profile.nickname}</h1>
            <p>{t('profile.userId', { id: profile.userId })}</p>
          </div>
        </div>
        <div className="profile-stats" aria-label={t('profile.quickLinks')}>
          <ProfileStat value={followedCount} label={t('profile.following')} onClick={onOpenFollowing} />
          <ProfileStat value={footprintCount} label={t('profile.footprints')} onClick={onOpenFootprints} />
        </div>
      </header>

      <section className="order-shortcut-card" aria-label={t('profile.myOrders')}>
        <header className="order-card-header">
          <h2>{t('profile.myOrders')}</h2>
          <button type="button" onClick={() => onOpenOrders('all')} aria-label={t('profile.orderAll')}>
            {t('profile.orderAll')} <ChevronRight size={15} />
          </button>
        </header>
        <div className="order-shortcut-grid" aria-label={t('profile.orderShortcutList')}>
          {orderShortcutItems.map((item) => (
            <button key={item.key} type="button" onClick={() => onOpenOrders(item.key)}>
              {item.icon}
              <strong>{item.count}</strong>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      {showAvatarDialog ? <AvatarDialog profile={profile} saving={avatarMutation.isPending} onClose={() => setShowAvatarDialog(false)} onSave={(avatarUrl) => avatarMutation.mutate(avatarUrl)} /> : null}
    </section>
  );
}

function SettingsPage({
  apiClient,
  sessionUser,
  onBack,
  onProfileUpdated
}: {
  apiClient: ApiClient;
  sessionUser?: LoginResult['user'];
  onBack: () => void;
  onProfileUpdated: (profile: UserProfile) => void;
}) {
  const profileOverride = useProfileStore((state) => state.profileOverride);
  const setProfileOverride = useProfileStore((state) => state.setProfileOverride);
  const locale = usePreferencesStore((state) => state.locale);
  const setLocale = usePreferencesStore((state) => state.setLocale);
  const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: () => apiClient.getMyProfile() });
  const baseProfile = profileQuery.data ?? profileFromSession(sessionUser?.id ?? 'u1', sessionUser);
  const profile = mergeProfile(baseProfile, profileOverride);
  const [nickname, setNickname] = useState(profile.nickname);
  const [languageNotice, setLanguageNotice] = useState('');

  useEffect(() => {
    setNickname(profile.nickname);
  }, [profile.nickname]);

  const save = useMutation({
    mutationFn: () => apiClient.updateMyProfile({ userId: profile.userId, nickname: nickname.trim(), avatarUrl: profile.avatarUrl }),
    onSuccess: (saved) => {
      const nextProfile = mergeProfile(saved, { nickname: saved.nickname, avatarUrl: saved.avatarUrl });
      setProfileOverride(nextProfile);
      onProfileUpdated(nextProfile);
      onBack();
    }
  });

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setLanguageNotice(createTranslator(nextLocale)('settings.languageSaved'));
  };

  return (
    <section className="settings-page">
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> {t('common.back')}
        </button>
        <div>
          <p className="eyebrow">{t('nav.me')}</p>
          <h1>{t('settings.title')}</h1>
        </div>
      </header>
      <section className="settings-card">
        <label htmlFor="profile-nickname">{t('settings.nickname')}</label>
        <input id="profile-nickname" value={nickname} maxLength={24} onChange={(event) => setNickname(event.currentTarget.value)} />
        <Button block color="primary" loading={save.isPending} disabled={!nickname.trim()} onClick={() => save.mutate()}>
          {t('settings.save')}
        </Button>
      </section>
      <section className="settings-card">
        <h2>{t('settings.language')}</h2>
        <div className="language-choice-row" role="group" aria-label={t('settings.language')}>
          <button type="button" className={locale === 'zh-CN' ? 'is-active' : ''} aria-pressed={locale === 'zh-CN'} onClick={() => changeLocale('zh-CN')}>
            {t('settings.languageZhCn')}
          </button>
          <button type="button" className={locale === 'en-US' ? 'is-active' : ''} aria-pressed={locale === 'en-US'} onClick={() => changeLocale('en-US')}>
            {t('settings.languageEnUs')}
          </button>
        </div>
        {languageNotice ? <p className="settings-hint" aria-live="polite">{languageNotice}</p> : null}
      </section>
    </section>
  );
}

function OrdersPage({
  apiClient,
  activeTab,
  onBack,
  onTabChange,
  onOpenLot,
  onOpenPay
}: {
  apiClient: ApiClient;
  activeTab: MyAuctionTabKey;
  onBack: () => void;
  onTabChange: (tab: MyAuctionTabKey) => void;
  onOpenLot: (lot: LiveRoomLot) => void;
  onOpenPay: (orderId: string, auctionId: string) => void;
}) {
  const recordsQuery = useQuery({ queryKey: ['my-auction-records'], queryFn: () => apiClient.listMyAuctionRecords(), placeholderData: { items: [], total: 0, page: 1, page_size: 20 } });
  const groupedRecords = groupAuctionRecords(recordsQuery.data?.items ?? []);
  return (
    <section className="orders-page">
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> {t('common.back')}
        </button>
        <div>
          <p className="eyebrow">{t('nav.me')}</p>
          <h1>{t('orders.title')}</h1>
        </div>
      </header>
      <div className="orders-tab-row" aria-label={t('orders.tabs')}>
        {myAuctionTabKeys.map((tab) => (
          <button key={tab} className={activeTab === tab ? 'is-active' : ''} type="button" onClick={() => onTabChange(tab)}>
            {recordStatusLabel(tab)}
          </button>
        ))}
      </div>
      <section className="record-list-section order-list-page-section">
        <SectionTitle eyebrow={t('profile.records')} title={recordStatusLabel(activeTab)} />
        <ResultList loading={recordsQuery.isLoading} empty={!groupedRecords[activeTab].length}>
          {groupedRecords[activeTab].map((record) => (
            <AuctionRecordCard
              key={record.id}
              record={record}
              onOpen={() => onOpenLot(record.lot)}
              onPay={record.order ? () => onOpenPay(record.order?.id ?? '', record.lot.auctionId) : undefined}
            />
          ))}
        </ResultList>
      </section>
    </section>
  );
}

function FollowingPage({ onBack, onOpenRoom }: { onBack: () => void; onOpenRoom: (roomId: string) => void }) {
  const followedRooms = useLiveActivityStore((state) => state.followedRooms);
  const unfollowRoom = useLiveActivityStore((state) => state.unfollowRoom);
  return (
    <section className="activity-page">
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> {t('common.back')}
        </button>
        <div>
          <p className="eyebrow">{t('nav.me')}</p>
          <h1>{t('profile.followingTitle')}</h1>
        </div>
      </header>
      {followedRooms.length ? (
        <div className="activity-room-list">
          {followedRooms.map((room) => (
            <LiveActivityRoomCard
              key={room.roomId}
              item={room}
              timeLabel={t('profile.followedAt')}
              timeValue={room.followedAt}
              primaryAction={t('profile.enterLiveRoom')}
              onPrimary={() => onOpenRoom(room.roomId)}
              secondaryAction={t('profile.cancelFollow')}
              onSecondary={() => unfollowRoom(room.roomId)}
            />
          ))}
        </div>
      ) : (
        <EmptyState text={t('profile.noFollowing')} />
      )}
    </section>
  );
}

function FootprintsPage({ onBack, onOpenRoom }: { onBack: () => void; onOpenRoom: (roomId: string) => void }) {
  const footprints = useLiveActivityStore((state) => state.footprints);
  const getFootprintsPage = useLiveActivityStore((state) => state.getFootprintsPage);
  const [visibleCount, setVisibleCount] = useState(10);
  const visibleFootprints = getFootprintsPage(0, visibleCount);
  const canLoadMore = visibleCount < footprints.length;

  const loadMore = () => setVisibleCount((count) => Math.min(count + 10, footprints.length));
  const handleScroll = (event: ReactUIEvent<HTMLElement>) => {
    const target = event.currentTarget;
    if (!canLoadMore || target.scrollHeight - target.scrollTop - target.clientHeight > 32) return;
    loadMore();
  };

  return (
    <section className="activity-page footprint-page" onScroll={handleScroll}>
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack}>
          <ArrowLeft size={18} /> {t('common.back')}
        </button>
        <div>
          <p className="eyebrow">{t('nav.me')}</p>
          <h1>{t('profile.footprintTitle')}</h1>
        </div>
      </header>
      {visibleFootprints.length ? (
        <div className="activity-room-list">
          {visibleFootprints.map((room) => (
            <LiveActivityRoomCard
              key={room.roomId}
              item={room}
              timeLabel={t('profile.viewedAt')}
              timeValue={room.viewedAt}
              primaryAction={t('profile.enterLiveRoom')}
              onPrimary={() => onOpenRoom(room.roomId)}
            />
          ))}
          {canLoadMore ? (
            <button className="load-more-button" type="button" onClick={loadMore}>
              {t('profile.loadMore')}
            </button>
          ) : null}
        </div>
      ) : (
        <EmptyState text={t('profile.noFootprints')} />
      )}
    </section>
  );
}

function LiveActivityRoomCard({
  item,
  timeLabel,
  timeValue,
  primaryAction,
  onPrimary,
  secondaryAction,
  onSecondary
}: {
  item: FollowedLiveRoom | LiveRoomFootprint;
  timeLabel: string;
  timeValue: string;
  primaryAction: string;
  onPrimary: () => void;
  secondaryAction?: string;
  onSecondary?: () => void;
}) {
  return (
    <article className="activity-room-card">
      <button className="activity-room-cover" type="button" onClick={onPrimary}>
        <VisualPlaceholder title={item.title} imageUrl={item.coverUrl} tone="blue" />
      </button>
      <div>
        <h2>{item.title}</h2>
        <p>{item.merchantName}</p>
        <span>{timeLabel} {formatDate(timeValue)}</span>
        <div className="activity-room-actions">
          <Button size="small" color="primary" onClick={onPrimary}>
            {primaryAction}
          </Button>
          {secondaryAction && onSecondary ? (
            <Button size="small" fill="outline" onClick={onSecondary}>
              {secondaryAction}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-heading compact-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
    </div>
  );
}

function LiveRoomCard({ room, onOpen, compact = false }: { room: LiveRoom; onOpen: () => void; compact?: boolean }) {
  return (
    <article className={compact ? 'room-card compact' : 'room-card'}>
      <button className="room-thumb" type="button" onClick={onOpen}>
        <video muted loop playsInline preload="metadata" src={liveRoomPreviewVideoUrl(room) ?? liveVideoFallback} poster={room.coverUrl} />
        <span className="live-pill">{statusLabel(room.status)}</span>
      </button>
      <div className="room-card-body">
        <h2>{room.title}</h2>
        <p>{room.merchantName}</p>
        <div className="room-card-stats">
          <span>
            <Wifi size={14} /> {t('home.online')} {room.onlineCount}
          </span>
          <span>
            <Users size={14} /> {t('home.watchers')} {room.watcherCount}
          </span>
        </div>
        <Button color="primary" size="small" onClick={onOpen}>
          {t('home.enterRoom')}
        </Button>
      </div>
    </article>
  );
}

function LiveRoomResultCard({ room, onOpen }: { room: LiveRoom; onOpen: () => void }) {
  return (
    <article className="search-result-card live-result-card">
      <button className="result-media" type="button" onClick={onOpen}>
        <Radio size={30} />
        <span>{statusLabel(room.status)}</span>
      </button>
      <div>
        <h3>{room.title}</h3>
        <p>{room.merchantName}</p>
        <div className="result-meta">
          <span>{t('home.watchers')} {room.watcherCount}</span>
          <span>{t('home.online')} {room.onlineCount}</span>
        </div>
      </div>
      <button className="open-arrow" type="button" onClick={onOpen} aria-label={t('common.view')}>
        <ChevronRight size={18} />
      </button>
    </article>
  );
}

function LotResultCard({ lot, onOpen, onOpenMerchant }: { lot: LiveRoomLot; onOpen: () => void; onOpenMerchant?: (merchantId: string) => void }) {
  const state = stateFromLot(lot);
  return (
    <article className="search-result-card lot-result-card">
      <button className="result-media" type="button" onClick={onOpen}>
        <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="red" />
      </button>
      <div>
        <span className="status-badge">{lotStatusLabel(state.status)}</span>
        <h3>{lot.title}</h3>
        <p>{lot.subtitle}</p>
        <div className="lot-price-line">
          <span>{priceLabel(lot, state)}</span>
          <strong>{formatMoney(priceValue(lot, state))}</strong>
        </div>
        {lot.merchantId && onOpenMerchant ? (
          <button className="text-link" type="button" onClick={() => onOpenMerchant(lot.merchantId ?? '')}>
            {t('product.merchant')} <ChevronRight size={13} />
          </button>
        ) : null}
      </div>
      <Button size="small" color={state.status === 'RUNNING' || state.status === 'EXTENDED' ? 'danger' : 'primary'} fill={state.status === 'UPCOMING' ? 'outline' : 'solid'} onClick={onOpen}>
        {lotActionText(state.status)}
      </Button>
    </article>
  );
}

function MerchantResultCard({ merchant, onOpen }: { merchant: Merchant; onOpen: () => void }) {
  return (
    <article className="search-result-card merchant-result-card">
      <button className="result-media" type="button" onClick={onOpen}>
        <VisualPlaceholder title={merchant.name} imageUrl={merchant.avatarUrl} tone="blue" />
      </button>
      <div>
        <h3>{merchant.name}</h3>
        <p>{merchant.description}</p>
        <div className="result-meta">
          <span>{t('merchant.followers')} {formatCompactNumber(merchant.followerCount)}</span>
          <span>{t('merchant.rating')} {merchant.rating ?? '-'}</span>
        </div>
      </div>
      <button className="open-arrow" type="button" onClick={onOpen} aria-label={t('common.view')}>
        <ChevronRight size={18} />
      </button>
    </article>
  );
}

function FilterRow({ children }: { children: ReactNode }) {
  return (
    <div className="filter-row">
      <SlidersHorizontal size={16} />
      {children}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultList({ loading, empty, children }: { loading: boolean; empty: boolean; children: ReactNode }) {
  if (loading) return <LoadingBlock />;
  if (empty) {
    return <EmptyState text={t('search.empty')} />;
  }
  return <div className="result-list">{children}</div>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Package size={30} />
      <span>{text}</span>
    </div>
  );
}

function VisualPlaceholder({ title, imageUrl, tone = 'red' }: { title: string; imageUrl?: string; tone?: 'red' | 'blue' | 'gold' }) {
  if (imageUrl) return <img src={imageUrl} alt={title} />;
  return (
    <div className={`visual-placeholder tone-${tone}`} aria-label={title}>
      <span>{title.slice(0, 2)}</span>
      <small>{t('image.placeholder')}</small>
    </div>
  );
}

function AvatarView({ profile }: { profile: UserProfile }) {
  if (profile.avatarUrl) return <img src={profile.avatarUrl} alt={profile.nickname} />;
  return (
    <div className="avatar-fallback">
      <span>{profile.nickname.slice(0, 1)}</span>
    </div>
  );
}

function ProfileStat({ value, label, onClick }: { value: number; label: string; onClick: () => void }) {
  return (
    <button className="profile-stat-button" type="button" onClick={onClick} aria-label={label}>
      <strong>{value}</strong>
      <span>{label}</span>
    </button>
  );
}

function AuctionRecordCard({ record, onOpen, onPay }: { record: UserAuctionRecord; onOpen: () => void; onPay?: () => void }) {
  const state = stateFromLot(record.lot);
  const recordTab = classifyAuctionRecord(record) ?? 'all';
  const canPay = recordTab === 'pendingPay' && onPay;
  return (
    <article className="search-result-card record-card">
      <button className="result-media" type="button" onClick={onOpen}>
        <VisualPlaceholder title={record.lot.title} imageUrl={record.lot.imageUrl} tone={recordTab === 'completed' ? 'gold' : 'red'} />
      </button>
      <div>
        <span className="status-badge">{recordTab === 'all' ? lotStatusLabel(state.status) : recordStatusLabel(recordTab)}</span>
        <h3>{record.lot.title}</h3>
        <p>{record.room?.title ?? record.lot.subtitle}</p>
        <div className="lot-price-line">
          <span>{t('auction.deposit')}</span>
          <strong>{formatMoney(record.depositAmount)}</strong>
        </div>
        <div className="result-meta">
          <span>{priceLabel(record.lot, state)} {formatMoney(priceValue(record.lot, state))}</span>
        </div>
      </div>
      {canPay ? (
        <Button size="small" color="danger" onClick={onPay}>
          {t('profile.payNow')}
        </Button>
      ) : (
        <button className="open-arrow" type="button" onClick={onOpen} aria-label={t('common.view')}>
          <ChevronRight size={18} />
        </button>
      )}
    </article>
  );
}

function AvatarDialog({
  profile,
  saving,
  onClose,
  onSave
}: {
  profile: UserProfile;
  saving: boolean;
  onClose: () => void;
  onSave: (avatarUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; offsetX: number; offsetY: number }>();
  const touchDragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>();
  const cropRef = useRef<AvatarCropState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const avatarPointersRef = useRef<Map<number, PointerPoint>>(new Map());
  const pinchRef = useRef<{ distance: number; centerX: number; centerY: number; scale: number; offsetX: number; offsetY: number }>();
  const touchPinchRef = useRef<{ distance: number; centerX: number; centerY: number; scale: number; offsetX: number; offsetY: number }>();
  const [selectedUrl, setSelectedUrl] = useState('');
  const [crop, setCrop] = useState<AvatarCropState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [error, setError] = useState('');

  const updateCrop = useCallback((updater: (current: AvatarCropState) => AvatarCropState) => {
    setCrop((current) => {
      const next = updater(current);
      cropRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (selectedUrl) URL.revokeObjectURL(selectedUrl);
    };
  }, [selectedUrl]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (selectedUrl) URL.revokeObjectURL(selectedUrl);
    setSelectedUrl(URL.createObjectURL(file));
    const initialCrop = { scale: 1, offsetX: 0, offsetY: 0 };
    setCrop(initialCrop);
    cropRef.current = initialCrop;
    avatarPointersRef.current.clear();
    dragRef.current = undefined;
    pinchRef.current = undefined;
    touchDragRef.current = undefined;
    touchPinchRef.current = undefined;
    setError('');
  };

  const startCropGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selectedUrl) return;
    if (event.pointerType === 'touch') return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    avatarPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const activePointers = pointerEntries(avatarPointersRef.current);
    if (activePointers.length >= 2) {
      const gesture = pinchGesture(activePointers[0].point, activePointers[1].point);
      pinchRef.current = {
        distance: gesture.distance,
        centerX: gesture.centerX,
        centerY: gesture.centerY,
        scale: cropRef.current.scale,
        offsetX: cropRef.current.offsetX,
        offsetY: cropRef.current.offsetY
      };
      dragRef.current = undefined;
      return;
    }
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: cropRef.current.offsetX, offsetY: cropRef.current.offsetY };
  };

  const moveCropGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!avatarPointersRef.current.has(event.pointerId)) return;
    avatarPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const activePointers = pointerEntries(avatarPointersRef.current);
    if (activePointers.length >= 2 && pinchRef.current) {
      const gesture = pinchGesture(activePointers[0].point, activePointers[1].point);
      const pinch = pinchRef.current;
      updateCrop(() => ({
        scale: clamp(Number((pinch.scale * (gesture.distance / pinch.distance)).toFixed(2)), avatarScaleMin, avatarScaleMax),
        offsetX: clamp(pinch.offsetX + gesture.centerX - pinch.centerX, -96, 96),
        offsetY: clamp(pinch.offsetY + gesture.centerY - pinch.centerY, -96, 96)
      }));
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateCrop((prev) => ({
      ...prev,
      offsetX: clamp(drag.offsetX + event.clientX - drag.x, -96, 96),
      offsetY: clamp(drag.offsetY + event.clientY - drag.y, -96, 96)
    }));
  };

  const endCropGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    avatarPointersRef.current.delete(event.pointerId);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const activePointers = pointerEntries(avatarPointersRef.current);
    if (activePointers.length === 1) {
      const remaining = activePointers[0];
      dragRef.current = {
        pointerId: remaining.pointerId,
        x: remaining.point.x,
        y: remaining.point.y,
        offsetX: cropRef.current.offsetX,
        offsetY: cropRef.current.offsetY
      };
      pinchRef.current = undefined;
      return;
    }
    dragRef.current = undefined;
    pinchRef.current = undefined;
  };

  const zoomAvatar = (scale: number) => {
    updateCrop((prev) => ({
      ...prev,
      scale: clamp(scale, avatarScaleMin, avatarScaleMax)
    }));
  };

  const startCropTouch = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!selectedUrl || !event.touches.length) return;
    if (event.touches.length >= 2) {
      const gesture = pinchGesture(touchPoint(event.touches[0]), touchPoint(event.touches[1]));
      touchPinchRef.current = {
        distance: gesture.distance,
        centerX: gesture.centerX,
        centerY: gesture.centerY,
        scale: cropRef.current.scale,
        offsetX: cropRef.current.offsetX,
        offsetY: cropRef.current.offsetY
      };
      touchDragRef.current = undefined;
      return;
    }
    const point = touchPoint(event.touches[0]);
    touchDragRef.current = { x: point.x, y: point.y, offsetX: cropRef.current.offsetX, offsetY: cropRef.current.offsetY };
    touchPinchRef.current = undefined;
  };

  const moveCropTouch = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!selectedUrl || !event.touches.length) return;
    if (event.touches.length >= 2 && touchPinchRef.current) {
      const gesture = pinchGesture(touchPoint(event.touches[0]), touchPoint(event.touches[1]));
      const pinch = touchPinchRef.current;
      updateCrop(() => ({
        scale: clamp(Number((pinch.scale * (gesture.distance / pinch.distance)).toFixed(2)), avatarScaleMin, avatarScaleMax),
        offsetX: clamp(pinch.offsetX + gesture.centerX - pinch.centerX, -96, 96),
        offsetY: clamp(pinch.offsetY + gesture.centerY - pinch.centerY, -96, 96)
      }));
      return;
    }

    if (event.touches.length !== 1 || !touchDragRef.current) return;
    const point = touchPoint(event.touches[0]);
    const drag = touchDragRef.current;
    updateCrop((prev) => ({
      ...prev,
      offsetX: clamp(drag.offsetX + point.x - drag.x, -96, 96),
      offsetY: clamp(drag.offsetY + point.y - drag.y, -96, 96)
    }));
  };

  const endCropTouch = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) {
      const gesture = pinchGesture(touchPoint(event.touches[0]), touchPoint(event.touches[1]));
      touchPinchRef.current = {
        distance: gesture.distance,
        centerX: gesture.centerX,
        centerY: gesture.centerY,
        scale: cropRef.current.scale,
        offsetX: cropRef.current.offsetX,
        offsetY: cropRef.current.offsetY
      };
      touchDragRef.current = undefined;
      return;
    }
    if (event.touches.length === 1) {
      const point = touchPoint(event.touches[0]);
      touchDragRef.current = { x: point.x, y: point.y, offsetX: cropRef.current.offsetX, offsetY: cropRef.current.offsetY };
      touchPinchRef.current = undefined;
      return;
    }
    touchDragRef.current = undefined;
    touchPinchRef.current = undefined;
  };

  const wheelZoom = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!selectedUrl) return;
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    updateCrop((prev) => ({
      ...prev,
      scale: clamp(Number((prev.scale + delta).toFixed(2)), avatarScaleMin, avatarScaleMax)
    }));
  };

  const confirm = async () => {
    if (!selectedUrl) return;
    try {
      const avatarUrl = await renderCroppedAvatar(selectedUrl, crop);
      onSave(avatarUrl);
    } catch {
      setError(t('profile.avatarError'));
    }
  };

  return (
    <div className="sheet-backdrop avatar-dialog-backdrop">
      <section className="bottom-sheet avatar-dialog" role="dialog" aria-label={t('profile.avatarDialog')}>
        <SheetHeader title={selectedUrl ? t('profile.editAvatar') : t('profile.avatarDialog')} onClose={onClose} />
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFileChange} />
        {!selectedUrl ? (
          <div className="avatar-preview-panel">
            <div className="avatar-preview-large">
              <AvatarView profile={profile} />
            </div>
            <Button color="primary" onClick={() => inputRef.current?.click()}>
              <Camera size={16} /> {t('profile.chooseAvatar')}
            </Button>
          </div>
        ) : (
          <div className="avatar-editor">
            <div
              className="avatar-crop-frame"
              aria-label={t('profile.avatarCropArea')}
              data-testid="avatar-crop-frame"
              onPointerDown={startCropGesture}
              onPointerMove={moveCropGesture}
              onPointerUp={endCropGesture}
              onPointerCancel={endCropGesture}
              onTouchStart={startCropTouch}
              onTouchMove={moveCropTouch}
              onTouchEnd={endCropTouch}
              onTouchCancel={endCropTouch}
              onWheel={wheelZoom}
            >
              <img src={selectedUrl} alt={t('profile.editAvatar')} style={avatarTransformStyle(crop)} draggable={false} />
              <div className="avatar-crop-mask" />
            </div>
            <div className="avatar-editor-row">
              <label htmlFor="avatar-zoom">
                {t('profile.zoom')}
                <input id="avatar-zoom" type="range" min={avatarScaleMin} max={avatarScaleMax} step="0.05" value={crop.scale} onChange={(event) => zoomAvatar(Number(event.currentTarget.value))} />
              </label>
              <div className="avatar-live-preview">
                <img src={selectedUrl} alt={t('profile.preview')} style={avatarTransformStyle(crop, 0.38)} draggable={false} />
              </div>
            </div>
            {error ? <p className="avatar-error">{error}</p> : null}
            <div className="avatar-actions">
              <Button fill="outline" onClick={() => inputRef.current?.click()}>
                <Camera size={16} /> {t('profile.reselectAvatar')}
              </Button>
              <Button color="primary" loading={saving} onClick={confirm}>
                <Check size={16} /> {t('profile.useAvatar')}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function profileFromSession(userId: string, user?: LoginResult['user']): UserProfile {
  return {
    userId,
    nickname: user?.nickname ?? t('profile.defaultNickname'),
    avatarUrl: user?.avatarUrl,
    reminderCount: 1,
    favoriteCount: 0,
    followingCount: 0,
    footprintCount: 4
  };
}

function userRecordStatusItems(grouped: Record<MyAuctionTabKey, UserAuctionRecord[]>) {
  return [
    { key: 'all' as const, label: t('profile.allRecords'), count: grouped.all.length, icon: <ShoppingBag size={24} /> },
    { key: 'pendingBid' as const, label: t('profile.pendingBid'), count: grouped.pendingBid.length, icon: <Gavel size={24} /> },
    { key: 'pendingPay' as const, label: t('profile.pendingPay'), count: grouped.pendingPay.length, icon: <WalletCards size={24} /> },
    { key: 'pendingShipment' as const, label: t('profile.pendingShipment'), count: grouped.pendingShipment.length, icon: <Package size={24} /> },
    { key: 'pendingReceipt' as const, label: t('profile.pendingReceipt'), count: grouped.pendingReceipt.length, icon: <Trophy size={24} /> },
    { key: 'completed' as const, label: t('profile.completed'), count: grouped.completed.length, icon: <Check size={24} /> }
  ];
}

function recordStatusLabel(status: MyAuctionTabKey): string {
  const keys: Record<MyAuctionTabKey, MessageKey> = {
    all: 'profile.allRecords',
    pendingBid: 'profile.pendingBid',
    pendingPay: 'profile.pendingPay',
    pendingShipment: 'profile.pendingShipment',
    pendingReceipt: 'profile.pendingReceipt',
    completed: 'profile.completed'
  };
  return t(keys[status]);
}

function avatarTransformStyle(crop: AvatarCropState, ratio = 1) {
  return {
    transform: `translate(-50%, -50%) translate(${crop.offsetX * ratio}px, ${crop.offsetY * ratio}px) scale(${crop.scale})`
  };
}

async function renderCroppedAvatar(imageUrl: string, crop: AvatarCropState): Promise<string> {
  const image = await loadImage(imageUrl);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.clearRect(0, 0, size, size);
  context.save();
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  context.clip();
  const coverScale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * crop.scale;
  const width = image.naturalWidth * coverScale;
  const height = image.naturalHeight * coverScale;
  const offsetRatio = size / 260;
  context.drawImage(image, (size - width) / 2 + crop.offsetX * offsetRatio, (size - height) / 2 + crop.offsetY * offsetRatio, width, height);
  context.restore();
  return canvas.toDataURL('image/jpeg', 0.88);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = src;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loopIndex(current: number, length: number, step: number): number {
  if (length <= 0) return 0;
  return (current + step + length) % length;
}

function createLoopedFeedSlides(rooms: LiveRoom[]): Array<{ key: string; room: LiveRoom; realIndex: number }> {
  if (rooms.length <= 1) {
    return rooms.map((room, index) => ({ key: `room-${room.id}`, room, realIndex: index }));
  }
  const lastIndex = rooms.length - 1;
  return [
    { key: `loop-before-${rooms[lastIndex].id}`, room: rooms[lastIndex], realIndex: lastIndex },
    ...rooms.map((room, index) => ({ key: `room-${room.id}`, room, realIndex: index })),
    { key: `loop-after-${rooms[0].id}`, room: rooms[0], realIndex: 0 }
  ];
}

function pointerEntries(points: Map<number, PointerPoint>): Array<{ pointerId: number; point: PointerPoint }> {
  return Array.from(points.entries()).map(([pointerId, point]) => ({ pointerId, point }));
}

function pinchGesture(first: PointerPoint, second: PointerPoint) {
  const distance = Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1);
  return {
    distance,
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2
  };
}

function touchPoint(touch: { clientX: number; clientY: number }): PointerPoint {
  return { x: touch.clientX, y: touch.clientY };
}

function lotSortOptions() {
  return [
    { value: 'default', label: t('filter.default') },
    { value: 'auctionTime', label: t('filter.auctionTime') },
    { value: 'publishedAt', label: t('filter.publishedAt') },
    { value: 'priceAsc', label: t('filter.priceAsc') },
    { value: 'priceDesc', label: t('filter.priceDesc') }
  ];
}

function lotStatusOptions() {
  return [
    { value: 'all', label: t('status.all') },
    { value: 'running', label: t('status.running') },
    { value: 'ended', label: t('status.ended') },
    { value: 'failed', label: t('status.failed') },
    { value: 'upcoming', label: t('status.upcoming') }
  ];
}

function roomSortOptions() {
  return [
    { value: 'default', label: t('filter.default') },
    { value: 'lotCount', label: t('filter.lotCount') },
    { value: 'gmv', label: t('filter.gmv') },
    { value: 'watchers', label: t('filter.watchers') }
  ];
}

function roomStatusOptions() {
  return [
    { value: 'all', label: t('status.all') },
    { value: 'ended', label: t('status.liveEnded') },
    { value: 'live', label: t('status.liveRunning') },
    { value: 'upcoming', label: t('status.liveUpcoming') }
  ];
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(activeLocale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(activeLocale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

type QuickBidFeedback =
  | { status: 'idle' }
  | { status: 'submitting'; requestId: string; message: string }
  | { status: 'success'; requestId?: string; message: string }
  | { status: 'error'; requestId?: string; message: string };

const LIVE_SHEET_DURATIONS_MS = {
  lotList: 340,
  detail: 400,
  quickBid: 460
} as const;

const AUCTION_ENDED_HOLD_MS = 5000;
const AUCTION_CARD_ANIMATION_MS = 380;

type LiveSheetVariant = keyof typeof LIVE_SHEET_DURATIONS_MS;
type LiveSheetType = 'lotList' | 'detail' | 'quickBid';
type LiveSheetPhase = 'opening' | 'open' | 'closing';

type LiveSheetInstance = {
  id: string;
  type: LiveSheetType;
  variant: LiveSheetVariant;
  phase: LiveSheetPhase;
  lotId?: string;
};

type FloatingAuctionCardPhase = 'entering' | 'visible' | 'holding' | 'leaving';
type FloatingAuctionCardMode = 'running' | 'ended';

type FloatingAuctionCardState = {
  auctionId: string;
  lot: LiveRoomLot;
  state: AuctionState;
  ranking: RankingItem[];
  enrolled: boolean;
  mode: FloatingAuctionCardMode;
  phase: FloatingAuctionCardPhase;
  startedByRuntimeEvent?: boolean;
  retireAtMs?: number;
};

function isSameFloatingAuctionCardSnapshot(current: FloatingAuctionCardState, next: FloatingAuctionCardState): boolean {
  return (
    current.auctionId === next.auctionId &&
    current.mode === next.mode &&
    current.lot.id === next.lot.id &&
    current.enrolled === next.enrolled &&
    current.ranking === next.ranking &&
    current.retireAtMs === next.retireAtMs &&
    current.state.status === next.state.status &&
    current.state.currentPrice === next.state.currentPrice &&
    current.state.leaderBidderId === next.state.leaderBidderId &&
    current.state.endTsMs === next.state.endTsMs
  );
}

type RankingBidHint = {
  auctionId: string;
  bidderId: string;
  price: number;
  bidTsMs: number;
};

type RankingAnimationKind = 'top-slot-to-first' | 'divider-to-first' | 'current-row-to-first' | 'price-only';
type RankingAnimationOrigin = 'top-slot' | 'divider' | 'current-row' | 'price';

type RankingAnimation = {
  id: string;
  kind: RankingAnimationKind;
  origin: RankingAnimationOrigin;
  bidderId: string;
  fromRank?: number;
  toRank: 1;
  isSelfBid: boolean;
  durationMs: number;
  movingItem: RankingItem;
  exitItem?: RankingItem;
  shiftedIds: string[];
  enteringIds: string[];
  exitingIds: string[];
  priceUpdateIds: string[];
};

type RankingAnimationLayout = {
  id: string;
  fromY: number;
  toY: number;
  exitFromY: number;
  exitToY: number;
};

function LiveRoomPage({
  apiClient,
  roomId,
  initialLotId,
  userId,
  onBack,
  onPay
}: {
  apiClient: ApiClient;
  roomId: string;
  initialLotId?: string;
  userId: string;
  onBack: () => void;
  onPay: (orderId: string, auctionId: string) => void;
}) {
  const [selectedLotId, setSelectedLotId] = useState<string | undefined>(initialLotId);
  const [liveSheets, setLiveSheets] = useState<LiveSheetInstance[]>([]);
  const [floatingAuctionCard, setFloatingAuctionCard] = useState<FloatingAuctionCardState | undefined>();
  const [hiddenAuctionCardId, setHiddenAuctionCardId] = useState<string | undefined>();
  const [runtimeStartedAuctionId, setRuntimeStartedAuctionId] = useState<string | undefined>();
  const [lastBidAtByAuction, setLastBidAtByAuction] = useState<Record<string, number>>({});
  const [quickBidFeedback, setQuickBidFeedback] = useState<QuickBidFeedback>({ status: 'idle' });
  const [rankingCollapsed, setRankingCollapsed] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [commentDraft, setCommentDraft] = useState('');
  const [chatMessages, setChatMessages] = useState<LiveChatMessage[]>(() => initialLiveChatMessages(roomId));
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [enrolledAuctions, setEnrolledAuctions] = useState<Set<string>>(() => new Set());
  const [lotStates, setLotStates] = useState<Record<string, AuctionState>>({});
  const [liveStats, setLiveStats] = useState<LiveRoomStats>(demoLiveRoomStats);
  const [now, setNow] = useState(Date.now());
  const realtimeRef = useRef<RealtimeClient>();
  const lastSeqRef = useRef(0);
  const lastRankingBidRef = useRef<RankingBidHint>();
  const sheetTimersRef = useRef<number[]>([]);
  const liveSheetsRef = useRef<LiveSheetInstance[]>([]);
  const floatingAuctionCardRef = useRef<FloatingAuctionCardState>();
  const pendingFloatingAuctionCardRef = useRef<FloatingAuctionCardState>();
  const commentsViewportRef = useRef<HTMLDivElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const commentsShouldStickRef = useRef(true);
  const followedRooms = useLiveActivityStore((state) => state.followedRooms);
  const followRoom = useLiveActivityStore((state) => state.followRoom);
  const unfollowRoom = useLiveActivityStore((state) => state.unfollowRoom);
  const recordFootprint = useLiveActivityStore((state) => state.recordFootprint);

  const roomQuery = useQuery({
    queryKey: ['live-room', roomId],
    queryFn: () => apiClient.getLiveRoom(roomId),
    placeholderData: findDemoLiveRoom(roomId)
  });
  const lotsQuery = useQuery({
    queryKey: ['live-room-lots', roomId],
    queryFn: () => apiClient.listLiveRoomLots(roomId),
    placeholderData: demoLotPage
  });
  const statsQuery = useQuery({
    queryKey: ['live-room-stats', roomId],
    queryFn: () => apiClient.getLiveRoomStats(roomId),
    placeholderData: demoLiveRoomStats
  });

  const room = roomQuery.data ?? findDemoLiveRoom(roomId);
  const lots = lotsQuery.data?.items.length ? lotsQuery.data.items : demoLotPage.items;
  const activeLot = selectCurrentRunningLot(room, lots, lotStates);
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) ?? activeLot ?? lots[0];
  const isFollowingRoom = followedRooms.some((item) => item.roomId === room.id);
  const activeLotInitialState = useMemo(() => (activeLot ? stateFromLot(activeLot) : undefined), [activeLot]);

  const stateQuery = useQuery({
    queryKey: ['auction-state', activeLot?.auctionId],
    queryFn: () => {
      if (!activeLot) throw new Error('No active auction');
      return apiClient.getAuctionState(activeLot.auctionId);
    },
    enabled: Boolean(activeLot),
    placeholderData: activeLotInitialState
  });

  useEffect(() => {
    if (statsQuery.data) setLiveStats(statsQuery.data);
  }, [statsQuery.data]);

  useEffect(() => {
    recordFootprint(room);
  }, [recordFootprint, room]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setChatMessages(initialLiveChatMessages(roomId));
    commentsShouldStickRef.current = true;
  }, [roomId]);

  const currentState = activeLot ? lotStates[activeLot.auctionId] ?? stateQuery.data ?? activeLotInitialState : undefined;
  const hasBlockingLiveSheet = liveSheets.some((sheet) => sheet.phase !== 'closing');
  const liveSheetOpen = hasBlockingLiveSheet;
  const stateForLot = useCallback(
    (lot: LiveRoomLot) => lotStates[lot.auctionId] ?? (lot.auctionId === activeLot?.auctionId ? currentState : stateFromLot(lot)),
    [activeLot?.auctionId, currentState, lotStates]
  );

  useEffect(() => {
    liveSheetsRef.current = liveSheets;
  }, [liveSheets]);

  useEffect(() => {
    floatingAuctionCardRef.current = floatingAuctionCard;
  }, [floatingAuctionCard]);

  const scheduleSheetOpen = useCallback((id: string) => {
    const timer = window.setTimeout(() => {
      setLiveSheets((prev) => prev.map((sheet) => (sheet.id === id && sheet.phase === 'opening' ? { ...sheet, phase: 'open' } : sheet)));
    }, 20);
    sheetTimersRef.current.push(timer);
  }, []);

  const scheduleSheetRemoval = useCallback((id: string, durationMs: number) => {
    const timer = window.setTimeout(() => {
      setLiveSheets((prev) => prev.filter((sheet) => sheet.id !== id));
    }, durationMs);
    sheetTimersRef.current.push(timer);
  }, []);

  const closeLiveSheet = useCallback(
    (id: string) => {
      const sheet = liveSheetsRef.current.find((item) => item.id === id);
      if (!sheet || sheet.phase === 'closing') return;
      setLiveSheets((prev) => prev.map((item) => (item.id === id ? { ...item, phase: 'closing' } : item)));
      scheduleSheetRemoval(id, LIVE_SHEET_DURATIONS_MS[sheet.variant]);
    },
    [scheduleSheetRemoval]
  );

  const closeActiveLiveSheets = useCallback(() => {
    const closingSheets = liveSheetsRef.current.filter((sheet) => sheet.phase !== 'closing');
    if (!closingSheets.length) return;
    setLiveSheets((prev) => prev.map((sheet) => (sheet.phase === 'closing' ? sheet : { ...sheet, phase: 'closing' })));
    closingSheets.forEach((sheet) => scheduleSheetRemoval(sheet.id, LIVE_SHEET_DURATIONS_MS[sheet.variant]));
  }, [scheduleSheetRemoval]);

  const openLiveSheet = useCallback(
    (type: LiveSheetType, lotId?: string, options: { closeExisting?: boolean } = {}) => {
      if (options.closeExisting ?? true) closeActiveLiveSheets();
      const variantByType: Record<LiveSheetType, LiveSheetVariant> = {
        lotList: 'lotList',
        detail: 'detail',
        quickBid: 'quickBid'
      };
      const id = makeRequestId(`sheet-${type}`);
      setLiveSheets((prev) => [...prev, { id, type, lotId, variant: variantByType[type], phase: 'opening' }]);
      scheduleSheetOpen(id);
    },
    [closeActiveLiveSheets, scheduleSheetOpen]
  );

  useEffect(() => {
    return () => {
      sheetTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      sheetTimersRef.current = [];
    };
  }, []);

  const requestFloatingAuctionCard = useCallback((nextCard: FloatingAuctionCardState) => {
    setFloatingAuctionCard((current) => {
      if (!current) return nextCard;
      if (current.auctionId === nextCard.auctionId && current.mode === nextCard.mode && current.phase !== 'leaving') {
        const merged = { ...nextCard, phase: current.phase };
        return isSameFloatingAuctionCardSnapshot(current, merged) ? current : merged;
      }
      pendingFloatingAuctionCardRef.current = nextCard;
      return current.phase === 'leaving' ? current : { ...current, phase: 'leaving' };
    });
  }, []);

  const dismissFloatingAuctionCard = useCallback((auctionId: string) => {
    setHiddenAuctionCardId(auctionId);
    pendingFloatingAuctionCardRef.current = undefined;
    setFloatingAuctionCard((current) => (current?.auctionId === auctionId && current.phase !== 'leaving' ? { ...current, phase: 'leaving' } : current));
  }, []);

  useEffect(() => {
    if (!floatingAuctionCard) return undefined;
    if (floatingAuctionCard.phase === 'entering') {
      const timer = window.setTimeout(() => {
        setFloatingAuctionCard((current) => (current?.auctionId === floatingAuctionCard.auctionId && current.phase === 'entering' ? { ...current, phase: 'visible' } : current));
      }, AUCTION_CARD_ANIMATION_MS);
      return () => window.clearTimeout(timer);
    }
    if (floatingAuctionCard.phase === 'holding') {
      const timer = window.setTimeout(() => {
        setFloatingAuctionCard((current) => (current?.auctionId === floatingAuctionCard.auctionId && current.phase === 'holding' ? { ...current, phase: 'leaving' } : current));
      }, Math.max(0, (floatingAuctionCard.retireAtMs ?? Date.now()) - Date.now()));
      return () => window.clearTimeout(timer);
    }
    if (floatingAuctionCard.phase === 'leaving') {
      const timer = window.setTimeout(() => {
        setFloatingAuctionCard((current) => {
          if (current?.auctionId !== floatingAuctionCard.auctionId || current.phase !== 'leaving') return current;
          const pending = pendingFloatingAuctionCardRef.current;
          pendingFloatingAuctionCardRef.current = undefined;
          return pending;
        });
      }, AUCTION_CARD_ANIMATION_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [floatingAuctionCard]);

  useEffect(() => {
    if (liveSheetOpen) {
      pendingFloatingAuctionCardRef.current = undefined;
      setFloatingAuctionCard((current) => (current?.phase === 'leaving' ? current : undefined));
      return;
    }
    if (!activeLot || !currentState || hiddenAuctionCardId === activeLot.auctionId) {
      setFloatingAuctionCard((current) => (current?.mode === 'running' && current.phase !== 'leaving' ? { ...current, phase: 'leaving' } : current));
      return;
    }
    requestFloatingAuctionCard({
      auctionId: activeLot.auctionId,
      lot: activeLot,
      state: currentState,
      ranking,
      enrolled: enrolledAuctions.has(activeLot.auctionId),
      mode: 'running',
      phase: activeLot.auctionId === runtimeStartedAuctionId ? 'entering' : 'visible',
      startedByRuntimeEvent: activeLot.auctionId === runtimeStartedAuctionId
    });
  }, [activeLot, currentState, enrolledAuctions, hiddenAuctionCardId, liveSheetOpen, ranking, requestFloatingAuctionCard, runtimeStartedAuctionId]);

  useEffect(() => {
    if (!initialLotId) return;
    setSelectedLotId(initialLotId);
    openLiveSheet('detail', initialLotId);
  }, [initialLotId, openLiveSheet]);

  const latestContext = useRef({
    activeLot,
    currentState,
    room,
    lots,
    liveStats,
    hasBlockingLiveSheet,
    ranking,
    enrolledAuctions
  });
  latestContext.current = {
    activeLot,
    currentState,
    room,
    lots,
    liveStats,
    hasBlockingLiveSheet,
    ranking,
    enrolledAuctions
  };
  const refetchAuctionStateRef = useRef(stateQuery.refetch);
  refetchAuctionStateRef.current = stateQuery.refetch;

  const appendChatMessage = useCallback((message: LiveChatMessage) => {
    setChatMessages((prev) => upsertChatMessage(prev, message).slice(-80));
  }, []);

  const pushNotice = useCallback(
    (content: string) => {
      appendChatMessage(createSystemChatMessage(roomId, content));
    },
    [appendChatMessage, roomId]
  );

  const acknowledgeChatMessage = useCallback((payload: Record<string, unknown>) => {
    const clientMessageId = String(payload.clientMessageId ?? '');
    if (!clientMessageId) return;
    setChatMessages((prev) =>
      prev.map((message) =>
        message.clientMessageId === clientMessageId
          ? {
              ...message,
              id: String(payload.messageId ?? message.id),
              createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : message.createdAt,
              pending: false,
              failed: false
            }
          : message
      )
    );
  }, []);

  const failChatMessage = useCallback((payload: Record<string, unknown>) => {
    const clientMessageId = String(payload.clientMessageId ?? '');
    if (!clientMessageId) return;
    setChatMessages((prev) => prev.map((message) => (message.clientMessageId === clientMessageId ? { ...message, pending: false, failed: true } : message)));
  }, []);

  const handleBidAck = useCallback((requestId: string | undefined, payload: Record<string, unknown>) => {
    if (payload.accepted === false) {
      setQuickBidFeedback((prev) => (prev.status === 'submitting' && (!requestId || prev.requestId === requestId) ? { status: 'error', requestId, message: formatBidRejectedMessage(payload) } : prev));
      return;
    }
    setQuickBidFeedback((prev) => (prev.status === 'submitting' && (!requestId || prev.requestId === requestId) ? { ...prev, message: t('auction.bidSubmitted') } : prev));
  }, []);

  const handleBidAcceptedFeedback = useCallback(
    (requestId: string | undefined, payload: Record<string, unknown>) => {
      const bidderId = String(payload.bidderId ?? payload.leaderBidderId ?? '');
      setQuickBidFeedback((prev) => {
        if (prev.status === 'submitting' && (!requestId || prev.requestId === requestId)) {
          return { status: 'success', requestId, message: t('auction.bidAccepted') };
        }
        if (bidderId === userId) {
          return { status: 'success', requestId, message: t('auction.bidAccepted') };
        }
        return prev;
      });
    },
    [userId]
  );

  const handleBidRejectedFeedback = useCallback((requestId: string | undefined, payload: Record<string, unknown>) => {
    setQuickBidFeedback((prev) => (prev.status === 'submitting' && (!requestId || prev.requestId === requestId) ? { status: 'error', requestId, message: formatBidRejectedMessage(payload) } : prev));
  }, []);

  const sendComment = useCallback(() => {
    const content = commentDraft.trim();
    if (!content) return;
    const clientMessageId = makeRequestId('chat');
    const message: LiveChatMessage = {
      id: clientMessageId,
      roomId,
      userId,
      nickname: t('live.commentMe'),
      content,
      clientMessageId,
      createdAt: new Date().toISOString(),
      pending: true
    };
    appendChatMessage(message);
    setCommentDraft('');
    realtimeRef.current?.send({
      type: 'chat.send',
      requestId: clientMessageId,
      payload: {
        roomId,
        content,
        clientMessageId
      }
    });
  }, [appendChatMessage, commentDraft, roomId, userId]);

  const handleCommentKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendComment();
  };

  const handleCommentScroll = () => {
    const viewport = commentsViewportRef.current;
    if (!viewport) return;
    commentsShouldStickRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
  };

  useEffect(() => {
    if (!commentsOpen || !commentsShouldStickRef.current) return;
    commentsEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [chatMessages, commentsOpen]);

  useEffect(() => {
    const context = latestContext.current;
    const hasActiveAuction = Boolean(context.activeLot && context.currentState);
    const minIncrement = Number(context.activeLot?.ruleSnapshot?.minIncrement ?? 100);
    const client: RealtimeClient | undefined =
      import.meta.env.VITE_REALTIME_MODE === 'websocket' && import.meta.env.VITE_WS_URL
        ? new NativeWebSocketClient({ baseUrl: import.meta.env.VITE_WS_URL, roomId, lastSeq: lastSeqRef.current })
        : hasActiveAuction && context.activeLot && context.currentState
          ? new MockRealtimeClient({
              roomId,
              auctionId: context.activeLot.auctionId,
              liveSessionId: context.room.liveSessionId,
              currentPrice: context.currentState.currentPrice,
              minIncrement,
              endTsMs: context.currentState.endTsMs,
              userId,
              participantCount: context.currentState.participantCount ?? context.activeLot.participantCount,
              onlineCount: context.liveStats.onlineCount,
              ceilingPrice: context.activeLot.ruleSnapshot?.ceilingPrice
            })
          : undefined;
    realtimeRef.current = client;
    const handleMessage = (message: RealtimeMessage) => {
      if (!isFreshRealtimeMessage(message, lastSeqRef.current)) return;
      lastSeqRef.current = nextRealtimeSeq(message, lastSeqRef.current);
      if (message.type === 'bid.accepted') {
        const payload = message.payload as Record<string, unknown>;
        const auctionId = String(payload.auctionId ?? latestContext.current.activeLot?.auctionId ?? '');
        const bidderId = String(payload.bidderId ?? payload.leaderBidderId ?? '');
        if (auctionId && bidderId) {
          lastRankingBidRef.current = {
            auctionId,
            bidderId,
            price: Number(payload.currentPrice ?? payload.price ?? 0),
            bidTsMs: Number(payload.bidTsMs ?? Date.now())
          };
        }
      }
      if (message.type === 'auction.started') {
        const payload = message.payload as Record<string, unknown>;
        const auctionId = String(payload.auctionId ?? '');
        if (auctionId) {
          const context = latestContext.current;
          const startedLot = context.lots.find((lot) => lot.auctionId === auctionId);
          const previousState = startedLot ? context.currentState && context.activeLot?.auctionId === auctionId ? context.currentState : stateFromLot(startedLot) : undefined;
          const baseStartedState = previousState ?? fallbackAuctionState(auctionId);
          const startedState = {
            ...baseStartedState,
            auctionId,
            status: 'RUNNING' as const,
            currentPrice: Number(payload.currentPrice ?? baseStartedState.currentPrice ?? 0),
            leaderBidderId: payload.leaderBidderId === undefined ? baseStartedState.leaderBidderId : String(payload.leaderBidderId),
            endTsMs: parseRealtimeTimestampMs(payload.endTsMs ?? payload.endTime, baseStartedState.endTsMs ?? Date.now()),
            serverTsMs: Date.now(),
            bidCount: payload.bidCount === undefined ? baseStartedState.bidCount : Number(payload.bidCount),
            participantCount: payload.participantCount === undefined ? baseStartedState.participantCount : Number(payload.participantCount)
          };
          setHiddenAuctionCardId(undefined);
          setRuntimeStartedAuctionId(auctionId);
          setLotStates((prev) => {
            const next = { ...prev };
            context.lots.forEach((lot) => {
              if (lot.auctionId === auctionId) return;
              const previous = next[lot.auctionId] ?? stateFromLot(lot);
              if (previous.status !== 'RUNNING' && previous.status !== 'EXTENDED') return;
              next[lot.auctionId] = {
                ...previous,
                status: 'CLOSED_FAILED',
                endTsMs: Date.now(),
                serverTsMs: Date.now()
              };
            });
            next[auctionId] = startedState;
            return next;
          });
          if (startedLot && !context.hasBlockingLiveSheet) {
            requestFloatingAuctionCard({
              auctionId,
              lot: startedLot,
              state: startedState,
              ranking: context.ranking,
              enrolled: context.enrolledAuctions.has(auctionId),
              mode: 'running',
              phase: 'entering',
              startedByRuntimeEvent: true
            });
          }
          return;
        }
      }
      if (message.type === 'auction.closed') {
        const payload = message.payload as Record<string, unknown>;
        const context = latestContext.current;
        const closingAuctionId = String(payload.auctionId ?? context.activeLot?.auctionId ?? '');
        const visibleCard = floatingAuctionCardRef.current;
        if (
          context.activeLot &&
          context.currentState &&
          visibleCard?.auctionId === closingAuctionId &&
          visibleCard.mode === 'running' &&
          visibleCard.phase !== 'leaving' &&
          !context.hasBlockingLiveSheet &&
          context.activeLot.auctionId === closingAuctionId
        ) {
          const closedAtMs = Number(payload.closedTsMs ?? Date.now());
          pendingFloatingAuctionCardRef.current = undefined;
          setFloatingAuctionCard({
            auctionId: closingAuctionId,
            lot: context.activeLot,
            state: {
              ...context.currentState,
              auctionId: closingAuctionId,
              status: String(payload.status ?? 'CLOSED_WON') as AuctionState['status'],
              currentPrice: Number(payload.finalPrice ?? context.currentState.currentPrice ?? 0),
              leaderBidderId: payload.winnerBidderId === undefined ? context.currentState.leaderBidderId : String(payload.winnerBidderId),
              endTsMs: closedAtMs,
              serverTsMs: Date.now()
            },
            ranking: context.ranking,
            enrolled: context.enrolledAuctions.has(closingAuctionId),
            mode: 'ended',
            phase: 'holding',
            retireAtMs: closedAtMs + AUCTION_ENDED_HOLD_MS
          });
        }
      }
      handleRealtimeMessage(message, {
        activeAuctionId: latestContext.current.activeLot?.auctionId,
        userId,
        setLiveStats,
        setLotStates,
        setNotice: pushNotice,
        setRanking,
        onChatAck: acknowledgeChatMessage,
        onChatMessage: appendChatMessage,
        onChatError: failChatMessage,
        onBidAck: handleBidAck,
        onBidAccepted: handleBidAcceptedFeedback,
        onBidRejected: handleBidRejectedFeedback,
        onSnapshotRequired: () => {
          void refetchAuctionStateRef.current();
        }
      });
    };
    const controlClient =
      import.meta.env.VITE_REALTIME_MODE !== 'websocket' && import.meta.env.VITE_MOCK_CONTROL_URL
        ? new MockRealtimeControlClient({ url: import.meta.env.VITE_MOCK_CONTROL_URL, roomId })
        : undefined;
    if (!client && !controlClient) return undefined;
    const unsubscribe = client?.onMessage(handleMessage);
    const unsubscribeControl = controlClient?.onMessage(handleMessage);
    client?.connect();
    controlClient?.connect();
    client?.send({ type: 'room.subscribe', requestId: makeRequestId('room'), payload: { auctionId: context.activeLot?.auctionId } });
    return () => {
      unsubscribe?.();
      unsubscribeControl?.();
      controlClient?.disconnect();
      client?.disconnect();
    };
  }, [acknowledgeChatMessage, activeLot?.auctionId, appendChatMessage, failChatMessage, handleBidAcceptedFeedback, handleBidAck, handleBidRejectedFeedback, pushNotice, requestFloatingAuctionCard, roomId, userId]);

  const enrollMutation = useMutation({
    mutationFn: (auctionId: string) => apiClient.enrollAuction(auctionId),
    onSuccess: (result: EnrollResult) => {
      setEnrolledAuctions((prev) => new Set(prev).add(result.auctionId));
      pushNotice(t('auction.enrolled'));
    }
  });

  const submitBid = (lot: LiveRoomLot, state: AuctionState, price: number) => {
    const rule = bidRuleFromLot(lot, state);
    const validation = validateBidPrice(price, rule);
    if (!validation.valid) {
      setQuickBidFeedback({ status: 'error', message: formatBidValidationNotice(validation) });
      return;
    }
    const requestId = makeRequestId('bid');
    setLastBidAtByAuction((prev) => ({ ...prev, [lot.auctionId]: Date.now() }));
    setQuickBidFeedback({ status: 'submitting', requestId, message: t('auction.bidSubmitted') });
    realtimeRef.current?.send({
      type: 'bid.place',
      requestId,
      payload: buildBidPlacePayload({
        auctionId: lot.auctionId,
        price: validation.price,
        requestId
      })
    });
  };

  const openLot = (lot: LiveRoomLot) => {
    setSelectedLotId(lot.id);
    openLiveSheet('detail', lot.id);
  };

  const openQuickBid = (lot: LiveRoomLot) => {
    setSelectedLotId(lot.id);
    setQuickBidFeedback({ status: 'idle' });
    openLiveSheet('quickBid', lot.id);
  };

  const toggleFollowRoom = () => {
    if (isFollowingRoom) {
      unfollowRoom(room.id);
      return;
    }
    followRoom(room);
  };

  if (room.status === 'ENDED') {
    return <RoomStatePage room={room} lots={lots} status="ended" onBack={onBack} onPay={(auctionId) => onPay('ord_2001', auctionId)} />;
  }

  if (room.status === 'UPCOMING') {
    return <RoomStatePage room={room} lots={lots} status="upcoming" onBack={onBack} />;
  }

  return (
    <section className="live-page">
      <LiveRoomVideoSurface room={room} />
      <div className="live-gradient" />
      <header className="live-header">
        <button className="live-back" onClick={onBack} aria-label={t('common.back')} type="button">
          <ArrowLeft size={20} />
        </button>
        <div className="live-shop">
          <img src={logoUrl} alt={room.merchantName} />
          <div>
            <strong>{room.merchantName}</strong>
            <span>
              <Star size={12} /> {t('live.shopScore')} 4.9
            </span>
          </div>
        </div>
        <Button size="mini" color={isFollowingRoom ? 'default' : 'primary'} onClick={toggleFollowRoom} aria-pressed={isFollowingRoom}>
          {isFollowingRoom ? t('live.followed') : t('live.follow')}
        </Button>
      </header>

      <aside className="live-side-rail">
        <span className="live-watcher-count">
          <Users size={14} /> {liveStats.watcherCount}
        </span>
      </aside>

      {activeLot && currentState ? <LiveRankingRail items={ranking} userId={userId} collapsed={rankingCollapsed} lastBid={lastRankingBidRef.current} onToggle={() => setRankingCollapsed((value) => !value)} /> : null}

      <LiveCommentPanel
        open={commentsOpen}
        messages={chatMessages}
        userId={userId}
        draft={commentDraft}
        commentsViewportRef={commentsViewportRef}
        commentsEndRef={commentsEndRef}
        onDraftChange={setCommentDraft}
        onKeyDown={handleCommentKeyDown}
        onScroll={handleCommentScroll}
        onSend={sendComment}
        onToggle={() => setCommentsOpen((value) => !value)}
        onOpenList={() => openLiveSheet('lotList')}
      />

      {floatingAuctionCard && !liveSheetOpen ? (
        <AuctionFloatingCard
          lot={floatingAuctionCard.lot}
          state={floatingAuctionCard.state}
          ranking={floatingAuctionCard.ranking}
          enrolled={floatingAuctionCard.enrolled}
          phase={floatingAuctionCard.phase}
          onOpenLot={() => openLot(floatingAuctionCard.lot)}
          onQuickBid={() => openQuickBid(floatingAuctionCard.lot)}
          onDismiss={() => dismissFloatingAuctionCard(floatingAuctionCard.auctionId)}
          remainMs={floatingAuctionCard.mode === 'ended' ? 0 : msUntil(floatingAuctionCard.state.endTsMs, now)}
          ended={floatingAuctionCard.mode === 'ended'}
        />
      ) : null}

      {liveSheets.map((sheet, index) => {
        const zIndex = 80 + index;
        const accessibilityHidden = sheet.phase === 'closing' && liveSheets.some((otherSheet, otherIndex) => otherIndex > index && otherSheet.phase !== 'closing');
        if (sheet.type === 'lotList') {
          return (
            <LotListSheet
              key={sheet.id}
              phase={sheet.phase}
              zIndex={zIndex}
              accessibilityHidden={accessibilityHidden}
              lots={lots}
              states={lotStates}
              activeAuctionId={activeLot?.auctionId}
              onClose={() => closeLiveSheet(sheet.id)}
              onOpenLot={openLot}
            />
          );
        }

        const sheetLot = sheet.lotId ? lots.find((lot) => lot.id === sheet.lotId) : selectedLot;
        if (!sheetLot) return null;
        const sheetState = stateForLot(sheetLot);
        if (!sheetState) return null;

        if (sheet.type === 'detail') {
          return (
            <LotDetailSheet
              key={sheet.id}
              phase={sheet.phase}
              zIndex={zIndex}
              accessibilityHidden={accessibilityHidden}
              lot={sheetLot}
              state={sheetState}
              ranking={ranking}
              enrolled={enrolledAuctions.has(sheetLot.auctionId)}
              enrolling={enrollMutation.isPending}
              onClose={() => closeLiveSheet(sheet.id)}
              onEnroll={() => enrollMutation.mutate(sheetLot.auctionId)}
              onBid={() => openQuickBid(sheetLot)}
              onPay={() => onPay('ord_2001', sheetLot.auctionId)}
            />
          );
        }

        return (
          <BidSheet
            key={sheet.id}
            phase={sheet.phase}
            zIndex={zIndex}
            accessibilityHidden={accessibilityHidden}
            lot={sheetLot}
            state={sheetState}
            ranking={ranking}
            feedback={quickBidFeedback}
            lastBidAtMs={lastBidAtByAuction[sheetLot.auctionId]}
            nowMs={now}
            userId={userId}
            onClose={() => closeLiveSheet(sheet.id)}
            onSubmit={(price) => submitBid(sheetLot, sheetState, price)}
          />
        );
      })}
    </section>
  );
}

function LiveRoomVideoSurface({ room }: { room: LiveRoom }) {
  if (room.videoSource === 'recorded' && room.videoUrl) {
    return <video className="live-video" data-testid="live-room-video" src={room.videoUrl} poster={room.coverUrl} muted autoPlay loop playsInline />;
  }

  if (room.videoSource === 'digitalHuman' && room.digitalHuman) {
    return (
      <DigitalHumanLiveStage
        idleVideoUrl={room.digitalHuman.idleVideoUrl}
        talkVideoUrl={room.digitalHuman.speakingVideoUrl}
      />
    );
  }

  return (
    <div className="live-video-config-error" data-testid="live-video-config-error">
      <VideoOffIcon />
      <span>{t('live.videoConfigMissing')}</span>
    </div>
  );
}

function VideoOffIcon() {
  return <VideoOff size={28} />;
}

function LiveCommentPanel({
  open,
  messages,
  userId,
  draft,
  commentsViewportRef,
  commentsEndRef,
  onDraftChange,
  onKeyDown,
  onScroll,
  onSend,
  onToggle,
  onOpenList
}: {
  open: boolean;
  messages: LiveChatMessage[];
  userId: string;
  draft: string;
  commentsViewportRef: RefObject<HTMLDivElement>;
  commentsEndRef: RefObject<HTMLDivElement>;
  onDraftChange: (value: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onScroll: () => void;
  onSend: () => void;
  onToggle: () => void;
  onOpenList: () => void;
}) {
  return (
    <section className={open ? 'live-comment-panel' : 'live-comment-panel is-collapsed'} aria-label={t('live.commentPanel')}>
      {open ? (
        <>
          <div className="live-comment-list" ref={commentsViewportRef} onScroll={onScroll} aria-label={t('live.commentList')}>
            {messages.map((message) => (
              <div className={message.system ? 'live-comment-item is-system' : 'live-comment-item'} key={`${message.id}-${message.clientMessageId ?? ''}`}>
                <strong>{message.system ? t('live.commentSystem') : message.userId === userId ? t('live.commentMe') : message.nickname}</strong>
                <span>{message.content}</span>
                {message.pending ? <small>{t('live.commentSending')}</small> : null}
                {message.failed ? <small>{t('live.commentFailed')}</small> : null}
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        </>
      ) : null}
      <div className={open ? 'live-comment-input-row' : 'live-comment-input-row is-collapsed'}>
        <button className={open ? 'comment-toggle-button' : 'comment-toggle-button is-floating'} type="button" onClick={onToggle} aria-label={open ? t('live.commentHide') : t('live.commentShow')}>
          <img src={open ? closeCommentIconUrl : commentIconUrl} alt="" aria-hidden="true" />
        </button>
        {open ? (
          <>
            <input
              aria-label={t('live.commentInput')}
              placeholder={t('live.commentPlaceholder')}
              value={draft}
              maxLength={120}
              onChange={(event) => onDraftChange(event.currentTarget.value)}
              onKeyDown={onKeyDown}
            />
            <button className="comment-send-button" type="button" onClick={onSend} disabled={!draft.trim()} aria-label={t('live.commentSend')}>
              {t('live.commentSend')}
            </button>
          </>
        ) : null}
        <button className="comment-list-button" type="button" onClick={onOpenList} aria-label={t('live.goodsEntry')}>
          <ShoppingBag size={16} />
          <span>{t('live.goodsEntry')}</span>
        </button>
      </div>
    </section>
  );
}

function LiveRankingRail({
  items,
  userId,
  collapsed,
  lastBid,
  onToggle
}: {
  items: RankingItem[];
  userId: string;
  collapsed: boolean;
  lastBid?: RankingBidHint;
  onToggle: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const rankRowRefs = useRef(new Map<number, HTMLDivElement>());
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLDivElement | null>(null);
  const previousItemsRef = useRef<RankingItem[]>([]);
  const animationTimerRef = useRef<number>();
  const pinnedCurrentUserTimerRef = useRef<number>();
  const [animation, setAnimation] = useState<RankingAnimation>();
  const [animationLayout, setAnimationLayout] = useState<RankingAnimationLayout>();
  const [pinnedCurrentUser, setPinnedCurrentUser] = useState<{ active: boolean; item?: RankingItem }>();
  const slots = useMemo(() => buildRankingSlots(items), [items]);
  const currentUserItem = useMemo(() => items.find((item) => item.bidderId === userId), [items, userId]);
  const currentUserRowItem = pinnedCurrentUser?.active ? pinnedCurrentUser.item : currentUserItem;
  const setRankRowRef = useCallback(
    (rank: number) => (node: HTMLDivElement | null) => {
      if (node) {
        rankRowRefs.current.set(rank, node);
      } else {
        rankRowRefs.current.delete(rank);
      }
    },
    []
  );
  const panelStyle = animation ? ({ '--ranking-duration-ms': `${animation.durationMs}ms` } as CSSProperties) : undefined;
  const resolvedAnimationLayout = animation ? (animationLayout?.id === animation.id ? animationLayout : fallbackRankingAnimationLayout(animation)) : undefined;

  useEffect(() => {
    const previousItems = previousItemsRef.current;
    if (animationTimerRef.current) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = undefined;
    }
    if (pinnedCurrentUserTimerRef.current) {
      window.clearTimeout(pinnedCurrentUserTimerRef.current);
      pinnedCurrentUserTimerRef.current = undefined;
    }

    const nextAnimation = buildRankingAnimation(previousItems, items, userId, lastBid);
    setAnimation(nextAnimation);
    setAnimationLayout(nextAnimation ? fallbackRankingAnimationLayout(nextAnimation) : undefined);
    if (nextAnimation?.kind === 'current-row-to-first' && nextAnimation.isSelfBid) {
      setPinnedCurrentUser({ active: true, item: previousItems.find((item) => item.bidderId === userId) });
      pinnedCurrentUserTimerRef.current = window.setTimeout(() => {
        setPinnedCurrentUser(undefined);
        pinnedCurrentUserTimerRef.current = undefined;
      }, Math.round(nextAnimation.durationMs * 0.5));
    } else {
      setPinnedCurrentUser(undefined);
    }
    if (nextAnimation) {
      animationTimerRef.current = window.setTimeout(() => {
        setAnimation(undefined);
        setAnimationLayout(undefined);
        setPinnedCurrentUser(undefined);
        animationTimerRef.current = undefined;
      }, nextAnimation.durationMs);
    }
    previousItemsRef.current = items;
  }, [items, lastBid, userId]);

  useEffect(() => {
    return () => {
      if (animationTimerRef.current) window.clearTimeout(animationTimerRef.current);
      if (pinnedCurrentUserTimerRef.current) window.clearTimeout(pinnedCurrentUserTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!animation || animation.kind === 'price-only') return;
    const nextLayout = measureRankingAnimationLayout(animation, panelRef.current, boardRef.current, rankRowRefs.current, dividerRef.current, currentRowRef.current);
    setAnimationLayout((current) =>
      current &&
      current.id === nextLayout.id &&
      current.fromY === nextLayout.fromY &&
      current.toY === nextLayout.toY &&
      current.exitFromY === nextLayout.exitFromY &&
      current.exitToY === nextLayout.exitToY
        ? current
        : nextLayout
    );
  }, [animation, slots, currentUserItem]);

  return (
    <aside className={collapsed ? 'live-ranking-rail is-collapsed' : 'live-ranking-rail'} aria-label={t('auction.ranking')}>
      <button className="live-ranking-toggle" type="button" onClick={onToggle} aria-label={collapsed ? t('live.rankingExpand') : t('live.rankingCollapse')}>
        {collapsed ? (
          <>
            <b>{t('live.rankingExpandText')}</b>
            <span aria-hidden="true">&lt;</span>
          </>
        ) : (
          <>
            <b>{t('live.rankingCollapseText')}</b>
            <span aria-hidden="true">&gt;</span>
          </>
        )}
      </button>
      {!collapsed ? (
        <div ref={panelRef} className="live-ranking-panel" style={panelStyle}>
          <h2 className="live-ranking-title">
            <Trophy size={13} />
            <span>{t('auction.ranking')}</span>
          </h2>
          <div ref={boardRef} className="live-ranking-board-viewport">
            <div className="live-ranking-top-list">
              {slots.map((slot) => (
                <LiveRankingRow
                  key={slot.rank}
                  rank={slot.rank}
                  item={slot.item}
                  userId={userId}
                  animation={animation}
                  rowRef={setRankRowRef(slot.rank)}
                />
              ))}
            </div>
            <div ref={dividerRef} className="live-ranking-divider" />
            {animation && animation.kind !== 'price-only' && resolvedAnimationLayout && animation.exitItem ? <LiveRankingExitRow animation={animation} layout={resolvedAnimationLayout} /> : null}
          </div>
          <LiveRankingRow rank={currentUserRowItem?.rank ?? '-'} item={currentUserRowItem} userId={userId} animation={animation} current rowRef={(node) => (currentRowRef.current = node)} />
          {animation && animation.kind !== 'price-only' && resolvedAnimationLayout ? (
            <LiveRankingGhost animation={animation} layout={resolvedAnimationLayout} />
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function LiveRankingRow({
  rank,
  item,
  userId,
  animation,
  current = false,
  rowRef
}: {
  rank: number | '-';
  item?: RankingItem;
  userId: string;
  animation?: RankingAnimation;
  current?: boolean;
  rowRef?: (node: HTMLDivElement | null) => void;
}) {
  const isPlaceholder = !item && !current;
  const isCurrentUser = item?.bidderId === userId;
  const isTopLeader = item?.rank === 1 && !current;
  const animationBidderId = item?.bidderId;
  const isMovementAnimation = animation && animation.kind !== 'price-only';
  const isMovingTarget = Boolean(isMovementAnimation && animationBidderId === animation.bidderId && !current);
  const rowClassName = joinClassNames(
    'live-ranking-row',
    current && 'live-ranking-current-row',
    isPlaceholder && 'is-placeholder',
    isCurrentUser && 'is-current-user',
    isTopLeader && 'is-leading',
    !current && animationBidderId && animation?.shiftedIds.includes(animationBidderId) && 'is-shifted-down',
    !current && animationBidderId && animation?.enteringIds.includes(animationBidderId) && 'is-entering',
    isMovingTarget && 'is-moving-target',
    animationBidderId && animation?.priceUpdateIds.includes(animationBidderId) && 'is-price-updating'
  );
  const rankClassName = joinClassNames(
    'live-ranking-rank',
    rank === 1 && 'is-gold',
    rank === 2 && 'is-silver',
    rank === 3 && 'is-bronze',
    typeof rank === 'number' && rank > 3 && 'is-plain'
  );
  const priceClassName = joinClassNames(
    'live-ranking-price',
    !item && 'is-empty',
    isTopLeader && 'is-leading-price',
    animationBidderId && animation?.priceUpdateIds.includes(animationBidderId) && 'is-price-updating'
  );

  return (
    <div ref={rowRef} className={rowClassName} data-rank={rank} data-bidder-id={item?.bidderId} data-current-user={current ? 'true' : undefined}>
      <span className={rankClassName}>{item || current ? rank : rank}</span>
      <span className="live-ranking-avatar" aria-hidden="true">
        {item?.avatarUrl ? <img src={item.avatarUrl} alt="" /> : <span>{rankingAvatarText(item, current)}</span>}
      </span>
      <strong className="live-ranking-name">{item?.nicknameMask ?? (current ? t('live.commentMe') : '')}</strong>
      <b className={priceClassName}>{item ? formatMoney(item.price) : '-'}</b>
    </div>
  );
}

function LiveRankingGhost({ animation, layout }: { animation: RankingAnimation; layout: RankingAnimationLayout }) {
  return (
    <div
      className={joinClassNames('live-ranking-ghost', `is-${animation.kind}`, animation.isSelfBid ? 'is-self-bid' : 'is-other-bid')}
      data-origin={animation.origin}
      data-from-rank={animation.fromRank}
      data-to-rank={animation.toRank}
      data-bidder-id={animation.bidderId}
      style={
        {
          '--ranking-duration-ms': `${animation.durationMs}ms`,
          '--ranking-ghost-duration-ms': `${animation.durationMs}ms`,
          '--ranking-from-y': `${layout.fromY}px`,
          '--ranking-to-y': `${layout.toY}px`
        } as CSSProperties
      }
    >
      <span className="live-ranking-rank is-gold">1</span>
      <span className="live-ranking-avatar" aria-hidden="true">
        {animation.movingItem.avatarUrl ? <img src={animation.movingItem.avatarUrl} alt="" /> : <span>{rankingAvatarText(animation.movingItem)}</span>}
      </span>
      <strong className="live-ranking-name">{animation.movingItem.nicknameMask}</strong>
      <b className="live-ranking-price is-price-updating">{formatMoney(animation.movingItem.price)}</b>
    </div>
  );
}

function LiveRankingExitRow({ animation, layout }: { animation: RankingAnimation; layout: RankingAnimationLayout }) {
  if (!animation.exitItem) return null;
  return (
    <div
      className="live-ranking-row live-ranking-exit-row is-exiting-to-divider"
      data-bidder-id={animation.exitItem.bidderId}
      style={
        {
          '--ranking-duration-ms': `${animation.durationMs}ms`,
          '--ranking-exit-from-y': `${layout.exitFromY}px`,
          '--ranking-exit-to-y': `${layout.exitToY}px`
        } as CSSProperties
      }
    >
      <span className="live-ranking-rank is-plain">{animation.exitItem.rank}</span>
      <span className="live-ranking-avatar" aria-hidden="true">
        {animation.exitItem.avatarUrl ? <img src={animation.exitItem.avatarUrl} alt="" /> : <span>{rankingAvatarText(animation.exitItem)}</span>}
      </span>
      <strong className="live-ranking-name">{animation.exitItem.nicknameMask}</strong>
      <b className="live-ranking-price">{formatMoney(animation.exitItem.price)}</b>
    </div>
  );
}

function buildRankingSlots(items: RankingItem[]): Array<{ rank: number; item?: RankingItem }> {
  const sortedItems = sortRankingItems(items).slice(0, 8);
  return Array.from({ length: 8 }, (_, index) => ({ rank: index + 1, item: sortedItems[index] }));
}

function buildRankingAnimation(previousItems: RankingItem[], nextItems: RankingItem[], userId: string, lastBid?: RankingBidHint): RankingAnimation | undefined {
  if (!previousItems.length || !nextItems.length || rankingItemsEqual(previousItems, nextItems)) return undefined;
  const previousByBidder = new Map(previousItems.map((item) => [item.bidderId, item]));
  const nextByBidder = new Map(nextItems.map((item) => [item.bidderId, item]));
  const bidderId = resolveRankingAnimationBidder(previousItems, nextItems, lastBid);
  if (!bidderId) return undefined;
  const nextBidderItem = nextByBidder.get(bidderId);
  const previousBidderItem = previousByBidder.get(bidderId);
  const fallbackMovingItem: RankingItem = previousBidderItem ?? {
    rank: 1,
    bidderId,
    nicknameMask: bidderId === userId ? t('live.commentMe') : bidderId,
    price: lastBid?.price ?? 0,
    bidTsMs: lastBid?.bidTsMs ?? Date.now()
  };
  const movingItem: RankingItem = nextBidderItem ?? {
    ...fallbackMovingItem,
    rank: 1,
    price: lastBid?.price ?? fallbackMovingItem.price
  };
  const previousTopIds = topRankingIds(previousItems);
  const nextTopIds = topRankingIds(nextItems);
  const shiftedIds = nextTopIds.filter((id) => id !== bidderId && previousByBidder.has(id) && (previousByBidder.get(id)?.rank ?? 0) < (nextByBidder.get(id)?.rank ?? 0));
  const enteringIds = nextTopIds.filter((id) => !previousTopIds.includes(id));
  const exitingIds = previousTopIds.filter((id) => !nextTopIds.includes(id));
  const previousRank = previousBidderItem?.rank;
  const nextRank = nextBidderItem?.rank;
  const rankChanged = previousRank !== undefined && nextRank !== undefined && previousRank !== nextRank;
  const membershipChanged = enteringIds.length > 0 || exitingIds.length > 0;
  const priceChanged = nextBidderItem && previousBidderItem && nextBidderItem.price !== previousBidderItem.price;
  const isSelfBid = bidderId === userId;
  const movesToFirst = nextRank === 1 && (rankChanged || membershipChanged);
  const kind: RankingAnimationKind = movesToFirst
    ? previousRank !== undefined && previousRank <= 8
      ? 'top-slot-to-first'
      : isSelfBid
        ? 'current-row-to-first'
        : 'divider-to-first'
    : 'price-only';
  if (kind === 'price-only' && !priceChanged) return undefined;
  if (kind !== 'price-only' && !enteringIds.includes(bidderId)) enteringIds.push(bidderId);
  const exitItem = kind !== 'price-only' ? sortRankingItems(previousItems).find((item) => exitingIds.includes(item.bidderId) && item.bidderId !== bidderId) : undefined;
  return {
    id: `${bidderId}-${movingItem.bidTsMs}-${movingItem.price}`,
    kind,
    origin: rankingAnimationOrigin(kind),
    bidderId,
    fromRank: previousRank,
    toRank: 1,
    isSelfBid,
    durationMs: isSelfBid && kind !== 'price-only' ? 1000 : 500,
    movingItem,
    exitItem,
    shiftedIds,
    enteringIds,
    exitingIds,
    priceUpdateIds: kind === 'price-only' ? [bidderId] : []
  };
}

function rankingAnimationOrigin(kind: RankingAnimationKind): RankingAnimationOrigin {
  if (kind === 'top-slot-to-first') return 'top-slot';
  if (kind === 'divider-to-first') return 'divider';
  if (kind === 'current-row-to-first') return 'current-row';
  return 'price';
}

function resolveRankingAnimationBidder(previousItems: RankingItem[], nextItems: RankingItem[], lastBid?: RankingBidHint): string | undefined {
  if (lastBid?.bidderId && nextItems.some((item) => item.bidderId === lastBid.bidderId)) return lastBid.bidderId;
  const previousByBidder = new Map(previousItems.map((item) => [item.bidderId, item]));
  return sortRankingItems(nextItems).find((item) => {
    const previous = previousByBidder.get(item.bidderId);
    return previous && (item.price > previous.price || item.rank < previous.rank);
  })?.bidderId;
}

function topRankingIds(items: RankingItem[]): string[] {
  return sortRankingItems(items)
    .slice(0, 8)
    .map((item) => item.bidderId);
}

const rankingFallbackFirstRowY = 48;
const rankingFallbackRowStepY = 32;
const rankingFallbackDividerY = rankingFallbackFirstRowY + rankingFallbackRowStepY * 8 + 2;
const rankingFallbackCurrentRowY = rankingFallbackDividerY + 6;
const rankingFallbackBoardDividerY = rankingFallbackRowStepY * 8 + 2;

function fallbackRankingAnimationLayout(animation: RankingAnimation): RankingAnimationLayout {
  const fromY =
    animation.kind === 'top-slot-to-first'
      ? rankingFallbackYForRank(animation.fromRank ?? 1)
      : animation.kind === 'current-row-to-first'
        ? rankingFallbackCurrentRowY
        : animation.kind === 'divider-to-first'
          ? rankingFallbackDividerY
          : rankingFallbackYForRank(1);
  return {
    id: animation.id,
    fromY,
    toY: rankingFallbackYForRank(1),
    exitFromY: rankingFallbackBoardYForRank(8),
    exitToY: rankingFallbackBoardDividerY
  };
}

function measureRankingAnimationLayout(animation: RankingAnimation, panel: HTMLDivElement | null, board: HTMLDivElement | null, rankRows: Map<number, HTMLDivElement>, divider: HTMLDivElement | null, currentRow: HTMLDivElement | null): RankingAnimationLayout {
  const fallback = fallbackRankingAnimationLayout(animation);
  const toY = relativeRankingTop(rankRows.get(1), panel, fallback.toY);
  const fromY =
    animation.kind === 'top-slot-to-first'
      ? relativeRankingTop(rankRows.get(animation.fromRank ?? 1), panel, fallback.fromY)
      : animation.kind === 'current-row-to-first'
        ? relativeRankingTop(currentRow, panel, fallback.fromY)
        : animation.kind === 'divider-to-first'
          ? relativeRankingTop(divider, panel, fallback.fromY)
          : fallback.fromY;
  return {
    id: animation.id,
    fromY,
    toY,
    exitFromY: relativeRankingTop(rankRows.get(8), board, fallback.exitFromY),
    exitToY: relativeRankingTop(divider, board, fallback.exitToY)
  };
}

function rankingFallbackYForRank(rank: number): number {
  return rankingFallbackFirstRowY + Math.max(0, rank - 1) * rankingFallbackRowStepY;
}

function rankingFallbackBoardYForRank(rank: number): number {
  return Math.max(0, rank - 1) * rankingFallbackRowStepY;
}

function relativeRankingTop(element: HTMLElement | null | undefined, panel: HTMLElement | null, fallback: number): number {
  if (!element || !panel) return fallback;
  const elementRect = element.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  if (!elementRect.height && !elementRect.top && !panelRect.top) return fallback;
  return Math.round(elementRect.top - panelRect.top);
}

function sortRankingItems(items: RankingItem[]): RankingItem[] {
  return [...items].sort((a, b) => a.rank - b.rank || b.price - a.price || b.bidTsMs - a.bidTsMs);
}

function rankingItemsEqual(previousItems: RankingItem[], nextItems: RankingItem[]): boolean {
  if (previousItems.length !== nextItems.length) return false;
  return previousItems.every((previousItem, index) => {
    const nextItem = nextItems[index];
    return nextItem && previousItem.rank === nextItem.rank && previousItem.bidderId === nextItem.bidderId && previousItem.price === nextItem.price && previousItem.bidTsMs === nextItem.bidTsMs;
  });
}

function rankingAvatarText(item?: RankingItem, current = false): string {
  const name = item?.nicknameMask ?? (current ? t('live.commentMe') : '');
  return name.trim().slice(0, 1) || '-';
}

function joinClassNames(...items: Array<string | false | undefined>): string {
  return items.filter(Boolean).join(' ');
}

function initialLiveChatMessages(roomId: string): LiveChatMessage[] {
  return [createSystemChatMessage(roomId, t('live.commentWelcome'))];
}

function createSystemChatMessage(roomId: string, content: string): LiveChatMessage {
  return {
    id: makeRequestId('system-chat'),
    roomId,
    nickname: t('live.commentSystem'),
    content,
    createdAt: new Date().toISOString(),
    system: true
  };
}

function upsertChatMessage(messages: LiveChatMessage[], message: LiveChatMessage): LiveChatMessage[] {
  const index = messages.findIndex((item) => item.id === message.id || (message.clientMessageId && item.clientMessageId === message.clientMessageId));
  if (index < 0) return [...messages, message];
  return messages.map((item, currentIndex) => (currentIndex === index ? { ...item, ...message, pending: false, failed: false } : item));
}

function RoomStatePage({ room, lots, status, onBack, onPay }: { room: LiveRoom; lots: LiveRoomLot[]; status: 'ended' | 'upcoming'; onBack: () => void; onPay?: (auctionId: string) => void }) {
  const soldLots = lots.filter((lot) => lot.status === 'CLOSED_WON' || lot.status === 'SETTLED' || lot.status === 'HAMMER_PENDING');
  const gmv = soldLots.reduce((sum, lot) => sum + (lot.finalPrice ?? lot.currentPrice), 0);
  const visibleLots = status === 'ended' ? lots : lots.filter((lot) => lot.status === 'UPCOMING' || lot.status === 'READY' || lot.status === 'WARMING_UP');
  return (
    <section className="room-state-page">
      <button className="back-button" type="button" onClick={onBack}>
        <ArrowLeft size={18} /> {t('common.back')}
      </button>
      <div className="room-state-hero">
        <Radio size={38} />
        <p>{room.merchantName}</p>
        <h1>{room.title}</h1>
        <span>{status === 'ended' ? t('live.endedTitle') : t('live.upcomingTitle')}</span>
      </div>
      <div className="price-grid compact">
        <Metric label={t('live.lotCount', { count: lots.length })} value={String(lots.length)} icon={<Package size={16} />} />
        <Metric label={t('live.dealTotal')} value={formatMoney(gmv)} icon={<Trophy size={16} />} />
      </div>
      <SectionTitle eyebrow={status === 'ended' ? t('live.endedSummary') : t('live.upcomingSummary')} title={room.title} />
      <div className="result-list">
        {visibleLots.map((lot) => {
          const state = stateFromLot(lot);
          return (
            <article className="search-result-card lot-result-card" key={lot.id}>
              <button className="result-media" type="button">
                <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="gold" />
              </button>
              <div>
                <span className="status-badge">{lotStatusLabel(state.status)}</span>
                <h3>{lot.title}</h3>
                <p>{lot.subtitle}</p>
                <div className="lot-price-line">
                  <span>{priceLabel(lot, state)}</span>
                  <strong>{formatMoney(priceValue(lot, state))}</strong>
                </div>
              </div>
              {status === 'ended' && state.status === 'CLOSED_WON' && onPay ? (
                <Button size="small" color="primary" onClick={() => onPay(lot.auctionId)}>
                  {t('auction.pay')}
                </Button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

interface RealtimeHandlerOptions {
  activeAuctionId?: string;
  userId: string;
  setLiveStats: (updater: (prev: LiveRoomStats) => LiveRoomStats) => void;
  setLotStates: (updater: (prev: Record<string, AuctionState>) => Record<string, AuctionState>) => void;
  setNotice: (notice: string) => void;
  setRanking: (items: RankingItem[]) => void;
  onChatAck: (payload: Record<string, unknown>) => void;
  onChatMessage: (message: LiveChatMessage) => void;
  onChatError: (payload: Record<string, unknown>) => void;
  onBidAck?: (requestId: string | undefined, payload: Record<string, unknown>) => void;
  onBidAccepted?: (requestId: string | undefined, payload: Record<string, unknown>) => void;
  onBidRejected?: (requestId: string | undefined, payload: Record<string, unknown>) => void;
  onSnapshotRequired?: () => void;
}

function handleRealtimeMessage(message: RealtimeMessage, options: RealtimeHandlerOptions) {
  if (message.type === 'room.online') {
    const payload = message.payload as Record<string, unknown>;
    options.setLiveStats((prev) => ({
      ...prev,
      onlineCount: Number(payload.online ?? prev.onlineCount)
    }));
  }
  if (message.type === 'room.snapshot_required') {
    options.setNotice(t('live.snapshotRequired'));
    options.onSnapshotRequired?.();
  }
  if (message.type === 'bid.ack') {
    const payload = message.payload as Record<string, unknown>;
    options.onBidAck?.(message.requestId, payload);
    options.setNotice(t('auction.bidSubmitted'));
  }
  if (message.type === 'chat.ack') {
    options.onChatAck(message.payload as Record<string, unknown>);
  }
  if (message.type === 'chat.message') {
    options.onChatMessage(message.payload as LiveChatMessage);
  }
  if (message.type === 'chat.error') {
    options.onChatError(message.payload as Record<string, unknown>);
    options.setNotice(t('live.commentFailed'));
  }
  if (message.type === 'bid.rejected') {
    const payload = message.payload as Record<string, unknown>;
    options.onBidRejected?.(message.requestId, payload);
    options.setNotice(formatBidRejectedMessage(payload));
  }
  if (message.type === 'bid.accepted') {
    const payload = message.payload as Record<string, unknown>;
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    options.setLotStates((prev) => ({
      ...prev,
      [auctionId]: {
        ...(prev[auctionId] ?? fallbackAuctionState(auctionId)),
        auctionId,
        status: 'RUNNING',
        currentPrice: Number(payload.currentPrice ?? payload.price ?? prev[auctionId]?.currentPrice ?? 0),
        leaderBidderId: String(payload.leaderBidderId ?? payload.bidderId ?? ''),
        bidCount: payload.bidCount === undefined ? (prev[auctionId]?.bidCount ?? 0) + 1 : Number(payload.bidCount),
        participantCount: payload.participantCount === undefined ? prev[auctionId]?.participantCount : Number(payload.participantCount),
        endTsMs: Number(payload.endTsMs ?? prev[auctionId]?.endTsMs ?? Date.now()),
        serverTsMs: Date.now()
      }
    }));
    options.onBidAccepted?.(message.requestId, payload);
    options.setNotice(String(payload.bidderId ?? payload.leaderBidderId) === options.userId ? t('auction.bidAccepted') : t('live.chat.bid'));
  }
  if (message.type === 'ranking.updated') {
    const payload = message.payload as { items?: RankingItem[] };
    options.setRanking(payload.items ?? []);
  }
  if (message.type === 'timer.extended') {
    const payload = message.payload as Record<string, unknown>;
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    options.setLotStates((prev) => ({
      ...prev,
      [auctionId]: {
        ...(prev[auctionId] ?? fallbackAuctionState(auctionId)),
        auctionId,
        status: 'EXTENDED',
        endTsMs: Number(payload.newEndTsMs ?? prev[auctionId]?.endTsMs ?? Date.now()),
        serverTsMs: Date.now()
      }
    }));
    options.setNotice(t('auction.extended'));
  }
  if (message.type === 'auction.started') {
    const payload = message.payload as Record<string, unknown>;
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    options.setLotStates((prev) => {
      const previous = prev[auctionId] ?? fallbackAuctionState(auctionId);
      return {
        ...prev,
        [auctionId]: {
          ...previous,
          auctionId,
          status: 'RUNNING',
          currentPrice: Number(payload.currentPrice ?? previous.currentPrice ?? 0),
          leaderBidderId: payload.leaderBidderId === undefined ? previous.leaderBidderId : String(payload.leaderBidderId),
          endTsMs: parseRealtimeTimestampMs(payload.endTsMs ?? payload.endTime, previous.endTsMs ?? Date.now()),
          serverTsMs: Date.now(),
          bidCount: payload.bidCount === undefined ? previous.bidCount : Number(payload.bidCount),
          participantCount: payload.participantCount === undefined ? previous.participantCount : Number(payload.participantCount)
        }
      };
    });
  }
  if (message.type === 'auction.closed') {
    const payload = message.payload as Record<string, unknown>;
    const auctionId = String(payload.auctionId ?? options.activeAuctionId ?? '');
    options.setLotStates((prev) => ({
      ...prev,
      [auctionId]: {
        ...(prev[auctionId] ?? fallbackAuctionState(auctionId)),
        auctionId,
        status: String(payload.status ?? 'CLOSED_WON') as AuctionState['status'],
        currentPrice: Number(payload.finalPrice ?? prev[auctionId]?.currentPrice ?? 0),
        leaderBidderId: payload.winnerBidderId === undefined ? prev[auctionId]?.leaderBidderId : String(payload.winnerBidderId),
        endTsMs: Number(payload.closedTsMs ?? Date.now()),
        serverTsMs: Date.now()
      }
    }));
    options.setNotice(t('auction.closed'));
  }
}

function AuctionFloatingCard({
  lot,
  state,
  ranking,
  enrolled,
  phase,
  onOpenLot,
  onQuickBid,
  onDismiss,
  remainMs,
  ended = false
}: {
  lot: LiveRoomLot;
  state: AuctionState;
  ranking: RankingItem[];
  enrolled: boolean;
  phase: FloatingAuctionCardPhase;
  onOpenLot: () => void;
  onQuickBid: () => void;
  onDismiss: () => void;
  remainMs: number;
  ended?: boolean;
}) {
  const leader = state.leaderBidderId ? (ranking[0]?.nicknameMask ?? defaultRanking(state)[0]?.nicknameMask) : undefined;
  const actionText = ended ? t('auction.closed') : enrolled ? t('auction.quickBid') : t('auction.lookAround');
  const className = ['auction-float-card', `is-${phase}`, ended ? 'is-ended' : ''].filter(Boolean).join(' ');
  return (
    <article className={className}>
      <button
        type="button"
        className="auction-float-dismiss"
        aria-label={t('auction.hideCurrentLot')}
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
      >
        <X size={13} aria-hidden="true" />
      </button>
      <button type="button" className="float-card-main" onClick={ended ? undefined : onOpenLot} aria-label={lot.title} disabled={ended}>
        <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="red" />
        <h2>{lot.title}</h2>
        <strong>{formatMoney(priceValue(lot, state))}</strong>
        <p>{leader ?? t('bid.startPriceBidder')}</p>
        <small>{ended ? t('auction.endShort') : formatCountdown(remainMs)}</small>
        <div className="float-card-legacy" aria-hidden="true">
          <span className="status-badge">{lotStatusLabel(state.status)}</span>
          <h2>{lot.title}</h2>
          <p>{priceLabel(lot, state)}</p>
          <strong>{formatMoney(priceValue(lot, state))}</strong>
          <small>
            {t('auction.countdown')} {formatCountdown(remainMs)}
            {leader ? ` · ${leader}` : ''}
          </small>
        </div>
      </button>
      <button
        type="button"
        className={enrolled ? 'float-card-action is-quick' : 'float-card-action'}
        disabled={ended}
        onClick={(event) => {
          event.stopPropagation();
          if (ended) return;
          if (enrolled) {
            onQuickBid();
            return;
          }
          onOpenLot();
        }}
      >
        {actionText}
      </button>
    </article>
  );
}

function AnimatedSheetFrame({
  variant,
  phase,
  zIndex,
  accessibilityHidden = false,
  className,
  label,
  onClose,
  children
}: {
  variant: LiveSheetVariant;
  phase: LiveSheetPhase;
  zIndex: number;
  accessibilityHidden?: boolean;
  className: string;
  label: string;
  onClose: () => void;
  children: (requestClose: () => void) => ReactNode;
}) {
  const durationMs = LIVE_SHEET_DURATIONS_MS[variant];
  const requestClose = useCallback(() => {
    if (phase === 'closing') return;
    onClose();
  }, [onClose, phase]);
  const backdropClassName = ['sheet-backdrop', phase === 'opening' ? 'is-opening' : '', phase === 'closing' ? 'is-closing' : ''].filter(Boolean).join(' ');

  return (
    <div
      className={backdropClassName}
      aria-hidden={accessibilityHidden ? true : undefined}
      style={{ '--sheet-duration-ms': `${durationMs}ms`, zIndex } as CSSProperties}
      onClick={requestClose}
    >
      <section className={`bottom-sheet ${className}`} role="dialog" aria-label={label} onClick={(event) => event.stopPropagation()}>
        {children(requestClose)}
      </section>
    </div>
  );
}

function LotListSheet({
  phase,
  zIndex,
  accessibilityHidden,
  lots,
  states,
  activeAuctionId,
  onClose,
  onOpenLot
}: {
  phase: LiveSheetPhase;
  zIndex: number;
  accessibilityHidden?: boolean;
  lots: LiveRoomLot[];
  states: Record<string, AuctionState>;
  activeAuctionId?: string;
  onClose: () => void;
  onOpenLot: (lot: LiveRoomLot) => void;
}) {
  return (
    <AnimatedSheetFrame variant="lotList" phase={phase} zIndex={zIndex} accessibilityHidden={accessibilityHidden} className="lot-list-sheet" label={t('live.goodsList')} onClose={onClose}>
      {(requestClose) => (
        <>
        <SheetHeader title={t('live.goodsList')} onClose={requestClose} />
        <div className="lot-list">
          {lots.map((lot) => {
            const state = states[lot.auctionId] ?? stateFromLot(lot);
            return (
              <article className={lot.auctionId === activeAuctionId ? 'lot-row is-active' : 'lot-row'} key={lot.id}>
                <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="red" />
                <div>
                  <span className="status-badge">{lotStatusLabel(state.status)}</span>
                  <h3>{lot.title}</h3>
                  <p>{lot.subtitle}</p>
                  <div className="lot-price-line">
                    <span>{priceLabel(lot, state)}</span>
                    <strong>{formatMoney(priceValue(lot, state))}</strong>
                  </div>
                </div>
                <Button size="small" color={state.status === 'RUNNING' || state.status === 'EXTENDED' ? 'danger' : 'primary'} fill={state.status === 'UPCOMING' ? 'outline' : 'solid'} onClick={() => onOpenLot(lot)}>
                  {lotActionText(state.status)}
                </Button>
              </article>
            );
          })}
        </div>
        </>
      )}
    </AnimatedSheetFrame>
  );
}

function LotDetailSheet({
  phase,
  zIndex,
  accessibilityHidden,
  lot,
  state,
  ranking,
  enrolled,
  enrolling,
  onClose,
  onEnroll,
  onBid,
  onPay
}: {
  phase: LiveSheetPhase;
  zIndex: number;
  accessibilityHidden?: boolean;
  lot: LiveRoomLot;
  state: AuctionState;
  ranking: RankingItem[];
  enrolled: boolean;
  enrolling: boolean;
  onClose: () => void;
  onEnroll: () => void;
  onBid: () => void;
  onPay: () => void;
}) {
  const canBid = state.status === 'RUNNING' || state.status === 'EXTENDED';
  return (
    <AnimatedSheetFrame variant="detail" phase={phase} zIndex={zIndex} accessibilityHidden={accessibilityHidden} className="detail-sheet" label={t('product.detail')} onClose={onClose}>
      {(requestClose) => (
        <>
        <SheetHeader title={t('product.detail')} onClose={requestClose} />
        <div className="detail-hero">
          <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="red" />
          <div className="detail-status-strip">
            <span>{lotStatusLabel(state.status)}</span>
            <strong>{state.leaderBidderId ? t('bid.leader') : t('product.noBid')}</strong>
          </div>
        </div>
        <div className="detail-body">
          <p className="price-label">{priceLabel(lot, state)}</p>
          <h2>{formatMoney(priceValue(lot, state))}</h2>
          <h3>{lot.title}</h3>
          <p>{lot.description ?? lot.subtitle}</p>
          <div className="price-grid compact">
            <Metric label={t('auction.participants')} value={String(state.participantCount ?? lot.participantCount ?? 0)} icon={<Users size={16} />} />
            <Metric label={t('auction.bidCount')} value={String(state.bidCount ?? lot.bidCount ?? 0)} icon={<Gavel size={16} />} />
            <Metric label={t('auction.increment')} value={formatMoney(Number(lot.ruleSnapshot?.minIncrement ?? 100))} icon={<Plus size={16} />} />
            <Metric label={t('auction.deposit')} value={formatMoney(lot.depositAmount ?? 0)} icon={<WalletCards size={16} />} />
          </div>
          <article className="ranking-panel">
            <h4>{t('auction.ranking')}</h4>
            {(ranking.length ? ranking : defaultRanking(state)).slice(0, 3).map((item) => (
              <div className="ranking-row" key={`${item.rank}-${item.bidderId}`}>
                <span>{item.rank}</span>
                <strong>{item.nicknameMask}</strong>
                <b>{formatMoney(item.price)}</b>
              </div>
            ))}
          </article>
        </div>
        <footer className="sheet-actions">
          <Button block fill={enrolled ? 'outline' : 'solid'} color="primary" loading={enrolling} disabled={!canBid} onClick={onEnroll}>
            {enrolled ? t('auction.enrolled') : t('auction.enroll')}
          </Button>
          <Button block color="danger" disabled={!canBid || !enrolled} onClick={onBid}>
            {canBid ? t('product.bidNow') : t('product.viewResult')}
          </Button>
          {!canBid && state.status === 'CLOSED_WON' ? (
            <Button block color="primary" onClick={onPay}>
              {t('auction.pay')}
            </Button>
          ) : null}
        </footer>
        </>
      )}
    </AnimatedSheetFrame>
  );
}

function BidSheet({
  phase,
  zIndex,
  accessibilityHidden,
  lot,
  state,
  ranking,
  feedback,
  lastBidAtMs,
  nowMs,
  userId,
  onClose,
  onSubmit
}: {
  phase: LiveSheetPhase;
  zIndex: number;
  accessibilityHidden?: boolean;
  lot: LiveRoomLot;
  state: AuctionState;
  ranking: RankingItem[];
  feedback: QuickBidFeedback;
  lastBidAtMs?: number;
  nowMs: number;
  userId: string;
  onClose: () => void;
  onSubmit: (price: number) => void;
}) {
  const rule = useMemo(() => bidRuleFromLot(lot, state), [lot, state]);
  const isClosed = state.status !== 'RUNNING' && state.status !== 'EXTENDED';
  const [stepCount, setStepCount] = useState(1);
  const [selectedPrice, setSelectedPrice] = useState(() => getQuickBidPrice(rule, 1));
  const [closedAtMs, setClosedAtMs] = useState<number | undefined>(() => (isClosed ? nowMs : undefined));
  const remainMs = msUntil(state.endTsMs, nowMs);
  const minBidIntervalMs = getMinBidIntervalMs(rule);
  const intervalRemainingMs = getQuickBidIntervalRemainingMs(lastBidAtMs, nowMs, minBidIntervalMs);
  const outdated = isQuickBidOutdated(selectedPrice, rule);
  const validation = validateBidPrice(selectedPrice, rule);
  const leader = state.leaderBidderId ? (ranking[0]?.nicknameMask ?? defaultRanking(state)[0]?.nicknameMask) : t('bid.startPriceBidder');
  const myBid = state.leaderBidderId === userId ? formatMoney(state.currentPrice) : t('bid.noMyBid');
  const closedCountdown = isClosed ? Math.max(0, Math.ceil(((closedAtMs ?? nowMs) + AUCTION_ENDED_HOLD_MS - nowMs) / 1000)) : 5;

  useEffect(() => {
    if (feedback.status !== 'success') return;
    const nextRule = bidRuleFromLot(lot, state);
    setStepCount(1);
    setSelectedPrice(getQuickBidPrice(nextRule, 1));
  }, [feedback.status, lot, state]);

  useEffect(() => {
    setClosedAtMs((current) => {
      if (!isClosed) return undefined;
      return current ?? nowMs;
    });
  }, [isClosed, nowMs]);

  useEffect(() => {
    if (isClosed && closedCountdown <= 0) onClose();
  }, [closedCountdown, isClosed, onClose]);

  const setPriceBySteps = (steps: number) => {
    const nextSteps = Math.max(1, Math.min(QUICK_BID_MAX_STEPS, steps));
    setStepCount(nextSteps);
    setSelectedPrice(getQuickBidPrice(rule, nextSteps));
  };

  const canDecrease = stepCount > 1 && !isClosed && feedback.status !== 'submitting';
  const canIncrease = stepCount < QUICK_BID_MAX_STEPS && selectedPrice < (rule.ceilingPrice ?? Number.MAX_SAFE_INTEGER) && !isClosed && feedback.status !== 'submitting';
  const disabledReason =
    isClosed
      ? t('bid.currentAuctionEnded')
      : outdated
        ? t('bid.priceOutdated')
        : !validation.valid
          ? formatBidValidationNotice(validation)
          : intervalRemainingMs > 0
            ? t('bid.intervalWaiting', { seconds: Math.ceil(intervalRemainingMs / 1000) })
            : '';
  const canSubmit = !disabledReason && feedback.status !== 'submitting';
  const submitText = isClosed ? t('bid.endedAutoReturn', { seconds: closedCountdown }) : feedback.status === 'submitting' ? t('auction.bidSubmitted') : t('bid.submitNow');

  return (
    <AnimatedSheetFrame variant="quickBid" phase={phase} zIndex={zIndex} accessibilityHidden={accessibilityHidden} className="bid-sheet quick-bid-sheet" label={t('bid.confirmTitle')} onClose={onClose}>
      {() => (
        <>
        <div className="quick-bid-timer">
          {isClosed ? (
            <h2>{t('bid.currentAuctionEnded')}</h2>
          ) : (
            <h2>
              {t('bid.countdownPrefix')}
              <span>{formatCountdown(remainMs)}</span>
            </h2>
          )}
        </div>
        <div className="quick-bid-summary">
          <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="gold" />
          <div className="quick-bid-title">
            <h3>{lot.title}</h3>
            <div className="quick-bid-price-grid">
              <span>
                {t('auction.currentPriceLabel')}
                <strong>{formatMoney(priceValue(lot, state))}</strong>
                <small>{leader}</small>
              </span>
              <span>
                {t('bid.myBid')}
                <strong>{myBid}</strong>
              </span>
            </div>
          </div>
        </div>
        <div className="quick-bid-selector">
          <button type="button" aria-label={t('bid.decrease')} disabled={!canDecrease} onClick={() => setPriceBySteps(stepCount - 1)}>
            <Minus size={18} />
          </button>
          <div>
            <strong>{formatMoney(selectedPrice)}</strong>
            <span>
              {t('auction.increment')} {formatMoney(rule.minIncrement)}
            </span>
          </div>
          <button type="button" aria-label={t('bid.increase')} disabled={!canIncrease} onClick={() => setPriceBySteps(outdated ? 1 : stepCount + 1)}>
            <Plus size={18} />
          </button>
        </div>
        {feedback.status === 'success' || feedback.status === 'error' ? <p className={feedback.status === 'success' ? 'quick-bid-feedback is-success' : 'quick-bid-feedback is-error'}>{feedback.message}</p> : null}
        {disabledReason && !isClosed ? <p className="quick-bid-feedback is-error">{disabledReason}</p> : null}
        <button className="quick-bid-submit" type="button" disabled={!canSubmit} onClick={() => onSubmit(selectedPrice)}>
          {submitText}
        </button>
        <p className="quick-bid-ceiling">
          <span>{t('auction.ceilingPrice')}</span> {rule.ceilingPrice === undefined ? t('common.none') : formatMoney(rule.ceilingPrice)}
        </p>
        </>
      )}
    </AnimatedSheetFrame>
  );
}

function DigitalHumanLiveStage({ idleVideoUrl, talkVideoUrl }: { idleVideoUrl: string; talkVideoUrl: string }) {
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const talkVideoRef = useRef<HTMLVideoElement>(null);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    const idleVideo = idleVideoRef.current;
    const talkVideo = talkVideoRef.current;
    forceMutedVideo(idleVideo);
    forceMutedVideo(talkVideo);
    void playVideo(idleVideo);
    resetVideoToStart(talkVideo);
  }, [idleVideoUrl, talkVideoUrl]);

  return (
    <div className="digital-human-stage" data-testid="digital-human-stage">
      <video
        ref={idleVideoRef}
        className="digital-human-video idle"
        src={idleVideoUrl}
        muted
        autoPlay
        loop
        playsInline
        preload="auto"
        onError={() => setMediaError(true)}
      />
      <video
        ref={talkVideoRef}
        className="digital-human-video talk"
        src={talkVideoUrl}
        muted
        loop
        playsInline
        preload="auto"
        onError={() => setMediaError(true)}
      />
      {mediaError ? (
        <div className="digital-human-placeholder">
          <VideoOff size={28} />
          <span>{t('digitalHuman.mediaMissing')}</span>
        </div>
      ) : null}
    </div>
  );
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="sheet-header">
      <h2>{title}</h2>
      <button type="button" aria-label={t('common.close')} onClick={onClose}>
        <X size={18} />
      </button>
    </header>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ResultPage({ apiClient, auctionId, onBack, onPay }: { apiClient: ApiClient; auctionId: string; onBack: () => void; onPay: (orderId: string) => void }) {
  const orders = useQuery({
    queryKey: ['result-order', auctionId],
    queryFn: () => apiClient.listMyOrders({ auctionId }),
    placeholderData: { items: [], total: 0, page: 1, page_size: 20 }
  });
  const order = orders.data?.items[0];
  return (
    <section className="page-content result-page">
      <button className="back-button" onClick={onBack} type="button">
        <ArrowLeft size={18} /> {t('common.back')}
      </button>
      <Trophy size={48} />
      <h1>{t('result.title')}</h1>
      <h2>{order ? t('result.won') : t('result.lost')}</h2>
      <p>{auctionId}</p>
      {order ? (
        <Button block color="primary" onClick={() => onPay(order.id)}>
          {t('auction.pay')}
        </Button>
      ) : null}
    </section>
  );
}

function PayPage({ apiClient, orderId, auctionId, onBack }: { apiClient: ApiClient; orderId: string; auctionId?: string; onBack: (auctionId: string) => void }) {
  const [paid, setPaid] = useState(false);
  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => apiClient.getOrder(orderId)
  });
  const pay = useMutation({
    mutationFn: () => apiClient.payOrder(orderId),
    onSuccess: () => setPaid(true)
  });
  const targetAuctionId = auctionId ?? order.data?.auctionId ?? 'auc_2001';
  return (
    <section className="page-content result-page">
      <button className="back-button" onClick={() => onBack(targetAuctionId)} type="button">
        <ArrowLeft size={18} /> {t('common.back')}
      </button>
      <WalletCards size={48} />
      <h1>{t('pay.title')}</h1>
      <p>{paid ? t('pay.paid') : orderId}</p>
      <Button block color="primary" loading={pay.isPending} onClick={() => pay.mutate()}>
        {paid ? t('pay.paid') : t('pay.submit')}
      </Button>
    </section>
  );
}

function HistoryPage({ apiClient, onBack }: { apiClient: ApiClient; onBack: () => void }) {
  const rooms = useQuery({ queryKey: ['history-rooms'], queryFn: () => apiClient.listLiveRooms(), placeholderData: demoLiveRoomPage });
  const orders = useQuery({ queryKey: ['my-orders'], queryFn: () => apiClient.listMyOrders(), placeholderData: { items: [], total: 0, page: 1, page_size: 20 } });
  return (
    <section className="page-content">
      <button className="back-button" onClick={onBack} type="button">
        <ArrowLeft size={18} /> {t('common.back')}
      </button>
      <h1>{t('history.title')}</h1>
      <Tabs>
        <Tabs.Tab title={t('history.myOrders')} key="orders">
          <div className="history-list">
            {(orders.data?.items ?? []).map((order: Order) => (
              <div className="history-row" key={order.id}>
                <span>{order.id}</span>
                <b>{formatMoney(order.amount)}</b>
              </div>
            ))}
          </div>
        </Tabs.Tab>
        <Tabs.Tab title={t('history.recentRooms')} key="rooms">
          <div className="history-list">
            {(rooms.data?.items ?? []).map((room: LiveRoom) => (
              <div className="history-row" key={room.id}>
                <span>{room.title}</span>
                <b>{room.watcherCount}</b>
              </div>
            ))}
          </div>
        </Tabs.Tab>
      </Tabs>
    </section>
  );
}

function LoadingBlock() {
  return (
    <div className="loading-block">
      <DotLoading />
      <span>{t('state.loading')}</span>
    </div>
  );
}

function stateFromLot(lot: LiveRoomLot): AuctionState {
  return {
    auctionId: lot.auctionId,
    status: lot.status,
    currentPrice: lot.currentPrice,
    leaderBidderId: lot.leaderBidderId,
    bidCount: lot.bidCount,
    participantCount: lot.participantCount,
    endTsMs: lot.endTsMs,
    serverTsMs: Date.now()
  };
}

function fallbackAuctionState(auctionId: string): AuctionState {
  return {
    auctionId,
    status: 'RUNNING',
    currentPrice: 0,
    endTsMs: Date.now(),
    serverTsMs: Date.now()
  };
}

function parseRealtimeTimestampMs(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function bidRuleFromLot(lot: LiveRoomLot, state: AuctionState): BidRuleInput {
  return {
    currentPrice: state.currentPrice,
    minIncrement: Number(lot.ruleSnapshot?.minIncrement ?? 100),
    startPrice: lot.startPrice,
    ceilingPrice: lot.ruleSnapshot?.ceilingPrice,
    minBidIntervalMs: typeof lot.ruleSnapshot?.minBidIntervalMs === 'number' ? lot.ruleSnapshot.minBidIntervalMs : undefined
  };
}

function formatBidValidationNotice(validation: BidValidationResult): string {
  if (validation.valid) return '';
  if (validation.reason === 'belowMinimum') return t('auction.bidBelowMinimum', { min: formatMoney(validation.minPrice) });
  if (validation.reason === 'invalidStep') return t('auction.bidInvalidStep', { step: formatMoney(validation.step) });
  if (validation.reason === 'aboveCeiling') return t('auction.bidAboveCeiling', { ceiling: formatMoney(validation.ceilingPrice) });
  return t('auction.bidInvalidAmount');
}

function formatBidRejectedMessage(payload: Record<string, unknown>): string {
  const reason = String(payload.reason ?? '');
  if (reason === 'belowMinimum' || reason === 'BELOW_MIN_INCREMENT' || reason === 'invalidStep') return t('auction.bidTooSlow');
  if (reason === 'FREQ_LIMIT') return t('auction.bidTooFrequent');
  if (reason === 'AUCTION_CLOSED' || reason === 'INVALID_STATE') return t('auction.closed');
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  return t('auction.bidRejected');
}

function priceLabel(lot: LiveRoomLot, state: AuctionState): string {
  if (state.status === 'CLOSED_WON' || state.status === 'SETTLED' || state.status === 'HAMMER_PENDING') return t('auction.finalPriceLabel');
  if (state.currentPrice > lot.startPrice || (state.bidCount ?? lot.bidCount ?? 0) > 0) return t('auction.currentPriceLabel');
  return t('auction.startPriceLabel');
}

function priceValue(lot: LiveRoomLot, state: AuctionState): number {
  if (state.status === 'CLOSED_WON' || state.status === 'SETTLED' || state.status === 'HAMMER_PENDING') {
    return lot.finalPrice ?? state.currentPrice;
  }
  return state.currentPrice > 0 ? state.currentPrice : lot.startPrice;
}

function statusLabel(status: LiveRoom['status']): string {
  if (status === 'LIVE') return t('home.liveNow');
  if (status === 'UPCOMING') return t('auction.upcoming');
  return t('auction.closed');
}

function lotStatusLabel(status: AuctionState['status']): string {
  const keys: Record<AuctionState['status'], MessageKey> = {
    UPCOMING: 'auction.upcoming',
    READY: 'auction.upcoming',
    WARMING_UP: 'auction.upcoming',
    RUNNING: 'auction.running',
    EXTENDED: 'auction.running',
    HAMMER_PENDING: 'auction.hammerPending',
    CLOSED_WON: 'auction.closedWon',
    CLOSED_FAILED: 'auction.closedFailed',
    SETTLED: 'auction.settled',
    CANCELED: 'auction.closedFailed'
  };
  return t(keys[status]);
}

function lotActionText(status: AuctionState['status']): string {
  if (status === 'RUNNING' || status === 'EXTENDED') return t('product.bidNow');
  if (status === 'UPCOMING' || status === 'READY' || status === 'WARMING_UP') return t('product.openDetail');
  return t('product.viewResult');
}

function defaultRanking(state: AuctionState): RankingItem[] {
  if (!state.leaderBidderId) return [];
  return [
    {
      rank: 1,
      bidderId: state.leaderBidderId,
      nicknameMask: t('common.demoUser'),
      price: state.currentPrice,
      bidTsMs: Date.now()
    }
  ];
}

function forceMutedVideo(video?: HTMLVideoElement | null): void {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
}

async function playVideo(video?: HTMLVideoElement | null): Promise<void> {
  if (!video) return;
  try {
    await video.play();
  } catch {
    return;
  }
}

function resetVideoToStart(video?: HTMLVideoElement | null): void {
  if (!video) return;
  try {
    video.currentTime = 0;
  } catch {
    return;
  }
}
