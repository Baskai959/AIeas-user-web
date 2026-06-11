import {
  demoAuctionState,
  demoEnrollResult,
  demoLiveRoomPage,
  demoLoginResult,
  demoOrderPage,
  findDemoLiveRoomStats,
  findDemoLot,
  findDemoLiveRoom,
  findDemoLotByAuctionId,
  findDemoMerchant,
  findDemoOrder,
  getDemoUserProfile,
  listDemoCategories,
  listDemoAuctionRecords,
  listDemoRanking,
  listDemoLots,
  searchDemoLiveRooms,
  searchDemoLots,
  updateDemoUserAvatar,
  updateDemoUserProfile
} from './mockData';
import { defaultDigitalHumanMedia } from './digitalHuman';
import type {
  AuctionState,
  Category,
  EnrollResult,
  ListOrderOptions,
  LiveRoom,
  LiveRoomLot,
  LiveRoomStats,
  LoginRequest,
  LoginResult,
  Merchant,
  Order,
  PageResult,
  RankingSnapshotItem,
  RefreshResult,
  SearchLiveRoomsOptions,
  SearchLotsOptions,
  UserAuctionRecord,
  UserProfile
} from './types';

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  trace_id: string;
}

type Fetcher = typeof fetch;
type RequestOptions = { method?: string; body?: unknown; idempotencyKey?: string; omitAuth?: boolean; skipAuthRefresh?: boolean };

interface AuthRefreshOptions {
  getRefreshToken: () => string;
  onAccessTokenRefreshed?: (result: RefreshResult) => void;
  onRefreshFailed?: () => void;
}

const defaultFetcher: Fetcher = (...args: Parameters<Fetcher>) => fetch(...args);

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly traceId?: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function toMs(value: unknown, fallback = Date.now() + 180_000): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function optionalNumberString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === 0) return undefined;
  return String(value);
}

function normalizeDigitalHuman(value: unknown): LiveRoom['digitalHuman'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const idleVideoUrl = optionalString(raw.idleVideoUrl);
  const speakingVideoUrl = optionalString(raw.speakingVideoUrl);
  if (!idleVideoUrl || !speakingVideoUrl) return undefined;
  return {
    idleVideoUrl,
    speakingVideoUrl,
    ttsWsUrl: optionalString(raw.ttsWsUrl)
  };
}

function normalizeVideoSource(value: unknown): LiveRoom['videoSource'] | undefined {
  return value === 'recorded' || value === 'digitalHuman' ? value : undefined;
}

function normalizeAIAssistantEnabled(raw: Record<string, unknown>): boolean | undefined {
  const value = raw.aiAssistantEnabled ?? raw.digitalHumanEnabled;
  if (typeof value === 'boolean') return value;
  const videoSource = normalizeVideoSource(raw.videoSource);
  if (videoSource === 'digitalHuman') return true;
  if (videoSource === 'recorded') return false;
  return undefined;
}

function normalizePage<T>(data: unknown, itemKey: string, normalizer: (raw: Record<string, unknown>) => T): PageResult<T> {
  const source = (data ?? {}) as Record<string, unknown>;
  const items = Array.isArray(source[itemKey]) ? (source[itemKey] as Record<string, unknown>[]) : [];
  return {
    items: items.map(normalizer),
    total: Number(source.total ?? items.length),
    page: Number(source.page ?? 1),
    page_size: Number(source.page_size ?? items.length ?? 20)
  };
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

function optionalFiniteCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.floor(parsed));
}

function normalizeLiveRoom(raw: Record<string, unknown>): LiveRoom {
  const id = String(raw.id);
  const merchantId = String(raw.merchantId ?? '');
  const aiAssistantEnabled = normalizeAIAssistantEnabled(raw);
  const videoSource = normalizeVideoSource(raw.videoSource) ?? (aiAssistantEnabled === true ? 'digitalHuman' : aiAssistantEnabled === false ? 'recorded' : undefined);
  const digitalHuman = normalizeDigitalHuman(raw.digitalHuman) ?? (videoSource === 'digitalHuman' ? defaultDigitalHumanMedia : undefined);
  const onlineCount = optionalFiniteCount(firstDefined(raw.onlineCount, raw.online_count, raw.online, raw.viewerCount, raw.viewer_count, raw.audienceCount, raw.audience_count));
  const watcherCount = optionalFiniteCount(firstDefined(raw.watcherCount, raw.watcher_count, raw.viewerTotal, raw.viewer_total, raw.viewerCount, raw.viewer_count, raw.audienceCount, raw.audience_count));
  return {
    id,
    title: String(raw.title),
    description: optionalString(raw.description),
    merchantId,
    merchantName: optionalString(raw.merchantName) ?? merchantId,
    status: String(raw.status) as LiveRoom['status'],
    videoSource,
    coverUrl: optionalString(raw.coverUrl),
    videoUrl: optionalString(raw.videoUrl),
    digitalHuman,
    aiAssistantEnabled,
    onlineCount: onlineCount ?? 0,
    watcherCount: watcherCount ?? 0,
    likeCount: raw.likeCount === undefined ? undefined : Number(raw.likeCount),
    activeAuctionId: optionalNumberString(raw.activeAuctionId),
    liveSessionId: Number(raw.id),
    startedAt: optionalString(raw.openedAt) ?? optionalString(raw.scheduledStartTime),
    endedAt: optionalString(raw.closedAt)
  };
}

function normalizeLot(raw: Record<string, unknown>): LiveRoomLot {
  const auctionId = String(raw.auctionId);
  const startPrice = Number(raw.startPrice ?? 0);
  const currentPrice = Number(raw.currentPrice ?? raw.dealPrice ?? startPrice);
  const imageUrls = Array.isArray(raw.imageUrls) ? raw.imageUrls : [];
  const normalizedImageUrls = imageUrls.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  const ruleSnapshot = normalizeRuleSnapshot(raw);
  return {
    id: auctionId,
    auctionId,
    roomId: raw.liveSessionId === undefined ? '' : String(raw.liveSessionId),
    merchantId: raw.sellerId === undefined ? undefined : String(raw.sellerId),
    merchantName: optionalString(raw.merchantName ?? raw.merchant_name ?? raw.sellerName ?? raw.seller_name),
    categoryId: raw.categoryId === undefined ? undefined : String(raw.categoryId),
    title: String(raw.title),
    subtitle: optionalString(raw.subtitle),
    description: optionalString(raw.description),
    imageUrl: optionalString(raw.imageUrl) ?? optionalString(raw.coverUrl) ?? normalizedImageUrls[0],
    imageUrls: normalizedImageUrls.length ? normalizedImageUrls.slice(0, 5) : undefined,
    status: String(raw.status) as LiveRoomLot['status'],
    startPrice,
    currentPrice,
    finalPrice: raw.dealPrice === undefined ? undefined : Number(raw.dealPrice),
    leaderBidderId: optionalString(raw.leaderBidderId),
    startTsMs: raw.startTime === undefined ? undefined : toMs(raw.startTime),
    endTsMs: toMs(raw.endTime),
    ruleSnapshot,
    depositAmount: raw.depositAmount === undefined ? undefined : Number(raw.depositAmount),
    participantCount: raw.participantCount === undefined ? undefined : Number(raw.participantCount),
    bidCount: raw.bidCount === undefined ? undefined : Number(raw.bidCount),
    publishedAt: optionalString(raw.createdAt)
  };
}

function normalizeRuleSnapshot(raw: Record<string, unknown>): NonNullable<LiveRoomLot['ruleSnapshot']> {
  const snapshot = raw.ruleSnapshot && typeof raw.ruleSnapshot === 'object' ? (raw.ruleSnapshot as Record<string, unknown>) : {};
  const incrementRule =
    snapshot.incrementRule && typeof snapshot.incrementRule === 'object'
      ? (snapshot.incrementRule as NonNullable<LiveRoomLot['ruleSnapshot']>['incrementRule'])
      : raw.incrementRule && typeof raw.incrementRule === 'object'
        ? (raw.incrementRule as NonNullable<LiveRoomLot['ruleSnapshot']>['incrementRule'])
        : undefined;
  return {
    ...snapshot,
    startPrice: Number(snapshot.startPrice ?? raw.startPrice ?? 0),
    reservePrice: Number(snapshot.reservePrice ?? raw.reservePrice ?? 0),
    capPrice: Number(snapshot.capPrice ?? raw.capPrice ?? 0) || undefined,
    incrementRule,
    antiSnipingSec: Number(snapshot.antiSnipingSec ?? snapshot.antiSnipeSec ?? raw.antiSnipingSec ?? raw.antiSnipeSec ?? 0) || undefined,
    antiExtendSec: Number(snapshot.antiExtendSec ?? snapshot.extendSec ?? snapshot.extensionSec ?? raw.antiExtendSec ?? raw.extendSec ?? raw.extensionSec ?? 0) || undefined,
    depositPolicy:
      snapshot.depositPolicy && typeof snapshot.depositPolicy === 'object'
        ? (snapshot.depositPolicy as NonNullable<LiveRoomLot['ruleSnapshot']>['depositPolicy'])
        : raw.depositAmount === undefined
          ? undefined
          : { amount: Number(raw.depositAmount) }
  };
}

function normalizeCategory(raw: Record<string, unknown>): Category {
  return {
    id: String(raw.id),
    name: String(raw.name),
    iconName: optionalString(raw.iconName)
  };
}

function normalizeMerchant(raw: Record<string, unknown>): Merchant {
  const id = String(raw.id);
  return {
    id,
    name: String(raw.name),
    avatarUrl: optionalString(raw.avatarUrl),
    description: optionalString(raw.description),
    followerCount: Number(raw.followerCount ?? 0),
    fansCount: raw.fansCount === undefined ? undefined : Number(raw.fansCount),
    rating: raw.rating === undefined ? undefined : Number(raw.rating),
    location: optionalString(raw.location)
  };
}

function normalizeStats(raw: Record<string, unknown>): LiveRoomStats {
  const onlineCount = optionalFiniteCount(firstDefined(raw.online, raw.onlineCount, raw.online_count, raw.viewerCount, raw.viewer_count, raw.audienceCount, raw.audience_count));
  const watcherCount = optionalFiniteCount(firstDefined(raw.viewerTotal, raw.viewer_total, raw.watcherCount, raw.watcher_count, raw.viewerCount, raw.viewer_count, raw.audienceCount, raw.audience_count));
  return {
    roomId: String(raw.liveSessionId),
    onlineCount: onlineCount ?? Number.NaN,
    watcherCount: watcherCount ?? Number.NaN,
    bidCount: Number(raw.bidCount ?? 0),
    gmvCent: raw.gmvCent === undefined ? undefined : Number(raw.gmvCent)
  };
}

function normalizeState(raw: Record<string, unknown>): AuctionState {
  return {
    auctionId: String(raw.auctionId),
    status: String(raw.status) as AuctionState['status'],
    currentPrice: Number(raw.currentPrice ?? 0),
    leaderBidderId: raw.leaderBidderId === undefined ? undefined : String(raw.leaderBidderId),
    bidCount: raw.bidCount === undefined ? undefined : Number(raw.bidCount),
    participantCount: raw.participantCount === undefined ? undefined : Number(raw.participantCount),
    endTsMs: toMs(raw.endTime),
    serverTsMs: toMs(raw.serverTime, Date.now())
  };
}

function normalizeOrderLotSnapshot(value: unknown): Order['lotSnapshot'] {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const imageUrls = Array.isArray(raw.imageUrls) ? raw.imageUrls.map(String).filter(Boolean) : undefined;
  return {
    auctionId: raw.auctionId === undefined ? undefined : String(raw.auctionId),
    liveSessionId: raw.liveSessionId === undefined ? undefined : String(raw.liveSessionId),
    sellerId: raw.sellerId === undefined ? undefined : String(raw.sellerId),
    winnerId: raw.winnerId === undefined ? undefined : String(raw.winnerId),
    title: optionalString(raw.title),
    description: optionalString(raw.description),
    category: optionalString(raw.category),
    brand: optionalString(raw.brand),
    condition: optionalString(raw.condition),
    coverUrl: optionalString(raw.coverUrl),
    imageUrls,
    startPrice: raw.startPrice === undefined ? undefined : Number(raw.startPrice),
    dealPrice: raw.dealPrice === undefined ? undefined : Number(raw.dealPrice),
    depositAmount: raw.depositAmount === undefined ? undefined : Number(raw.depositAmount),
    closedAt: optionalString(raw.closedAt)
  };
}

function normalizeStatusToken(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeOrderStatus(value: unknown): Order['status'] {
  const token = normalizeStatusToken(value);
  if (['DEAL', 'DEALT', 'PENDING_PAY', 'PENDING_PAYMENT', 'UNPAID', '成交', '待付款', '待支付'].includes(token)) return 'CREATED';
  if (['SHIPPED', 'DELIVERED', 'PENDING_RECEIPT', '待收货', '已发货'].includes(token)) return 'PAID';
  if (['RECEIVED', 'COMPLETED', 'FINISHED', 'DONE', '已完成', '完成'].includes(token)) return 'PAID';
  if (['PENDING_SHIPMENT', 'PENDING_SHIP', 'UNSHIPPED', '待发货'].includes(token)) return 'PAID';
  return String(value ?? '');
}

function normalizeOrderPayStatus(value: unknown, status: Order['status']): string | undefined {
  if (value !== undefined && value !== null && value !== '') {
    const token = normalizeStatusToken(value);
    if (['PENDING', 'PENDING_PAY', 'PENDING_PAYMENT', 'CREATED', '待付款', '待支付'].includes(token)) return 'UNPAID';
    if (['PAID', 'SHIPPED', 'DELIVERED', 'RECEIVED', 'COMPLETED', '待发货', '待收货', '已发货', '已完成'].includes(token)) return 'PAID';
    return String(value);
  }
  if (status === 'CREATED') return 'UNPAID';
  if (status === 'PAID') return 'PAID';
  return undefined;
}

function normalizeOrderFulfillmentStatus(value: unknown, statusSource: unknown): Order['fulfillmentStatus'] | undefined {
  const token = normalizeStatusToken(value);
  if (['UNSHIPPED', 'PENDING_SHIPMENT', 'PENDING_SHIP', '待发货'].includes(token)) return 'UNSHIPPED';
  if (['SHIPPED', 'DELIVERED', 'PENDING_RECEIPT', '待收货', '已发货'].includes(token)) return 'SHIPPED';
  if (['RECEIVED', 'COMPLETED', 'FINISHED', 'DONE', '已完成', '完成'].includes(token)) return 'RECEIVED';
  const statusToken = normalizeStatusToken(statusSource);
  if (['SHIPPED', 'DELIVERED', 'PENDING_RECEIPT', '待收货', '已发货'].includes(statusToken)) return 'SHIPPED';
  if (['RECEIVED', 'COMPLETED', 'FINISHED', 'DONE', '已完成', '完成'].includes(statusToken)) return 'RECEIVED';
  if (['PAID', 'PENDING_SHIPMENT', 'PENDING_SHIP', 'UNSHIPPED', '待发货'].includes(statusToken)) return 'UNSHIPPED';
  return undefined;
}

function normalizeOrder(raw: Record<string, unknown>): Order {
  const statusSource = raw.status ?? raw.orderStatus ?? raw.order_status;
  const status = normalizeOrderStatus(statusSource);
  const payStatus = normalizeOrderPayStatus(raw.payStatus ?? raw.paymentStatus ?? raw.pay_status ?? raw.payment_status, status);
  const fulfillmentStatus = normalizeOrderFulfillmentStatus(raw.fulfillmentStatus ?? raw.fulfillment_status ?? raw.shippingStatus ?? raw.shipping_status ?? raw.deliveryStatus ?? raw.delivery_status, statusSource);
  return {
    id: String(raw.id),
    auctionId: String(raw.auctionId ?? raw.auction_id),
    liveSessionId: raw.liveSessionId === undefined && raw.live_session_id === undefined ? undefined : String(raw.liveSessionId ?? raw.live_session_id),
    buyerId: String(raw.winnerId ?? raw.winner_id ?? raw.buyerId ?? raw.buyer_id ?? ''),
    merchantId: raw.sellerId === undefined && raw.seller_id === undefined ? undefined : String(raw.sellerId ?? raw.seller_id),
    amount: Number(raw.dealPrice ?? raw.deal_price ?? raw.amount ?? raw.payAmount ?? raw.pay_amount ?? 0),
    status: String(status ?? ''),
    payStatus: payStatus === undefined ? undefined : String(payStatus),
    fulfillmentStatus,
    lotSnapshot: normalizeOrderLotSnapshot(raw.lotSnapshot ?? raw.lot_snapshot),
    createdAt: optionalString(raw.createdAt) ?? optionalString(raw.created_at),
    paidAt: optionalString(raw.paidAt) ?? optionalString(raw.paid_at),
    shippedAt: optionalString(raw.shippedAt) ?? optionalString(raw.shipped_at),
    receivedAt: optionalString(raw.receivedAt) ?? optionalString(raw.received_at)
  };
}

function normalizeProfile(raw: Record<string, unknown>, fallback: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: String(raw.id ?? raw.userId ?? fallback.userId ?? ''),
    nickname: String(raw.nickname ?? fallback.nickname ?? ''),
    avatarUrl: optionalString(raw.avatarUrl ?? raw.avatar_url) ?? fallback.avatarUrl,
    reminderCount: Number(raw.reminderCount ?? fallback.reminderCount ?? 0),
    favoriteCount: Number(raw.favoriteCount ?? fallback.favoriteCount ?? 0),
    followingCount: Number(raw.followingCount ?? fallback.followingCount ?? 0),
    footprintCount: Number(raw.footprintCount ?? fallback.footprintCount ?? 0)
  };
}

function isFormDataBody(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function needsIdempotencyKey(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function createIdempotencyKey(method: string): string {
  return `${method.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeAuctionRecord(raw: Record<string, unknown>): UserAuctionRecord {
  const rawLot = (raw.lot ?? {}) as Record<string, unknown>;
  const rawRoom = raw.room === undefined ? undefined : (raw.room as Record<string, unknown>);
  const rawOrder = raw.order === undefined ? undefined : (raw.order as Record<string, unknown>);
  const lot = normalizeLot(rawLot);
  return {
    id: String(raw.id),
    userId: String(raw.userId),
    lot,
    room: rawRoom ? normalizeLiveRoom(rawRoom) : undefined,
    order: rawOrder ? normalizeOrder(rawOrder) : undefined,
    depositAmount: Number(raw.depositAmount ?? 0),
    depositStatus: String(raw.depositStatus),
    enrolledAt: optionalString(raw.enrolledAt)
  };
}

function normalizeEnrollResult(raw: Record<string, unknown>): EnrollResult {
  return {
    id: String(raw.id),
    auctionId: String(raw.auctionId),
    userId: String(raw.userId),
    amount: Number(raw.amount ?? 0),
    status: String(raw.status),
    participantCount: raw.participantCount === undefined && raw.participant_count === undefined ? undefined : Number(raw.participantCount ?? raw.participant_count),
    relatedOrderId: optionalNumberString(raw.relatedOrderId),
    remark: optionalString(raw.remark),
    createdAt: optionalString(raw.createdAt),
    updatedAt: optionalString(raw.updatedAt)
  };
}

function orderQuery(options: ListOrderOptions = {}): string {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 20));
  params.set('offset', String(options.offset ?? 0));
  if (options.auctionId) params.set('auctionId', options.auctionId);
  if (options.status) params.set('status', options.status);
  if (options.payStatus) params.set('payStatus', options.payStatus);
  if (options.fulfillmentStatus) params.set('fulfillmentStatus', options.fulfillmentStatus);
  return params.toString();
}

function lotSearchQuery(options: SearchLotsOptions = {}): string {
  const params = new URLSearchParams();
  params.set('limit', '20');
  params.set('offset', '0');
  if (options.keyword) params.set('keyword', options.keyword);
  const sort = lotSortParam(options.sort);
  if (sort) params.set('sort', sort);
  if (options.status && options.status !== 'all') params.set('status', options.status);
  if (options.categoryId && options.categoryId !== 'all') params.set('categoryId', options.categoryId);
  if (options.merchantId) params.set('merchantId', options.merchantId);
  return params.toString();
}

function lotSortParam(sort: SearchLotsOptions['sort']): string | undefined {
  if (sort === 'priceAsc' || sort === 'priceDesc') return sort;
  if (sort === 'auctionTime') return 'startTimeAsc';
  if (sort === 'publishedAt') return 'newest';
  return undefined;
}

function liveRoomSearchQuery(options: SearchLiveRoomsOptions = {}): string {
  const params = new URLSearchParams();
  params.set('limit', '20');
  params.set('offset', '0');
  if (options.keyword) params.set('keyword', options.keyword);
  if (options.sort && options.sort !== 'default') params.set('sort', options.sort);
  const status = liveSessionStatusParam(options.status);
  if (status) params.set('status', status);
  return params.toString();
}

function liveSessionStatusParam(status: SearchLiveRoomsOptions['status']): string | undefined {
  if (status === 'live') return 'LIVE';
  if (status === 'ended') return 'ENDED';
  if (status === 'upcoming') return 'SCHEDULED';
  return undefined;
}

export class ApiClient {
  private token = '';
  private authRefresh?: AuthRefreshOptions;
  private refreshPromise?: Promise<RefreshResult>;

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = defaultFetcher
  ) {}

  setToken(token: string) {
    this.token = token;
  }

  configureAuthRefresh(options?: AuthRefreshOptions) {
    this.authRefresh = options;
  }

  async login(body: LoginRequest): Promise<LoginResult> {
    return this.request<LoginResult>('/api/v1/auth/login', { method: 'POST', body, omitAuth: true, skipAuthRefresh: true });
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
    return this.performRequest<RefreshResult>('/api/v1/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      omitAuth: true,
      skipAuthRefresh: true
    });
  }

  async getMe(): Promise<LoginResult['user']> {
    return this.request('/api/v1/auth/me');
  }

  async getMyProfile(): Promise<UserProfile> {
    const data = await this.request('/api/v1/auth/me');
    return normalizeProfile(data as Record<string, unknown>);
  }

  async updateMyProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const data = await this.request('/api/v1/auth/me', { method: 'PATCH', body: { nickname: profile.nickname } });
    return normalizeProfile(data as Record<string, unknown>, profile);
  }

  async uploadMyAvatar(avatar: Blob | File, currentProfile?: Partial<UserProfile>): Promise<UserProfile> {
    const formData = new FormData();
    const filename = typeof File !== 'undefined' && avatar instanceof File ? avatar.name : 'avatar.jpg';
    formData.append('avatar', avatar, filename);
    const data = await this.request('/api/v1/auth/me/avatar', { method: 'POST', body: formData });
    return normalizeProfile(data as Record<string, unknown>, currentProfile);
  }

  async listLiveRooms(): Promise<PageResult<LiveRoom>> {
    const data = await this.request('/api/v1/live-sessions?limit=20&offset=0');
    return normalizePage(data, 'sessions', normalizeLiveRoom);
  }

  async getLiveRoom(id: string): Promise<LiveRoom> {
    const data = await this.request(`/api/v1/live-sessions/${id}`);
    return normalizeLiveRoom(data as Record<string, unknown>);
  }

  async listLiveRoomLots(roomId: string): Promise<PageResult<LiveRoomLot>> {
    const data = await this.request(`/api/v1/live-sessions/${roomId}/lots`);
    return normalizePage(data, 'lots', normalizeLot);
  }

  async getLiveRoomStats(roomId: string): Promise<LiveRoomStats> {
    const data = await this.request(`/api/v1/live-sessions/${roomId}/stats`);
    return normalizeStats(data as Record<string, unknown>);
  }

  async listCategories(): Promise<PageResult<Category>> {
    const data = await this.request('/api/v1/categories?limit=20&offset=0');
    return normalizePage(data, 'categories', normalizeCategory);
  }

  async searchLots(options: SearchLotsOptions = {}): Promise<PageResult<LiveRoomLot>> {
    const data = await this.request(`/api/v1/search/lots?${lotSearchQuery(options)}`);
    return normalizePage(data, 'lots', normalizeLot);
  }

  async searchLiveRooms(options: SearchLiveRoomsOptions = {}): Promise<PageResult<LiveRoom>> {
    const data = await this.request(`/api/v1/live-sessions?${liveRoomSearchQuery(options)}`);
    return normalizePage(data, 'sessions', normalizeLiveRoom);
  }

  async listMerchantLiveSessions(merchantId: string, options: SearchLiveRoomsOptions = {}): Promise<PageResult<LiveRoom>> {
    const data = await this.request(`/api/v1/merchants/${encodeURIComponent(merchantId)}/live-sessions?${liveRoomSearchQuery(options)}`);
    return normalizePage(data, 'sessions', normalizeLiveRoom);
  }

  async getMerchant(id: string): Promise<Merchant> {
    const data = await this.request(`/api/v1/merchants/${id}`);
    return normalizeMerchant(data as Record<string, unknown>);
  }

  async getLot(id: string): Promise<LiveRoomLot> {
    const data = await this.request(`/api/v1/lots/${id}`);
    return normalizeLot(data as Record<string, unknown>);
  }

  async listMyAuctionRecords(): Promise<PageResult<UserAuctionRecord>> {
    const data = await this.request('/api/v1/auction-participations/mine?limit=20&offset=0');
    return normalizePage(data, 'records', normalizeAuctionRecord);
  }

  async getAuctionState(id: string): Promise<AuctionState> {
    const data = await this.request(`/api/v1/auctions/${id}/state`);
    return normalizeState(data as Record<string, unknown>);
  }

  async getAuctionRanking(id: string): Promise<RankingSnapshotItem[]> {
    const data = await this.request(`/api/v1/auctions/${id}/ranking?limit=10`);
    const raw = (data ?? {}) as Record<string, unknown>;
    return (Array.isArray(raw.ranking) ? raw.ranking : Array.isArray(raw.items) ? raw.items : [])
      .filter((item): item is RankingSnapshotItem => Boolean(item) && typeof item === 'object');
  }

  async enrollAuction(id: string): Promise<EnrollResult> {
    const data = await this.request(`/api/v1/auctions/${id}/enroll`, {
      method: 'POST'
    });
    return normalizeEnrollResult(data as Record<string, unknown>);
  }

  async listMyOrders(options: ListOrderOptions = {}): Promise<PageResult<Order>> {
    const data = await this.request(`/api/v1/orders/mine?${orderQuery(options)}`);
    return normalizePage(data, 'orders', normalizeOrder);
  }

  async getOrder(id: string): Promise<Order> {
    const data = await this.request(`/api/v1/orders/${id}`);
    return normalizeOrder(data as Record<string, unknown>);
  }

  async payOrder(id: string): Promise<Order> {
    const data = await this.request(`/api/v1/orders/${id}/pay`, {
      method: 'POST',
      idempotencyKey: `pay-${id}-${Date.now()}`
    });
    return normalizeOrder(data as Record<string, unknown>);
  }

  async confirmReceipt(id: string): Promise<Order> {
    const data = await this.request(`/api/v1/orders/${id}/receive`, {
      method: 'POST',
      idempotencyKey: `receive-${id}-${Date.now()}`
    });
    return normalizeOrder(data as Record<string, unknown>);
  }

  private async request<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    try {
      return await this.performRequest<T>(path, options);
    } catch (error) {
      if (!this.shouldRefreshAccessToken(error, options)) throw error;
      await this.refreshAccessTokenOnce();
      return this.performRequest<T>(path, { ...options, skipAuthRefresh: true });
    }
  }

  private async performRequest<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const isMultipart = isFormDataBody(options.body);
    const headers: Record<string, string> = isMultipart ? {} : { 'Content-Type': 'application/json; charset=utf-8' };
    if (!options.omitAuth && this.token) headers.Authorization = `Bearer ${this.token}`;
    const url = joinUrl(this.baseUrl, path);
    const method = options.method ?? 'GET';
    const idempotencyKey = options.idempotencyKey ?? (needsIdempotencyKey(method) ? createIdempotencyKey(method) : undefined);
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    let requestBody: BodyInit | undefined;
    if (options.body !== undefined) {
      requestBody = isFormDataBody(options.body) ? options.body : (JSON.stringify(options.body) ?? undefined);
    }

    const response = await this.fetcher(url, {
      method,
      headers,
      body: requestBody
    });

    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || envelope.code !== 0) {
      throw new ApiError(envelope.message || response.statusText, envelope.code, envelope.trace_id, response.status);
    }
    return envelope.data;
  }

  private shouldRefreshAccessToken(error: unknown, options: RequestOptions): boolean {
    if (options.skipAuthRefresh || !(error instanceof ApiError)) return false;
    if (!isAuthExpiredError(error)) return false;
    return Boolean(this.authRefresh?.getRefreshToken().trim());
  }

  private async refreshAccessTokenOnce(): Promise<RefreshResult> {
    if (!this.authRefresh) throw new ApiError('访问令牌无效或已过期', 10002, undefined, 401);
    if (!this.refreshPromise) {
      const refreshToken = this.authRefresh.getRefreshToken().trim();
      this.refreshPromise = this.refreshAccessToken(refreshToken)
        .then((result) => {
          this.token = result.accessToken;
          this.authRefresh?.onAccessTokenRefreshed?.(result);
          return result;
        })
        .catch((error) => {
          if (isAuthExpiredError(error)) this.authRefresh?.onRefreshFailed?.();
          throw error;
        })
        .finally(() => {
          this.refreshPromise = undefined;
        });
    }
    return this.refreshPromise;
  }
}

function isAuthExpiredError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.status === 401 || error.code === 10001 || error.code === 10002);
}

function cloneOrder(order: Order): Order {
  return { ...order };
}

function cloneLiveRoomLot(lot: LiveRoomLot): LiveRoomLot {
  return {
    ...lot,
    imageUrls: lot.imageUrls ? [...lot.imageUrls] : undefined,
    ruleSnapshot: lot.ruleSnapshot ? { ...lot.ruleSnapshot } : undefined
  };
}

function cloneLiveRoom(room: LiveRoom): LiveRoom {
  return {
    ...room,
    digitalHuman: room.digitalHuman ? { ...room.digitalHuman } : undefined
  };
}

function cloneOptionalLiveRoom(room?: LiveRoom): LiveRoom | undefined {
  return room ? cloneLiveRoom(room) : undefined;
}

function cloneAuctionRecord(record: UserAuctionRecord): UserAuctionRecord {
  return {
    ...record,
    lot: cloneLiveRoomLot(record.lot),
    room: cloneOptionalLiveRoom(record.room),
    order: record.order ? cloneOrder(record.order) : undefined
  };
}

function demoPage<T>(items: T[]): PageResult<T> {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 20
  };
}

async function blobToDemoAvatarUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return `demo-avatar://${Date.now()}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('avatar read failed')));
    reader.onerror = () => reject(new Error('avatar read failed'));
    reader.readAsDataURL(blob);
  });
}

export class DemoApiClient extends ApiClient {
  private orders = demoOrderPage.items.map(cloneOrder);
  private auctionRecords = listDemoAuctionRecords().items.map(cloneAuctionRecord);

  constructor(fetcher: Fetcher = defaultFetcher) {
    super('demo://local', fetcher);
  }

  private findStoredOrder(id: string): Order {
    return this.orders.find((order) => order.id === id) ?? findDemoOrder(id);
  }

  private saveOrder(order: Order): Order {
    const nextOrder = cloneOrder(order);
    const orderIndex = this.orders.findIndex((item) => item.id === nextOrder.id);
    if (orderIndex >= 0) {
      this.orders = this.orders.map((item) => (item.id === nextOrder.id ? nextOrder : item));
    } else {
      this.orders = [...this.orders, nextOrder];
    }
    this.auctionRecords = this.auctionRecords.map((record) => {
      const ownsOrder = record.order?.id === nextOrder.id;
      const matchesPaidAuction = !record.order && record.lot.auctionId === nextOrder.auctionId && record.userId === nextOrder.buyerId && nextOrder.payStatus === 'PAID';
      if (!ownsOrder && !matchesPaidAuction) return record;
      return {
        ...record,
        order: cloneOrder(nextOrder),
        depositStatus: nextOrder.payStatus === 'PAID' ? 'APPLIED' : record.depositStatus
      };
    });
    return cloneOrder(nextOrder);
  }

  override setToken() {}

  override async login(body: LoginRequest): Promise<LoginResult> {
    return {
      ...demoLoginResult,
      user: {
        ...demoLoginResult.user,
        role: body.role
      }
    };
  }

  override async getMe() {
    return demoLoginResult.user;
  }

  override async getMyProfile(): Promise<UserProfile> {
    return getDemoUserProfile();
  }

  override async updateMyProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    return updateDemoUserProfile(profile);
  }

  override async uploadMyAvatar(avatar: Blob | File, currentProfile?: Partial<UserProfile>): Promise<UserProfile> {
    const avatarUrl = await blobToDemoAvatarUrl(avatar);
    return updateDemoUserAvatar(avatarUrl, currentProfile);
  }

  override async listLiveRooms(): Promise<PageResult<LiveRoom>> {
    return demoLiveRoomPage;
  }

  override async getLiveRoom(id: string): Promise<LiveRoom> {
    return findDemoLiveRoom(id);
  }

  override async listLiveRoomLots(roomId: string): Promise<PageResult<LiveRoomLot>> {
    return listDemoLots(roomId);
  }

  override async getLiveRoomStats(roomId: string): Promise<LiveRoomStats> {
    return findDemoLiveRoomStats(roomId);
  }

  override async listCategories(): Promise<PageResult<Category>> {
    return listDemoCategories();
  }

  override async searchLots(options: SearchLotsOptions = {}): Promise<PageResult<LiveRoomLot>> {
    return searchDemoLots(options);
  }

  override async searchLiveRooms(options: SearchLiveRoomsOptions = {}): Promise<PageResult<LiveRoom>> {
    return searchDemoLiveRooms(options);
  }

  override async listMerchantLiveSessions(merchantId: string, options: SearchLiveRoomsOptions = {}): Promise<PageResult<LiveRoom>> {
    const rooms = await searchDemoLiveRooms(options);
    const items = rooms.items.filter((room) => room.merchantId === merchantId);
    return {
      items,
      total: items.length,
      page: 1,
      page_size: 20
    };
  }

  override async getMerchant(id: string): Promise<Merchant> {
    return findDemoMerchant(id);
  }

  override async getLot(id: string): Promise<LiveRoomLot> {
    return findDemoLot(id);
  }

  override async listMyAuctionRecords(): Promise<PageResult<UserAuctionRecord>> {
    return demoPage(this.auctionRecords.map(cloneAuctionRecord));
  }

  override async getAuctionState(id: string): Promise<AuctionState> {
    const lot = findDemoLotByAuctionId(id);
    return {
      ...demoAuctionState,
      auctionId: id,
      status: lot.status,
      currentPrice: lot.currentPrice,
      leaderBidderId: lot.leaderBidderId,
      bidCount: lot.bidCount,
      participantCount: lot.participantCount,
      endTsMs: lot.endTsMs,
      serverTsMs: Date.now()
    };
  }

  override async getAuctionRanking(id: string): Promise<RankingSnapshotItem[]> {
    return listDemoRanking(id);
  }

  override async enrollAuction(id: string): Promise<EnrollResult> {
    const lot = findDemoLotByAuctionId(id);
    return {
      ...demoEnrollResult,
      auctionId: id,
      amount: lot.depositAmount ?? demoEnrollResult.amount
    };
  }

  override async listMyOrders(options: ListOrderOptions = {}): Promise<PageResult<Order>> {
    const items = options.auctionId ? this.orders.filter((order) => order.auctionId === options.auctionId) : this.orders;
    return demoPage(items.map(cloneOrder));
  }

  override async getOrder(id: string): Promise<Order> {
    return cloneOrder(this.findStoredOrder(id));
  }

  override async payOrder(id: string): Promise<Order> {
    const order = this.findStoredOrder(id);
    return this.saveOrder({
      ...order,
      status: 'PAID',
      payStatus: 'PAID',
      fulfillmentStatus: 'UNSHIPPED',
      paidAt: new Date().toISOString()
    });
  }

  override async confirmReceipt(id: string): Promise<Order> {
    const order = this.findStoredOrder(id);
    return this.saveOrder({
      ...order,
      status: 'PAID',
      payStatus: 'PAID',
      fulfillmentStatus: 'RECEIVED',
      receivedAt: new Date().toISOString()
    });
  }
}

const remoteApiClient = new ApiClient(
  import.meta.env.VITE_API_BASE_URL ?? ''
);

export const defaultApiClient =
  import.meta.env.VITE_API_MODE === 'remote' ? remoteApiClient : new DemoApiClient();
