import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button, Toast } from 'antd-mobile';
import { ArrowLeft, CalendarClock, Camera, Check, ChevronRight, Gavel, Heart, HeartOff, LogOut, Package, Radio, Settings, ShoppingBag, Trophy, WalletCards } from 'lucide-react';

import { LoadingBlock } from '../../components/LoadingBlock';
import { SheetHeader } from '../../components/SheetHeader';
import { VisualPlaceholder } from '../../components/VisualPlaceholder';
import { mergeAuctionRecordsWithOrders } from '../../features/account/auctionRecords';
import { formatDate, lotStatusLabel, priceLabel, priceValue, scheduledStartText, stateFromLot } from '../../features/auction/presentation';
import { createTranslator, type Locale, type MessageKey } from '../../i18n/messages';
import { t } from '../../i18n/runtime';
import { classifyAuctionRecord, groupAuctionRecords, myAuctionTabKeys } from '../../services/auctionViews';
import type { ApiClient } from '../../services/api';
import type {
  AvatarCropState,
  FollowedMerchant,
  FollowedLiveRoom,
  LiveRoomFootprint,
  LiveRoomLot,
  LoginResult,
  LotFootprint,
  MyAuctionTabKey,
  Order,
  PageResult,
  UserAuctionRecord,
  UserProfile
} from '../../services/types';
import { useLiveActivityStore } from '../../store/liveActivity';
import { usePreferencesStore } from '../../store/preferences';
import { mergeProfile, useProfileStore } from '../../store/profile';
import { formatMoney } from '../../utils/format';

const avatarScaleMin = 1;
const avatarScaleMax = 2.6;

type PointerPoint = { x: number; y: number };
type FootprintTabKey = 'rooms' | 'lots';

export function MePage({
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
  const queryClient = useQueryClient();
  const profileOverride = useProfileStore((state) => state.profileOverride);
  const setProfileOverride = useProfileStore((state) => state.setProfileOverride);
  const footprintCount = useLiveActivityStore((state) => state.footprints.length + state.lotFootprints.length);
  const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: () => apiClient.getMyProfile() });
  const followedMerchantsQuery = useQuery({ queryKey: ['my-followed-merchants'], queryFn: () => apiClient.listMyFollowedMerchants(), placeholderData: { items: [], total: 0, page: 1, page_size: 20 } });
  const recordsQuery = useQuery({ queryKey: ['my-auction-records'], queryFn: () => apiClient.listMyAuctionRecords(), placeholderData: { items: [], total: 0, page: 1, page_size: 20 }, refetchOnMount: 'always' });
  const ordersQuery = useQuery({ queryKey: ['my-orders'], queryFn: () => apiClient.listMyOrders({ limit: 100 }), placeholderData: { items: [], total: 0, page: 1, page_size: 100 }, refetchOnMount: 'always' });
  const baseProfile = profileQuery.data ?? profileFromSession(userId, sessionUser);
  const profile = mergeProfile(baseProfile, profileOverride);
  const followedCount = followedMerchantsQuery.data?.total ?? profile.followingCount;
  const mergedRecords = useMemo(() => mergeAuctionRecordsWithOrders(recordsQuery.data?.items ?? [], ordersQuery.data?.items ?? []), [ordersQuery.data?.items, recordsQuery.data?.items]);
  const groupedRecords = groupAuctionRecords(mergedRecords);
  const avatarMutation = useMutation({
    mutationFn: (avatar: File) => apiClient.uploadMyAvatar(avatar, profile),
    onSuccess: (saved) => {
      const nextProfile = mergeProfile(profile, saved);
      setProfileOverride(nextProfile);
      queryClient.setQueryData(['my-profile'], nextProfile);
      void queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      onProfileUpdated(nextProfile);
      setShowAvatarDialog(false);
    },
    onError: () => {
      Toast.show({ content: t('profile.avatarUploadError') });
    }
  });
  const statusItems = userRecordStatusItems(groupedRecords);
  const orderShortcutItems = statusItems.filter((item) => item.key !== 'all');

  return (
    <section className="me-page">
      <header className="me-hero">
        <div className="me-profile-card">
          <button className="icon-button" type="button" onClick={onSettings} aria-label={t('settings.title')}>
            <Settings size={21} />
          </button>
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

      {showAvatarDialog ? <AvatarDialog profile={profile} saving={avatarMutation.isPending} onClose={() => setShowAvatarDialog(false)} onSave={(avatar) => avatarMutation.mutate(avatar)} /> : null}
    </section>
  );
}

export function SettingsPage({
  apiClient,
  sessionUser,
  onBack,
  onProfileUpdated,
  onLogout
}: {
  apiClient: ApiClient;
  sessionUser?: LoginResult['user'];
  onBack: () => void;
  onProfileUpdated: (profile: UserProfile) => void;
  onLogout: (options: { keepBrowsingData: boolean }) => void;
}) {
  const queryClient = useQueryClient();
  const profileOverride = useProfileStore((state) => state.profileOverride);
  const setProfileOverride = useProfileStore((state) => state.setProfileOverride);
  const locale = usePreferencesStore((state) => state.locale);
  const setLocale = usePreferencesStore((state) => state.setLocale);
  const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: () => apiClient.getMyProfile() });
  const baseProfile = profileQuery.data ?? profileFromSession(sessionUser?.id ?? 'u1', sessionUser);
  const profile = mergeProfile(baseProfile, profileOverride);
  const [nickname, setNickname] = useState(profile.nickname);
  const [languageNotice, setLanguageNotice] = useState('');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  useEffect(() => {
    setNickname(profile.nickname);
  }, [profile.nickname]);

  const save = useMutation({
    mutationFn: () => apiClient.updateMyProfile({ userId: profile.userId, nickname: nickname.trim() }),
    onSuccess: (saved) => {
      const nextProfile = mergeProfile(profile, saved);
      setProfileOverride(nextProfile);
      queryClient.setQueryData(['my-profile'], nextProfile);
      void queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      onProfileUpdated(nextProfile);
      onBack();
    },
    onError: () => {
      Toast.show({ content: t('settings.saveError') });
    }
  });

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setLanguageNotice(createTranslator(nextLocale)('settings.languageSaved'));
  };

  return (
    <section className="settings-page">
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </button>
        <div>
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
      <section className="settings-card settings-logout-card">
        <div>
          <h2>{t('settings.account')}</h2>
        </div>
        <Button block color="danger" onClick={() => setShowLogoutDialog(true)}>
          <LogOut size={17} /> {t('settings.logout')}
        </Button>
      </section>
      {showLogoutDialog ? (
        <div className="logout-choice-backdrop" role="dialog" aria-modal="true" aria-label={t('settings.logoutTitle')} onClick={() => setShowLogoutDialog(false)}>
          <section className="logout-choice-panel" onClick={(event) => event.stopPropagation()}>
            <h2>{t('settings.logoutTitle')}</h2>
            <p>{t('settings.logoutMessage')}</p>
            <div className="logout-choice-actions">
              <Button block color="primary" onClick={() => onLogout({ keepBrowsingData: true })}>
                {t('settings.logoutKeepData')}
              </Button>
              <Button block color="danger" fill="outline" onClick={() => onLogout({ keepBrowsingData: false })}>
                {t('settings.logoutClearData')}
              </Button>
              <button className="logout-cancel-button" type="button" onClick={() => setShowLogoutDialog(false)}>
                {t('settings.logoutCancel')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function OrdersPage({
  apiClient,
  activeTab,
  highlightedOrderId,
  onBack,
  onTabChange,
  onOpenLot,
  onOpenPay
}: {
  apiClient: ApiClient;
  activeTab: MyAuctionTabKey;
  highlightedOrderId?: string;
  onBack: () => void;
  onTabChange: (tab: MyAuctionTabKey) => void;
  onOpenLot: (lot: LiveRoomLot) => void;
  onOpenPay: (orderId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [receiptTarget, setReceiptTarget] = useState<UserAuctionRecord | null>(null);
  const recordsQuery = useQuery({ queryKey: ['my-auction-records'], queryFn: () => apiClient.listMyAuctionRecords(), placeholderData: { items: [], total: 0, page: 1, page_size: 20 }, refetchOnMount: 'always' });
  const ordersQuery = useQuery({ queryKey: ['my-orders', activeTab], queryFn: () => apiClient.listMyOrders(orderListOptionsForTab(activeTab)), placeholderData: { items: [], total: 0, page: 1, page_size: 100 }, refetchOnMount: 'always' });
  const confirmReceipt = useMutation({
    mutationFn: (orderId: string) => apiClient.confirmReceipt(orderId),
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData<PageResult<UserAuctionRecord>>(['my-auction-records'], (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((record) => (record.order?.id === updatedOrder.id ? { ...record, order: updatedOrder } : record))
        };
      });
      queryClient.setQueryData<PageResult<Order>>(['my-orders', activeTab], (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
        };
      });
      queryClient.setQueryData<Order>(['order', updatedOrder.id], updatedOrder);
      setReceiptTarget(null);
      Toast.show({ content: t('orders.receiptSuccess') });
    },
    onError: () => {
      Toast.show({ content: t('orders.receiptError') });
    }
  });
  const mergedRecords = useMemo(() => mergeAuctionRecordsWithOrders(recordsQuery.data?.items ?? [], ordersQuery.data?.items ?? []), [ordersQuery.data?.items, recordsQuery.data?.items]);
  const groupedRecords = groupAuctionRecords(mergedRecords);

  useEffect(() => {
    if (!highlightedOrderId) return undefined;
    const timer = window.setTimeout(() => {
      document.querySelector(`[data-order-id="${highlightedOrderId}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, highlightedOrderId, groupedRecords]);

  return (
    <section className="orders-page">
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </button>
        <div>
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
      <ResultList loading={recordsQuery.isLoading || ordersQuery.isLoading} empty={!groupedRecords[activeTab].length}>
        {groupedRecords[activeTab].map((record) => {
          const order = record.order;
          return (
            <AuctionRecordCard
              key={record.id}
              record={record}
              highlighted={Boolean(order?.id && order.id === highlightedOrderId)}
              onOpen={() => onOpenLot(record.lot)}
              onPay={order ? () => onOpenPay(order.id) : undefined}
              onConfirmReceipt={order ? () => setReceiptTarget(record) : undefined}
              confirmingReceipt={confirmReceipt.isPending && confirmReceipt.variables === order?.id}
            />
          );
        })}
      </ResultList>
      {receiptTarget?.order ? (
        <div className="receipt-confirm-backdrop" role="dialog" aria-modal="true" aria-label={t('orders.confirmReceiptTitle')}>
          <div className="receipt-confirm-panel">
            <h2>{t('orders.confirmReceiptTitle')}</h2>
            <p>{t('orders.confirmReceiptMessage')}</p>
            <div className="receipt-confirm-lot">
              <span>{receiptTarget.lot.title}</span>
              <strong>{formatMoney(receiptTarget.order.amount)}</strong>
            </div>
            <div className="receipt-confirm-actions">
              <Button block color="danger" loading={confirmReceipt.isPending} onClick={() => confirmReceipt.mutate(receiptTarget.order?.id ?? '')}>
                {t('orders.confirmReceipt')}
              </Button>
              <Button block className="logout-cancel-button" disabled={confirmReceipt.isPending} onClick={() => setReceiptTarget(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function FollowingPage({ apiClient, onBack, onOpenRoom }: { apiClient: ApiClient; onBack: () => void; onOpenRoom: (roomId: string) => void }) {
  const queryClient = useQueryClient();
  const followedMerchants = useQuery({ queryKey: ['my-followed-merchants'], queryFn: () => apiClient.listMyFollowedMerchants(), placeholderData: { items: [], total: 0, page: 1, page_size: 20 }, refetchOnMount: 'always' });
  const unfollowMerchant = useMutation({
    mutationFn: (merchantId: string) => apiClient.unfollowMerchant(merchantId),
    onSuccess: (merchant) => {
      queryClient.setQueryData(['merchant', merchant.id], merchant);
      void queryClient.invalidateQueries({ queryKey: ['my-followed-merchants'] });
      void queryClient.invalidateQueries({ queryKey: ['merchant', merchant.id] });
    },
    onError: () => {
      Toast.show({ content: t('state.error') });
    }
  });
  const follows = followedMerchants.data?.items ?? [];

  return (
    <section className="activity-page following-page">
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>{t('profile.followingTitle')}</h1>
        </div>
      </header>
      {follows.length ? (
        <div className="activity-room-list">
          {follows.map((follow) => {
            const item = followedMerchantToActivityRoom(follow);
            return (
              <LiveActivityRoomCard
                key={follow.merchant.id}
                item={item}
                variant="following"
                timeLabel={t('profile.followedAt')}
                timeValue={follow.followedAt}
                primaryAction={t('profile.enterLiveRoom')}
                onPrimary={() => (item.roomId ? onOpenRoom(item.roomId) : Toast.show({ content: t('merchant.noLive') }))}
                secondaryAction={t('profile.cancelFollow')}
                onSecondary={() => unfollowMerchant.mutate(follow.merchant.id)}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState text={t('profile.noFollowing')} />
      )}
    </section>
  );
}

export function FootprintsPage({
  apiClient,
  onBack,
  onOpenRoom,
  onOpenLot
}: {
  apiClient: ApiClient;
  onBack: () => void;
  onOpenRoom: (roomId: string) => void;
  onOpenLot: (lotId: string, returnTo: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageRef = useRef<HTMLElement | null>(null);
  const coverHydrationRequestedRef = useRef<Set<string>>(new Set());
  const footprints = useLiveActivityStore((state) => state.footprints);
  const lotFootprints = useLiveActivityStore((state) => state.lotFootprints);
  const getFootprintsPage = useLiveActivityStore((state) => state.getFootprintsPage);
  const getLotFootprintsPage = useLiveActivityStore((state) => state.getLotFootprintsPage);
  const updateFootprintCover = useLiveActivityStore((state) => state.updateFootprintCover);
  const [activeTab, setActiveTab] = useState<FootprintTabKey>(() => parseFootprintTab(searchParams.get('tab')));
  const [visibleRoomCount, setVisibleRoomCount] = useState(() => parseFootprintCountParam(searchParams.get('visibleRooms'), 10));
  const [visibleLotCount, setVisibleLotCount] = useState(() => parseFootprintCountParam(searchParams.get('visibleLots'), 10));
  const restoreScrollTop = parseFootprintCountParam(searchParams.get('scroll'), 0);
  const visibleRoomFootprints = getFootprintsPage(0, visibleRoomCount);
  const visibleLotFootprints = getLotFootprintsPage(0, visibleLotCount);
  const canLoadMoreRooms = visibleRoomCount < footprints.length;
  const canLoadMoreLots = visibleLotCount < lotFootprints.length;
  const canLoadMore = activeTab === 'rooms' ? canLoadMoreRooms : canLoadMoreLots;
  const querySignature = searchParams.toString();

  useEffect(() => {
    setActiveTab(parseFootprintTab(searchParams.get('tab')));
    setVisibleRoomCount(parseFootprintCountParam(searchParams.get('visibleRooms'), 10));
    setVisibleLotCount(parseFootprintCountParam(searchParams.get('visibleLots'), 10));
  }, [querySignature, searchParams]);

  useLayoutEffect(() => {
    if (!restoreScrollTop || !pageRef.current) return;
    pageRef.current.scrollTop = restoreScrollTop;
  }, [restoreScrollTop, activeTab, visibleRoomCount, visibleLotCount]);

  useEffect(() => {
    if (activeTab !== 'rooms') return;
    visibleRoomFootprints.forEach((room) => {
      if (room.coverUrl || coverHydrationRequestedRef.current.has(room.roomId)) return;
      coverHydrationRequestedRef.current.add(room.roomId);
      void apiClient
        .getLiveRoom(room.roomId)
        .then(async (freshRoom) => {
          if (freshRoom.coverUrl) {
            updateFootprintCover(room.roomId, freshRoom.coverUrl);
            return;
          }
          const lots = await apiClient.listLiveRoomLots(room.roomId);
          const fallbackCoverUrl = firstLotCoverUrl(lots.items);
          if (fallbackCoverUrl) updateFootprintCover(room.roomId, fallbackCoverUrl);
        })
        .catch(() => undefined);
    });
  }, [activeTab, apiClient, updateFootprintCover, visibleRoomFootprints]);

  const switchTab = (nextTab: FootprintTabKey) => {
    setActiveTab(nextTab);
    const nextParams = new URLSearchParams();
    if (nextTab === 'lots') {
      nextParams.set('tab', 'lots');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const buildReturnPath = () => {
    const params = new URLSearchParams();
    if (activeTab === 'lots') {
      params.set('tab', 'lots');
    }
    if (visibleRoomCount > 10) {
      params.set('visibleRooms', String(visibleRoomCount));
    }
    if (visibleLotCount > 10) {
      params.set('visibleLots', String(visibleLotCount));
    }
    const scrollTop = Math.max(0, Math.round(pageRef.current?.scrollTop ?? 0));
    if (scrollTop) {
      params.set('scroll', String(scrollTop));
    }
    const query = params.toString();
    return query ? `/footprints?${query}` : '/footprints';
  };

  const openLotFootprint = (lotId: string) => {
    onOpenLot(lotId, buildReturnPath());
  };

  const loadMore = () => {
    if (activeTab === 'rooms') {
      setVisibleRoomCount((count) => Math.min(count + 10, footprints.length));
      return;
    }
    setVisibleLotCount((count) => Math.min(count + 10, lotFootprints.length));
  };

  const handleScroll = (event: ReactUIEvent<HTMLElement>) => {
    const target = event.currentTarget;
    if (!canLoadMore || target.scrollHeight - target.scrollTop - target.clientHeight > 32) return;
    loadMore();
  };

  return (
    <section ref={pageRef} className="activity-page footprint-page" onScroll={handleScroll}>
      <header className="simple-page-header">
        <button className="back-button" type="button" onClick={onBack} aria-label={t('common.back')}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1>{t('profile.footprintTitle')}</h1>
        </div>
      </header>
      <div className="footprint-tabs" role="tablist" aria-label={t('profile.footprintTitle')}>
        <button className={activeTab === 'rooms' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'rooms'} onClick={() => switchTab('rooms')}>
          {t('profile.liveRoomFootprints')}
        </button>
        <button className={activeTab === 'lots' ? 'is-active' : ''} type="button" role="tab" aria-selected={activeTab === 'lots'} onClick={() => switchTab('lots')}>
          {t('profile.lotFootprints')}
        </button>
      </div>
      {activeTab === 'rooms' ? (
        visibleRoomFootprints.length ? (
          <div className="activity-room-list">
            {visibleRoomFootprints.map((room) => (
              <LiveActivityRoomCard
                key={room.roomId}
                item={room}
                timeLabel={t('profile.viewedAt')}
                timeValue={room.viewedAt}
                primaryAction={t('profile.enterLiveRoom')}
                primaryActionClassName="is-red-outline"
                actionAlign="right"
                onPrimary={() => onOpenRoom(room.roomId)}
              />
            ))}
            {canLoadMoreRooms ? (
              <button className="load-more-button" type="button" onClick={loadMore}>
                {t('profile.loadMore')}
              </button>
            ) : null}
          </div>
        ) : (
          <EmptyState text={t('profile.noFootprints')} />
        )
      ) : visibleLotFootprints.length ? (
        <div className="activity-room-list">
          {visibleLotFootprints.map((lot) => (
            <LiveActivityLotCard key={lot.lotId} item={lot} onOpen={() => openLotFootprint(lot.lotId)} />
          ))}
          {canLoadMoreLots ? (
            <button className="load-more-button" type="button" onClick={loadMore}>
              {t('profile.loadMore')}
            </button>
          ) : null}
        </div>
      ) : (
        <EmptyState text={t('profile.noLotFootprints')} />
      )}
    </section>
  );
}

function ResultList({ loading, empty, children }: { loading: boolean; empty: boolean; children: ReactNode }) {
  if (loading) return <LoadingBlock />;
  if (empty) return <EmptyState text={t('search.empty')} />;
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

function AuctionRecordCard({
  record,
  highlighted,
  onOpen,
  onPay,
  onConfirmReceipt,
  confirmingReceipt
}: {
  record: UserAuctionRecord;
  highlighted?: boolean;
  onOpen: () => void;
  onPay?: () => void;
  onConfirmReceipt?: () => void;
  confirmingReceipt?: boolean;
}) {
  const state = stateFromLot(record.lot);
  const recordTab = classifyAuctionRecord(record) ?? 'all';
  const canPay = recordTab === 'pendingPay' && onPay;
  const canConfirmReceipt = recordTab === 'pendingReceipt' && record.order?.fulfillmentStatus === 'SHIPPED' && onConfirmReceipt;

  return (
    <article className={highlighted ? 'search-result-card record-card is-highlighted' : 'search-result-card record-card'} data-testid={record.order ? `order-record-${record.order.id}` : undefined} data-order-id={record.order?.id}>
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
        {scheduledStartText(record.lot, state) ? <div className="lot-schedule-line">{scheduledStartText(record.lot, state)}</div> : null}
        <div className="result-meta">
          <span>{priceLabel(record.lot, state)} {formatMoney(priceValue(record.lot, state))}</span>
        </div>
      </div>
      {canPay ? (
        <Button size="small" color="danger" onClick={onPay}>
          {t('profile.payNow')}
        </Button>
      ) : canConfirmReceipt ? (
        <Button size="small" color="danger" loading={confirmingReceipt} onClick={onConfirmReceipt}>
          {t('orders.confirmReceipt')}
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
  onSave: (avatar: File) => void;
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
    if (!selectedUrl || event.pointerType === 'touch') return;
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
    if (!selectedUrl || saving) return;
    try {
      const avatar = await renderCroppedAvatar(selectedUrl, crop);
      onSave(avatar);
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
              <Button color="primary" loading={saving} disabled={saving} onClick={confirm}>
                <Check size={16} /> {t('profile.useAvatar')}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function followedMerchantToActivityRoom(follow: FollowedMerchant): FollowedLiveRoom {
  const merchant = follow.merchant;
  const room = merchant.currentLiveSession;
  return {
    roomId: merchant.liveRoomId ?? room?.id ?? '',
    title: room?.title ?? merchant.name,
    merchantName: merchant.name,
    coverUrl: room?.coverUrl ?? merchant.avatarUrl,
    followedAt: follow.followedAt
  };
}

function firstLotCoverUrl(lots: LiveRoomLot[]): string | undefined {
  for (const lot of lots) {
    if (lot.imageUrl) return lot.imageUrl;
    const firstImageUrl = lot.imageUrls?.[0];
    if (firstImageUrl) return firstImageUrl;
  }
  return undefined;
}

function LiveActivityRoomCard({
  item,
  timeLabel,
  timeValue,
  primaryAction,
  onPrimary,
  secondaryAction,
  onSecondary,
  primaryActionClassName,
  actionAlign = 'inline',
  variant = 'default'
}: {
  item: FollowedLiveRoom | LiveRoomFootprint;
  timeLabel: string;
  timeValue: string;
  primaryAction: string;
  onPrimary: () => void;
  secondaryAction?: string;
  onSecondary?: () => void;
  primaryActionClassName?: string;
  actionAlign?: 'inline' | 'right';
  variant?: 'default' | 'following';
}) {
  const isFollowingVariant = variant === 'following';
  const cardClassName = [
    'activity-room-card',
    actionAlign === 'right' ? 'is-action-right' : '',
    isFollowingVariant ? 'is-following' : '',
    isFollowingVariant ? 'is-following-card' : ''
  ].filter(Boolean).join(' ');

  return (
    <article className={cardClassName}>
      <button className="activity-room-cover" type="button" onClick={onPrimary}>
        <VisualPlaceholder title={item.title} imageUrl={item.coverUrl} tone="blue" />
      </button>
      <div className="activity-room-body">
        {isFollowingVariant ? (
          <div className="activity-room-meta-row">
            <span className="following-room-chip">
              <Radio size={13} aria-hidden="true" />
              {t('merchant.liveWindow')}
            </span>
            <span className="following-status-pill">
              <Heart size={12} aria-hidden="true" />
              {t('live.followed')}
            </span>
          </div>
        ) : null}
        <h2>{item.title}</h2>
        <p>{item.merchantName}</p>
        <span className={isFollowingVariant ? 'activity-room-time' : undefined}>
          {isFollowingVariant ? <CalendarClock size={14} aria-hidden="true" /> : null}
          {timeLabel} {formatDate(timeValue)}
        </span>
        <div className="activity-room-actions">
          <Button className={primaryActionClassName ? `activity-primary-action ${primaryActionClassName}` : 'activity-primary-action'} size="small" color="primary" onClick={onPrimary}>
            {isFollowingVariant ? <Radio size={16} aria-hidden="true" /> : null}
            {primaryAction}
          </Button>
          {secondaryAction && onSecondary ? (
            <Button className="activity-secondary-action" size="small" fill="outline" onClick={onSecondary}>
              {isFollowingVariant ? <HeartOff size={15} aria-hidden="true" /> : null}
              {secondaryAction}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LiveActivityLotCard({ item, onOpen }: { item: LotFootprint; onOpen: () => void }) {
  return (
    <article className="activity-room-card activity-lot-card is-action-right">
      <button className="activity-room-cover" type="button" onClick={onOpen}>
        <VisualPlaceholder title={item.title} imageUrl={item.imageUrl} tone="gold" />
      </button>
      <div>
        <h2>{item.title}</h2>
        {item.description ? <p>{item.description}</p> : null}
        <span>{t('profile.viewedAt')} {formatDate(item.viewedAt)}</span>
        <div className="activity-room-actions">
          <Button className="activity-primary-action is-red-outline" size="small" color="primary" onClick={onOpen}>
            {t('profile.viewLot')}
          </Button>
        </div>
      </div>
    </article>
  );
}

function parseFootprintTab(value: string | null): FootprintTabKey {
  return value === 'lots' ? 'lots' : 'rooms';
}

function parseFootprintCountParam(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
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

function orderListOptionsForTab(tab: MyAuctionTabKey) {
  const base = { limit: 100 };
  if (tab === 'pendingPay') return { ...base, payStatus: 'UNPAID' };
  if (tab === 'pendingShipment') return { ...base, status: 'PAID', fulfillmentStatus: 'UNSHIPPED' as const };
  if (tab === 'pendingReceipt') return { ...base, status: 'PAID', fulfillmentStatus: 'SHIPPED' as const };
  if (tab === 'completed') return { ...base, status: 'PAID', fulfillmentStatus: 'RECEIVED' as const };
  return base;
}

function avatarTransformStyle(crop: AvatarCropState, ratio = 1) {
  return {
    transform: `translate(-50%, -50%) translate(${crop.offsetX * ratio}px, ${crop.offsetY * ratio}px) scale(${crop.scale})`
  };
}

async function renderCroppedAvatar(imageUrl: string, crop: AvatarCropState): Promise<File> {
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
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
  return new File([blob], `avatar-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  if (!canvas.toBlob) {
    return Promise.resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        try {
          resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('avatar encode failed'));
        }
      },
      type,
      quality
    );
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, payload] = dataUrl.split(',');
  if (!meta || !payload || !meta.startsWith('data:')) throw new Error('invalid avatar data url');
  const mimeMatch = /^data:([^;]+);base64$/.exec(meta);
  if (!mimeMatch) throw new Error('invalid avatar mime type');
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeMatch[1] });
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
