import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent, type TransitionEvent as ReactTransitionEvent, type UIEvent as ReactUIEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams, type Location } from 'react-router-dom';
import { Button, SafeArea, Tabs, Toast } from 'antd-mobile';
import { ArrowLeft, Gavel, MapPin, Plus, Radio, SlidersHorizontal, Star, Users, WalletCards, Wifi } from 'lucide-react';
import logoUrl from '../../logo.png';
import { EmptyState } from '../components/EmptyState';
import { LoadingBlock } from '../components/LoadingBlock';
import { Metric } from '../components/Metric';
import { ResultList } from '../components/ResultList';
import { VisualPlaceholder } from '../components/VisualPlaceholder';
import { minIncrementForLot } from '../features/auction/bidRules';
import { formatCompactNumber, formatDate, lotStatusLabel, priceLabel, priceValue, scheduledStartText, stateFromLot, statusLabel } from '../features/auction/presentation';
import { mobileInlineVideoAttributes } from '../features/media/inlineVideo';
import type { PreviewMediaSnapshot } from '../features/media/previewMedia';
import { createTranslator, defaultLocale, type Locale } from '../i18n/messages';
import { setRuntimeLocale } from '../i18n/runtime';
import { previewLotStatusKind, selectPreviewLot } from '../services/auctionViews';
import { ApiClient, defaultApiClient } from '../services/api';
import { getLiveVoiceBroadcastAudioPlayer } from '../services/digitalHuman';
import { demoCategories, demoLiveRoom, demoLiveRoomPage } from '../services/mockData';
import type { LiveRoom, LiveRoomLot, LoginResult, LotSortKey, LotStatusFilter, Order, MyAuctionTabKey } from '../services/types';
import { useLiveActivityStore } from '../store/liveActivity';
import { usePreferencesStore } from '../store/preferences';
import { useProfileStore } from '../store/profile';
import { useSessionStore } from '../store/session';
import { formatMoney } from '../utils/format';
import { MainTabShell, type MainTab } from '../layout/MainTabShell';
import { FootprintsPage, FollowingPage, MePage, OrdersPage, SettingsPage } from '../pages/account/AccountPages';
import { orderTabFromOrder } from '../features/order/status';
import { PayPage } from '../pages/pay/PayPage';
import { ResultPage } from '../pages/result/ResultPage';
import { navigateWithTransition } from './navigation';

let activeLocale: Locale = defaultLocale;
let t = createTranslator(activeLocale);
const liveVideoFallback = '/media/live-room-demo.mp4';

type AppLocationState = {
  returnTo?: string;
  parentReturnTo?: string;
  sourceTab?: MainTab;
  previewMedia?: PreviewMediaSnapshot;
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

type FeedSlide = { key: string; room: LiveRoom; realIndex: number };

const feedTapMaxDurationMs = 250;
const feedTapMaxMovePx = 8;
const previewMediaSnapshotMaxAgeMs = 30_000;
const previewMediaPositionStoragePrefix = 'aieas-user-preview-media-position:';
const liveVoiceUnlockEvents = ['pointerdown', 'touchend', 'keydown', 'click'] as const;
const LazyLiveRoomPage = lazy(() => import('../pages/live-room/LiveRoomPage'));
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

function parseMainTab(tab: string | null): MainTab | undefined {
  if (tab === 'discover' || tab === 'me' || tab === 'home') return tab;
  return undefined;
}

function parseMyAuctionTab(tab: string | null): MyAuctionTabKey {
  if (tab === 'pendingBid' || tab === 'pendingPay' || tab === 'pendingShipment' || tab === 'pendingReceipt' || tab === 'completed') return tab;
  return 'all';
}

const lotSortKeys: LotSortKey[] = ['default', 'auctionTime', 'publishedAt', 'priceAsc', 'priceDesc'];
const lotStatusKeys: LotStatusFilter[] = ['all', 'READY', 'WARMING_UP', 'RUNNING'];

function parseLotSort(value: string | null): LotSortKey {
  return lotSortKeys.includes(value as LotSortKey) ? (value as LotSortKey) : 'default';
}

function parseLotStatus(value: string | null): LotStatusFilter {
  if (value === 'EXTENDED') return 'RUNNING';
  if (value === 'HAMMER_PENDING' || value === 'CLOSED_WON' || value === 'CLOSED_FAILED' || value === 'SETTLED') return 'all';
  return lotStatusKeys.includes(value as LotStatusFilter) ? (value as LotStatusFilter) : 'all';
}

function discoverLotSearchParams({ sort, status, categoryId }: { sort: LotSortKey; status: LotStatusFilter; categoryId: string }): URLSearchParams {
  const params = new URLSearchParams();
  params.set('sort', sort);
  params.set('status', status);
  params.set('categoryId', categoryId);
  return params;
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

function livePath(roomId: string, lotId?: string, from?: MainTab): string {
  const params = new URLSearchParams();
  if (lotId) params.set('lotId', lotId);
  if (from) params.set('from', from);
  const query = params.toString();
  return query ? `/live/${roomId}?${query}` : `/live/${roomId}`;
}

function payPath(orderId: string, returnTo?: string): string {
  const params = new URLSearchParams();
  if (returnTo) params.set('returnTo', returnTo);
  const query = params.toString();
  return query ? `/pay/${orderId}?${query}` : `/pay/${orderId}`;
}

function parsePayReturnTo(value: string | null): string | undefined {
  if (!value || value.startsWith('//')) return undefined;
  if (!value.startsWith('/live/') && !value.startsWith('/orders')) return undefined;
  return value;
}

function ordersPath(tab: MyAuctionTabKey, orderId?: string): string {
  const params = new URLSearchParams({ tab });
  if (orderId) params.set('orderId', orderId);
  return `/orders?${params.toString()}`;
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
  const authAwareApiClient = apiClient as ApiClient & {
    setToken?: (token: string) => void;
    configureAuthRefresh?: ApiClient['configureAuthRefresh'];
  };
  activeLocale = locale;
  t = createTranslator(locale);
  setRuntimeLocale(locale);
  authAwareApiClient.setToken?.(accessToken);

  useEffect(() => {
    authAwareApiClient.setToken?.(accessToken);
    authAwareApiClient.configureAuthRefresh?.({
      getRefreshToken: () => useSessionStore.getState().refreshToken,
      onAccessTokenRefreshed: (session) => useSessionStore.getState().refreshAccessToken(session),
      onRefreshFailed: () => useSessionStore.getState().clearSession()
    });
    return () => authAwareApiClient.configureAuthRefresh?.(undefined);
  }, [accessToken, authAwareApiClient]);

  useEffect(() => {
    const unlockLiveVoiceAudio = () => {
      void getLiveVoiceBroadcastAudioPlayer().unlockAudio();
    };
    liveVoiceUnlockEvents.forEach((eventName) => window.addEventListener(eventName, unlockLiveVoiceAudio, true));
    return () => {
      liveVoiceUnlockEvents.forEach((eventName) => window.removeEventListener(eventName, unlockLiveVoiceAudio, true));
      getLiveVoiceBroadcastAudioPlayer().close();
    };
  }, []);

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
          <Route path="/merchant/:merchantId" element={<MerchantRoutePage apiClient={apiClient} />} />
          <Route path="/product/:lotId" element={<ProductRoutePage apiClient={apiClient} />} />
          <Route path="/live/:roomId" element={<LiveRoutePage apiClient={apiClient} />} />
          <Route path="/result/:auctionId" element={<ResultRoutePage apiClient={apiClient} />} />
          <Route path="/pay/:orderId" element={<PayRoutePage apiClient={apiClient} />} />
          <Route path="/settings" element={<SettingsRoutePage apiClient={apiClient} />} />
          <Route path="/orders" element={<OrdersRoutePage apiClient={apiClient} />} />
          <Route path="/following" element={<FollowingRoutePage apiClient={apiClient} />} />
          <Route path="/footprints" element={<FootprintsRoutePage apiClient={apiClient} />} />
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
    const returnTo = currentPath(location);
    navigateWithTransition(navigate, `/product/${lot.id}`, { state: { returnTo, sourceTab: liveSourceTabFromPath(returnTo) } });
  };

  const openMerchant = (merchantId: string) => {
    const returnTo = currentPath(location);
    navigateWithTransition(navigate, `/merchant/${merchantId}`, { state: { returnTo, sourceTab: liveSourceTabFromPath(returnTo) } });
  };

  const openRoom = (roomId: string, lotId?: string, previewMedia?: PreviewMediaSnapshot) => {
    const returnTo = liveReturnPath(location, roomId);
    navigateWithTransition(navigate, livePath(roomId, lotId, liveSourceTabFromPath(returnTo)), { state: { returnTo, previewMedia } });
  };

  return { navigate, openLot, openMerchant, openRoom };
}

function MainRoutePage({ apiClient, tab }: { apiClient: ApiClient; tab: MainTab }) {
  const user = useSessionStore((state) => state.user);
  const updateUser = useSessionStore((state) => state.updateUser);
  const [searchParams] = useSearchParams();
  const { navigate, openLot, openMerchant, openRoom } = useAppNavigation();

  return (
    <MainTabShell activeTab={tab} onTabChange={(nextTab) => navigateWithTransition(navigate, mainPath(nextTab))} t={t}>
      {tab === 'home' ? (
        <DiscoverPage apiClient={apiClient} focusRoomId={searchParams.get('focusRoomId') ?? undefined} onOpenRoom={(roomId, previewMedia) => openRoom(roomId, undefined, previewMedia)} />
      ) : tab === 'discover' ? (
        <LotDiscoveryPage apiClient={apiClient} onOpenLot={openLot} onOpenMerchant={openMerchant} />
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

function MerchantRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { merchantId = 'merchant_01' } = useParams();
  const location = useLocation() as Location<AppLocationState | null>;
  const { navigate, openLot, openRoom } = useAppNavigation();
  const returnTo = location.state?.returnTo ?? '/';
  return <MerchantPage apiClient={apiClient} merchantId={merchantId} onBack={() => navigateWithTransition(navigate, returnTo)} onOpenRoom={(roomId) => openRoom(roomId)} onOpenLot={openLot} />;
}

function ProductRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { lotId = 'lot_3001' } = useParams();
  const navigate = useNavigate();
  const location = useLocation() as Location<AppLocationState | null>;
  const returnTo = location.state?.returnTo ?? '/';
  const sourceTab = location.state?.sourceTab ?? liveSourceTabFromPath(returnTo);
  const openRoomFromProduct = (roomId: string, targetLotId: string) => {
    navigateWithTransition(navigate, livePath(roomId, targetLotId, sourceTab), {
      state: {
        returnTo: currentPath(location),
        parentReturnTo: returnTo,
        sourceTab
      }
    });
  };
  return <ProductPage apiClient={apiClient} lotId={lotId} onBack={() => navigateWithTransition(navigate, returnTo)} onOpenRoom={openRoomFromProduct} />;
}

function LiveRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { roomId = demoLiveRoom.id } = useParams();
  const [searchParams] = useSearchParams();
  const user = useSessionStore((state) => state.user);
  const profileOverride = useProfileStore((state) => state.profileOverride);
  const accessToken = useSessionStore((state) => state.accessToken);
  const navigate = useNavigate();
  const location = useLocation() as Location<AppLocationState | null>;
  const from = parseMainTab(searchParams.get('from'));
  const returnTo = location.state?.returnTo ?? fallbackLiveReturnPath(roomId, from);
  const returnState = returnTo.startsWith('/product/') && location.state?.parentReturnTo ? { returnTo: location.state.parentReturnTo, sourceTab: location.state.sourceTab } : undefined;

  return (
    <Suspense fallback={<LoadingBlock />}>
      <LazyLiveRoomPage
        apiClient={apiClient}
        roomId={roomId}
        initialLotId={searchParams.get('lotId') ?? undefined}
        initialPreviewMedia={location.state?.previewMedia}
        userId={user?.id ?? 'u1'}
        userNickname={user?.nickname}
        userAvatarUrl={profileOverride?.avatarUrl ?? user?.avatarUrl}
        accessToken={accessToken}
        onBack={() => navigateWithTransition(navigate, returnTo, returnState ? { state: returnState } : undefined)}
        onPay={(orderId) => navigateWithTransition(navigate, payPath(orderId, currentPath(location)))}
        onOpenOrder={(orderId, tab) => navigateWithTransition(navigate, ordersPath(tab, orderId))}
      />
    </Suspense>
  );
}

function ResultRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { auctionId = 'auc_2001' } = useParams();
  const navigate = useNavigate();
  return <ResultPage apiClient={apiClient} auctionId={auctionId} onBack={() => navigateWithTransition(navigate, '/')} onPay={(orderId) => navigateWithTransition(navigate, `/pay/${orderId}`)} />;
}

function PayRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { orderId = 'ord_2001' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = parsePayReturnTo(searchParams.get('returnTo'));
  const backTarget = (auctionId: string) => returnTo ?? `/result/${auctionId}`;
  return (
    <PayPage
      apiClient={apiClient}
      orderId={orderId}
      onBack={(auctionId) => navigateWithTransition(navigate, backTarget(auctionId))}
      onPaid={(paidOrder) => {
        const target = returnTo
          ? (returnTo.startsWith('/orders') ? ordersPath(orderTabFromOrder(paidOrder), paidOrder.id) : returnTo)
          : backTarget(paidOrder.auctionId);
        navigateWithTransition(navigate, target, { replace: true });
      }}
    />
  );
}

function SettingsRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const user = useSessionStore((state) => state.user);
  const updateUser = useSessionStore((state) => state.updateUser);
  const clearSession = useSessionStore((state) => state.clearSession);
  const clearActivity = useLiveActivityStore((state) => state.clearActivity);
  const navigate = useNavigate();
  const logout = ({ keepBrowsingData }: { keepBrowsingData: boolean }) => {
    if (!keepBrowsingData) {
      clearActivity();
    }
    clearSession();
    navigateWithTransition(navigate, '/login', { replace: true });
  };
  return (
    <SettingsPage
      apiClient={apiClient}
      sessionUser={user}
      onBack={() => navigateWithTransition(navigate, '/me')}
      onProfileUpdated={(profile) => updateUser({ nickname: profile.nickname, avatarUrl: profile.avatarUrl })}
      onLogout={logout}
    />
  );
}

function OrdersRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { navigate, openLot } = useAppNavigation();
  const highlightedOrderId = searchParams.get('orderId') ?? undefined;
  return (
    <OrdersPage
      apiClient={apiClient}
      activeTab={parseMyAuctionTab(searchParams.get('tab'))}
      highlightedOrderId={highlightedOrderId}
      onBack={() => navigateWithTransition(navigate, '/me')}
      onTabChange={(tab) => navigateWithTransition(navigate, ordersPath(tab))}
      onOpenLot={openLot}
      onOpenPay={(orderId) => navigateWithTransition(navigate, payPath(orderId, currentPath(location)))}
    />
  );
}

function FollowingRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { navigate, openRoom } = useAppNavigation();
  return <FollowingPage apiClient={apiClient} onBack={() => navigateWithTransition(navigate, '/me')} onOpenRoom={(roomId) => openRoom(roomId)} />;
}

function FootprintsRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const { navigate, openRoom } = useAppNavigation();
  return (
    <FootprintsPage
      apiClient={apiClient}
      onBack={() => navigateWithTransition(navigate, '/me')}
      onOpenRoom={(roomId) => openRoom(roomId)}
      onOpenLot={(lotId, returnTo) => navigateWithTransition(navigate, `/product/${lotId}`, { state: { returnTo, sourceTab: 'me' } })}
    />
  );
}

function HistoryRoutePage({ apiClient }: { apiClient: ApiClient }) {
  const navigate = useNavigate();
  return <HistoryPage apiClient={apiClient} onBack={() => navigateWithTransition(navigate, '/')} />;
}

function LoginPage({ apiClient, onLoggedIn }: { apiClient: ApiClient; onLoggedIn: (session: LoginResult) => void }) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => apiClient.login({ account, password, role: 'buyer' }),
    onSuccess: onLoggedIn
  });
  const submitLogin = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!account.trim() || !password.trim() || login.isPending) return;
    login.mutate();
  };
  const showReservedEntry = () => {
    Toast.show({ content: t('login.reservedUnavailable') });
  };

  return (
    <section className="login-page">
      <div className="login-aura is-red" aria-hidden="true" />
      <div className="login-aura is-cyan" aria-hidden="true" />
      <div className="login-hero" aria-label={t('app.title')}>
        <div className="login-brand-mark">
          <img src={logoUrl} alt={t('app.title')} />
          <span>{t('app.title')}</span>
        </div>
        <h1>{t('login.title')}</h1>
      </div>
      <form className="auth-form login-card" onSubmit={submitLogin}>
        <div className="login-card-header">
          <p className="eyebrow">{t('login.cardEyebrow')}</p>
          <h2>{t('login.cardTitle')}</h2>
        </div>
        <div className="login-field">
          <label className="field-label" htmlFor="login-account">{t('login.account')}</label>
          <input
            id="login-account"
            value={account}
            autoComplete="username"
            placeholder={t('login.accountPlaceholder')}
            onChange={(event) => setAccount(event.currentTarget.value)}
          />
        </div>
        <div className="login-field">
          <label className="field-label" htmlFor="login-password">{t('login.password')}</label>
          <input
            id="login-password"
            type="password"
            value={password}
            autoComplete="current-password"
            placeholder={t('login.passwordPlaceholder')}
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
        </div>
        {login.isError ? <p className="login-error" role="alert">{t('login.error')}</p> : null}
        <Button block size="large" type="submit" loading={login.isPending} disabled={!account.trim() || !password.trim()} className="login-submit-button">
          {t('login.submit')}
        </Button>
        <div className="login-reserved-actions" aria-label={t('login.reservedActions')}>
          <button type="button" onClick={showReservedEntry}>{t('login.register')}</button>
          <span aria-hidden="true" />
          <button type="button" onClick={showReservedEntry}>{t('login.forgotPassword')}</button>
        </div>
      </form>
    </section>
  );
}

function LotDiscoveryPage({ apiClient, onOpenLot, onOpenMerchant }: { apiClient: ApiClient; onOpenLot: (lot: LiveRoomLot) => void; onOpenMerchant: (id: string) => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [lotSort, setLotSort] = useState<LotSortKey>(() => parseLotSort(searchParams.get('sort')));
  const [lotStatus, setLotStatus] = useState<LotStatusFilter>(() => parseLotStatus(searchParams.get('status')));
  const [categoryId, setCategoryId] = useState(() => searchParams.get('categoryId') ?? 'all');
  const [controlsHidden, setControlsHidden] = useState(false);
  const lastScrollTopRef = useRef(0);
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.listCategories(), placeholderData: { items: demoCategories, total: demoCategories.length, page: 1, page_size: 20 } });
  const lots = useQuery({
    queryKey: ['discover-lots', lotSort, lotStatus, categoryId],
    queryFn: () => apiClient.searchLots({ sort: lotSort, status: lotStatus, categoryId })
  });
  const updateFilters = (nextFilters: Partial<{ sort: LotSortKey; status: LotStatusFilter; categoryId: string }>) => {
    const nextSort = nextFilters.sort ?? lotSort;
    const nextStatus = nextFilters.status ?? lotStatus;
    const nextCategoryId = nextFilters.categoryId ?? categoryId;
    setLotSort(nextSort);
    setLotStatus(nextStatus);
    setCategoryId(nextCategoryId);
    setSearchParams(discoverLotSearchParams({ sort: nextSort, status: nextStatus, categoryId: nextCategoryId }));
    setControlsHidden(false);
  };

  const handleScroll = (event: ReactUIEvent<HTMLElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    const delta = nextScrollTop - lastScrollTopRef.current;
    if (nextScrollTop <= 24) {
      setControlsHidden(false);
    } else if (delta > 8) {
      setControlsHidden(true);
    } else if (delta < -6) {
      setControlsHidden(false);
    }
    lastScrollTopRef.current = nextScrollTop;
  };

  useEffect(() => {
    setLotSort(parseLotSort(searchParams.get('sort')));
    setLotStatus(parseLotStatus(searchParams.get('status')));
    setCategoryId(searchParams.get('categoryId') ?? 'all');
    setControlsHidden(false);
    lastScrollTopRef.current = 0;
  }, [searchParams]);

  return (
    <section className={controlsHidden ? 'discover-lots-page is-controls-hidden' : 'discover-lots-page'} onScroll={handleScroll}>
      <div className="discover-lots-toolbar">
        <header className="simple-page-header discover-lots-header">
          <div>
            <h1>{t('discoverLots.title')}</h1>
          </div>
        </header>
        <FilterRow>
          <FilterSelect label={t('filter.sort')} value={lotSort} onChange={(value) => updateFilters({ sort: value as LotSortKey })} options={lotSortOptions()} />
          <FilterSelect label={t('filter.status')} value={lotStatus} onChange={(value) => updateFilters({ status: value as LotStatusFilter })} options={lotStatusOptions()} />
          <FilterSelect
            label={t('filter.category')}
            value={categoryId}
            onChange={(value) => updateFilters({ categoryId: value })}
            options={[{ value: 'all', label: t('status.all') }, ...(categories.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))]}
          />
        </FilterRow>
      </div>
      <ResultList loading={lots.isLoading} empty={!lots.data?.items.length} emptyText={t('search.empty')}>
        {(lots.data?.items ?? []).map((lot) => (
          <LotResultCard
            key={lot.id}
            lot={lot}
            onOpen={() => onOpenLot(lot)}
            onOpenMerchant={onOpenMerchant}
          />
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
        <button className="back-button" type="button" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={18} />
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
      <ResultList loading={lots.isLoading} empty={!lots.data?.items.length} emptyText={t('search.empty')}>
        {(lots.data?.items ?? []).map((lot) => (
          <LotResultCard key={lot.id} lot={lot} onOpen={() => onOpenLot(lot)} />
        ))}
      </ResultList>
    </section>
  );
}

function DiscoverPage({ apiClient, focusRoomId, onOpenRoom }: { apiClient: ApiClient; focusRoomId?: string; onOpenRoom: (roomId: string, previewMedia?: PreviewMediaSnapshot) => void }) {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const trackRef = useRef<HTMLDivElement | null>(null);
  const feedDragRef = useRef<FeedDragState>();
  const feedTouchRef = useRef<FeedDragState>();
  const feedTransitioningRef = useRef(false);
  const resetFrameRef = useRef<number>();
  const restoreFrameRef = useRef<number>();
  const dragFrameRef = useRef<number>();
  const appliedPreviewMediaKeyRef = useRef<Record<string, string>>({});
  const pendingDragOffsetRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [trackIndex, setTrackIndex] = useState(0);
  const [trackTransitionEnabled, setTrackTransitionEnabled] = useState(true);
  const previewSoundEnabled = useSharedLiveSoundPreference();
  const rooms = useQuery({
    queryKey: ['discover-live-rooms'],
    queryFn: () => apiClient.searchLiveRooms({ status: 'live', sort: 'viewerDesc' })
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

  const applyRememberedPreviewMediaPosition = useCallback((slide: FeedSlide, video: HTMLVideoElement) => {
    const remembered = readRememberedPreviewMediaSnapshot(slide.room);
    const rememberedKey = remembered ? previewMediaPositionStorageKey(remembered.roomId, remembered.sourceUrl) : undefined;
    if (!remembered || !rememberedKey || appliedPreviewMediaKeyRef.current[slide.key] === rememberedKey) return;
    if (applyInitialMediaPosition(video, remembered)) {
      appliedPreviewMediaKeyRef.current[slide.key] = rememberedKey;
    }
  }, []);

  const rememberDiscoverPreviewPosition = useCallback((room: LiveRoom, video?: HTMLVideoElement | null) => {
    const snapshot = buildPreviewMediaSnapshot(room, video);
    if (snapshot) rememberPreviewMediaSnapshot(snapshot);
    return snapshot;
  }, []);

  const syncDiscoverPreviewVideo = useCallback(
    (slide: FeedSlide, index: number) => {
      const video = videoRefs.current[slide.key];
      if (!video) return;
      const shouldPlay = index === trackIndex;
      const shouldPlayAudibly = shouldPlay && shouldDiscoverPreviewPlayAudibly(slide.room, previewSoundEnabled);
      if (shouldPlayAudibly) {
        enableAudibleVideo(video);
      } else {
        forceMutedVideo(video);
      }
      if (!shouldPlay) {
        video.pause();
        return;
      }
      applyRememberedPreviewMediaPosition(slide, video);
      void playVideo(video).then((played) => {
        if (played || !shouldPlayAudibly) return;
        forceMutedVideo(video);
        void playVideo(video);
      });
    },
    [applyRememberedPreviewMediaPosition, previewSoundEnabled, trackIndex]
  );

  useEffect(() => {
    feedSlides.forEach(syncDiscoverPreviewVideo);
  }, [feedSlides, syncDiscoverPreviewVideo]);

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
    const activeSlide = feedSlides[trackIndex];
    if (!activeSlide || activeSlide.room.id !== activeRoomId) {
      onOpenRoom(activeRoomId);
      return;
    }
    onOpenRoom(activeRoomId, rememberDiscoverPreviewPosition(activeSlide.room, videoRefs.current[activeSlide.key]));
  }, [activeRoomId, feedSlides, onOpenRoom, rememberDiscoverPreviewPosition, trackIndex]);

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
          const activeLotScheduleText = activeLot ? scheduledStartText(activeLot) : undefined;
          const isActive = slideIndex === trackIndex;
          return (
            <article className={isActive ? 'discover-slide is-active is-focused' : 'discover-slide'} aria-current={isActive ? 'true' : undefined} data-room-id={room.id} key={slide.key}>
              <video
                className="discover-video"
                src={discoverPreviewVideoUrl(room)}
                poster={room.coverUrl}
                muted={!isActive || !shouldDiscoverPreviewPlayAudibly(room, previewSoundEnabled)}
                loop
                {...mobileInlineVideoAttributes}
                preload="metadata"
                ref={(node) => {
                  videoRefs.current[slide.key] = node;
                }}
                onLoadedMetadata={() => syncDiscoverPreviewVideo(slide, slideIndex)}
                onCanPlay={() => syncDiscoverPreviewVideo(slide, slideIndex)}
                onTimeUpdate={(event) => rememberDiscoverPreviewPosition(room, event.currentTarget)}
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
                    {activeLotScheduleText ? <span className="discover-lot-schedule">{activeLotScheduleText}</span> : null}
                  </div>
                ) : null}
              </div>
              <Button
                className="discover-enter-button"
                color="primary"
                data-testid={isActive ? 'discover-enter-live' : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenRoom(room.id, isActive ? rememberDiscoverPreviewPosition(room, videoRefs.current[slide.key]) : undefined);
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

function discoverPreviewVideoUrl(room: LiveRoom): string {
  return liveRoomPreviewVideoUrl(room) ?? liveVideoFallback;
}

function shouldDiscoverPreviewPlayAudibly(room: LiveRoom, soundEnabled: boolean): boolean {
  return soundEnabled && room.videoSource !== 'digitalHuman';
}

function buildPreviewMediaSnapshot(room: LiveRoom, video?: HTMLVideoElement | null): PreviewMediaSnapshot | undefined {
  const sourceUrl = discoverPreviewVideoUrl(room);
  if (!sourceUrl || !video) return undefined;
  const currentTime = Number(video.currentTime);
  if (!Number.isFinite(currentTime) || currentTime < 0) return undefined;
  return {
    roomId: room.id,
    sourceUrl,
    currentTime,
    capturedAtMs: Date.now()
  };
}

function previewMediaPositionStorageKey(roomId: string, sourceUrl: string): string {
  return `${previewMediaPositionStoragePrefix}${encodeURIComponent(roomId)}:${encodeURIComponent(sourceUrl)}`;
}

function rememberPreviewMediaSnapshot(snapshot: PreviewMediaSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(previewMediaPositionStorageKey(snapshot.roomId, snapshot.sourceUrl), JSON.stringify(snapshot));
  } catch {
    return;
  }
}

function readRememberedPreviewMediaSnapshot(room: LiveRoom): PreviewMediaSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;
  const sourceUrl = discoverPreviewVideoUrl(room);
  if (!sourceUrl) return undefined;
  try {
    const raw = window.sessionStorage.getItem(previewMediaPositionStorageKey(room.id, sourceUrl));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<PreviewMediaSnapshot>;
    const snapshot: PreviewMediaSnapshot = {
      roomId: typeof parsed.roomId === 'string' ? parsed.roomId : '',
      sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl : '',
      currentTime: Number(parsed.currentTime),
      capturedAtMs: Number(parsed.capturedAtMs)
    };
    return isPreviewMediaSnapshotApplicable(snapshot, room, sourceUrl) ? snapshot : undefined;
  } catch {
    return undefined;
  }
}

function isPreviewMediaSnapshotApplicable(snapshot: PreviewMediaSnapshot | undefined, room: LiveRoom, sourceUrl?: string): snapshot is PreviewMediaSnapshot {
  if (!snapshot || !sourceUrl) return false;
  if (snapshot.roomId !== room.id || snapshot.sourceUrl !== sourceUrl) return false;
  if (!Number.isFinite(snapshot.currentTime) || snapshot.currentTime < 0) return false;
  return Date.now() - snapshot.capturedAtMs <= previewMediaSnapshotMaxAgeMs;
}


function applyInitialMediaPosition(video: HTMLVideoElement | null | undefined, snapshot?: PreviewMediaSnapshot): boolean {
  if (!video || !snapshot) return false;
  const baseCurrentTime = Number(snapshot.currentTime);
  if (!Number.isFinite(baseCurrentTime) || baseCurrentTime < 0) return false;
  const elapsedSeconds = Math.max(0, (Date.now() - snapshot.capturedAtMs) / 1000);
  const duration = Number(video.duration);
  const currentTime = Number.isFinite(duration) && duration > 0 ? (baseCurrentTime + elapsedSeconds) % duration : baseCurrentTime + elapsedSeconds;
  try {
    video.currentTime = currentTime;
  } catch {
    return false;
  }
  void playVideo(video);
  return true;
}

function MerchantPage({ apiClient, merchantId, onBack, onOpenRoom, onOpenLot }: { apiClient: ApiClient; merchantId: string; onBack: () => void; onOpenRoom: (roomId: string) => void; onOpenLot: (lot: LiveRoomLot) => void }) {
  const [lotSort, setLotSort] = useState<LotSortKey>('default');
  const [lotStatus, setLotStatus] = useState<LotStatusFilter>('all');
  const [categoryId, setCategoryId] = useState('all');
  const merchant = useQuery({ queryKey: ['merchant', merchantId], queryFn: () => apiClient.getMerchant(merchantId) });
  const liveSessions = useQuery({
    queryKey: ['merchant-live-sessions', merchantId],
    queryFn: () => apiClient.listMerchantLiveSessions(merchantId, { status: 'live', sort: 'openedAtDesc' })
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => apiClient.listCategories(), placeholderData: { items: demoCategories, total: demoCategories.length, page: 1, page_size: 20 } });
  const lots = useQuery({
    queryKey: ['merchant-lots', merchantId, lotSort, lotStatus, categoryId],
    queryFn: () => apiClient.searchLots({ merchantId, sort: lotSort, status: lotStatus, categoryId })
  });
  const data = merchant.data;
  const liveSession = liveSessions.data?.items[0];

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
              <Metric label={t('merchant.rating')} value="5.0" icon={<Star size={16} />} />
              <Metric label={t('merchant.location')} value={merchantCityLabel(data.location)} icon={<MapPin size={16} />} />
            </div>
          </>
        ) : (
          <LoadingBlock />
        )}
      </header>

        <div className="merchant-body">
          <div className="merchant-section-heading">
            <h2>{liveSession ? t('home.liveNow') : t('merchant.noLive')}</h2>
          </div>
          {liveSession ? <LiveRoomCard room={liveSession} onOpen={() => onOpenRoom(liveSession.id)} /> : null}

          <div className="merchant-section-heading">
            <h2>{t('merchant.allLots')}</h2>
          </div>
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
        <ResultList loading={lots.isLoading} empty={!lots.data?.items.length} emptyText={t('search.empty')}>
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
  const recordLotFootprint = useLiveActivityStore((state) => state.recordLotFootprint);
  const item = lot.data;
  const state = item ? stateFromLot(item) : undefined;
  const scheduleText = item && state ? scheduledStartText(item, state) : undefined;
  const category = categories.data?.items.find((candidate) => candidate.id === item?.categoryId);

  useEffect(() => {
    if (item) recordLotFootprint(item);
  }, [item, recordLotFootprint]);

  return (
    <section className="product-page">
      <button className="back-button" type="button" onClick={onBack} aria-label={t('common.back')}>
        <ArrowLeft size={18} />
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
              <Metric label={t('auction.increment')} value={formatMoney(minIncrementForLot(item, state))} icon={<Plus size={16} />} />
              <Metric label={t('auction.deposit')} value={formatMoney(item.depositAmount ?? 0)} icon={<WalletCards size={16} />} />
            </div>
            {scheduleText ? <div className="lot-schedule-line product-schedule-line">{scheduleText}</div> : null}
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

function LiveRoomCard({ room, onOpen }: { room: LiveRoom; onOpen: () => void }) {
  return (
    <article className="merchant-live-card">
      <button className="merchant-live-media" type="button" onClick={onOpen} aria-label={`${t('home.enterRoom')} ${room.title}`}>
        <video muted loop {...mobileInlineVideoAttributes} preload="metadata" src={discoverPreviewVideoUrl(room)} poster={room.coverUrl} />
        <span className="live-pill">{statusLabel(room.status)}</span>
      </button>
      <div className="merchant-live-body">
        <div className="merchant-live-copy">
          <h3>{room.title}</h3>
          <p>{room.merchantName}</p>
        </div>
        <div className="merchant-live-meta" aria-label={t('merchant.liveWindow')}>
          <span className="merchant-live-stat">
            <Wifi size={14} /> {t('home.online')} {formatCompactNumber(room.onlineCount)}
          </span>
          <span className="merchant-live-stat">
            <Users size={14} /> {t('home.watchers')} {formatCompactNumber(room.watcherCount)}
          </span>
        </div>
        <Button className="merchant-live-action" color="primary" size="small" onClick={onOpen}>
          {t('home.enterRoom')}
        </Button>
      </div>
    </article>
  );
}

function merchantCityLabel(location?: string): string {
  const parts = (location ?? '')
    .split(/[/／]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] ?? '-';
}

function LotResultCard({ lot, onOpen, onOpenMerchant }: { lot: LiveRoomLot; onOpen: () => void; onOpenMerchant?: (merchantId: string) => void }) {
  const state = stateFromLot(lot);
  const openFromKeyboard = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen();
  };
  return (
    <article
      className="search-result-card lot-result-card"
      role="button"
      tabIndex={0}
      aria-label={`${t('common.view')} ${lot.title}`}
      onClick={onOpen}
      onKeyDown={openFromKeyboard}
    >
      <div className="lot-media-wrap">
        <div className="result-media">
          <VisualPlaceholder title={lot.title} imageUrl={lot.imageUrl} tone="red" />
        </div>
        <div className="lot-status-line">
          <span className="status-badge">{lotStatusLabel(state.status)}</span>
        </div>
      </div>
      <div className="lot-info">
        <h3>{lot.title}</h3>
        <p>{lot.subtitle}</p>
        <div className="lot-price-line">
          <span>{priceLabel(lot, state)}</span>
          <strong>{formatMoney(priceValue(lot, state))}</strong>
        </div>
        {lot.merchantId && onOpenMerchant ? (
          <button
            className="lot-merchant-link"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMerchant(lot.merchantId ?? '');
            }}
          >
            <span className="lot-merchant-link-label">{t('product.merchant')}&gt;</span>
          </button>
        ) : null}
      </div>
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

function loopIndex(current: number, length: number, step: number): number {
  if (length <= 0) return 0;
  return (current + step + length) % length;
}

function createLoopedFeedSlides(rooms: LiveRoom[]): FeedSlide[] {
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
    { value: 'READY', label: t('auction.ready') },
    { value: 'WARMING_UP', label: t('auction.warmingUp') },
    { value: 'RUNNING', label: t('auction.running') }
  ];
}

function HistoryPage({ apiClient, onBack }: { apiClient: ApiClient; onBack: () => void }) {
  const rooms = useQuery({ queryKey: ['history-rooms'], queryFn: () => apiClient.listLiveRooms(), placeholderData: demoLiveRoomPage });
  const orders = useQuery({ queryKey: ['my-orders'], queryFn: () => apiClient.listMyOrders(), placeholderData: { items: [], total: 0, page: 1, page_size: 20 } });
  return (
    <section className="page-content">
      <button className="back-button" onClick={onBack} type="button" aria-label={t('common.back')}>
        <ArrowLeft size={18} />
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

function forceMutedVideo(video?: HTMLVideoElement | null): void {
  if (!video) return;
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
}

function enableAudibleVideo(video?: HTMLVideoElement | null): void {
  if (!video) return;
  video.muted = false;
  video.defaultMuted = false;
  video.volume = 1;
}

const liveSoundPreferenceStorageKey = 'aieas-user-live-sound-enabled';

function readSharedLiveSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(liveSoundPreferenceStorageKey) !== 'false';
  } catch {
    return true;
  }
}


function useSharedLiveSoundPreference(): boolean {
  const [enabled, setEnabled] = useState(readSharedLiveSoundEnabled);
  useEffect(() => {
    const syncPreference = () => setEnabled(readSharedLiveSoundEnabled());
    window.addEventListener('storage', syncPreference);
    window.addEventListener('focus', syncPreference);
    window.addEventListener('pageshow', syncPreference);
    return () => {
      window.removeEventListener('storage', syncPreference);
      window.removeEventListener('focus', syncPreference);
      window.removeEventListener('pageshow', syncPreference);
    };
  }, []);
  return enabled;
}

async function playVideo(video?: HTMLVideoElement | null): Promise<boolean> {
  if (!video) return false;
  try {
    await video.play();
    return true;
  } catch {
    return false;
  }
}


