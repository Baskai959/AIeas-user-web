import {
  demoAuctionState,
  demoEnrollResult,
  demoLiveRoomPage,
  demoLoginResult,
  demoOrderPage,
  demoPaidOrder,
  findDemoLiveRoomStats,
  findDemoLot,
  findDemoLiveRoom,
  findDemoLotByAuctionId,
  findDemoMerchant,
  findDemoOrder,
  getDemoUserProfile,
  listDemoCategories,
  listDemoAuctionRecords,
  listDemoLots,
  searchDemoLiveRooms,
  searchDemoLots,
  searchDemoMerchants,
  updateDemoUserProfile
} from './mockData';
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
  SearchLiveRoomsOptions,
  SearchLotsOptions,
  SearchMerchantsOptions,
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

function normalizeLiveRoom(raw: Record<string, unknown>): LiveRoom {
  const id = String(raw.id);
  const merchantId = String(raw.merchantId ?? '');
  return {
    id,
    title: String(raw.title),
    description: optionalString(raw.description),
    merchantId,
    merchantName: optionalString(raw.merchantName) ?? merchantId,
    status: String(raw.status) as LiveRoom['status'],
    videoSource: normalizeVideoSource(raw.videoSource),
    coverUrl: optionalString(raw.coverUrl),
    videoUrl: optionalString(raw.videoUrl),
    digitalHuman: normalizeDigitalHuman(raw.digitalHuman),
    onlineCount: Number(raw.onlineCount ?? 0),
    watcherCount: Number(raw.viewerTotal ?? 0),
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
    categoryId: raw.categoryId === undefined ? undefined : String(raw.categoryId),
    title: String(raw.title),
    subtitle: optionalString(raw.brand),
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
    antiSnipingSec: Number(snapshot.antiSnipingSec ?? raw.antiSnipingSec ?? 0) || undefined,
    antiExtendSec: Number(snapshot.antiExtendSec ?? raw.antiExtendSec ?? 0) || undefined,
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
  return {
    roomId: String(raw.liveSessionId),
    onlineCount: Number(raw.online ?? 0),
    watcherCount: Number(raw.viewerTotal ?? 0),
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
    endTsMs: toMs(raw.endTime),
    serverTsMs: Date.now()
  };
}

function normalizeOrder(raw: Record<string, unknown>): Order {
  return {
    id: String(raw.id),
    auctionId: String(raw.auctionId),
    buyerId: String(raw.winnerId),
    merchantId: raw.sellerId === undefined ? undefined : String(raw.sellerId),
    amount: Number(raw.dealPrice ?? 0),
    status: String(raw.status),
    payStatus: raw.payStatus === undefined ? undefined : String(raw.payStatus),
    fulfillmentStatus: raw.fulfillmentStatus === undefined ? undefined : (String(raw.fulfillmentStatus) as Order['fulfillmentStatus']),
    createdAt: optionalString(raw.createdAt),
    paidAt: optionalString(raw.paidAt),
    shippedAt: optionalString(raw.shippedAt),
    receivedAt: optionalString(raw.receivedAt)
  };
}

function normalizeProfile(raw: Record<string, unknown>): UserProfile {
  return {
    userId: String(raw.id),
    nickname: String(raw.nickname),
    avatarUrl: optionalString(raw.avatarUrl),
    reminderCount: 0,
    favoriteCount: 0,
    followingCount: 0,
    footprintCount: 0
  };
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

function merchantSearchQuery(options: SearchMerchantsOptions = {}): string {
  const params = new URLSearchParams();
  params.set('limit', '20');
  params.set('offset', '0');
  if (options.keyword) params.set('keyword', options.keyword);
  return params.toString();
}

export class ApiClient {
  private token = '';

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: Fetcher = fetch
  ) {}

  setToken(token: string) {
    this.token = token;
  }

  async login(body: LoginRequest): Promise<LoginResult> {
    return this.request<LoginResult>('/api/v1/auth/login', { method: 'POST', body });
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
    return normalizeProfile(data as Record<string, unknown>);
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

  async searchMerchants(options: SearchMerchantsOptions = {}): Promise<PageResult<Merchant>> {
    const data = await this.request(`/api/v1/search/merchants?${merchantSearchQuery(options)}`);
    return normalizePage(data, 'merchants', normalizeMerchant);
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
    options: { method?: string; body?: unknown; idempotencyKey?: string } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8'
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const response = await this.fetcher(joinUrl(this.baseUrl, path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || envelope.code !== 0) {
      throw new ApiError(envelope.message || response.statusText, envelope.code, envelope.trace_id, response.status);
    }
    return envelope.data;
  }
}

export class DemoApiClient extends ApiClient {
  constructor(fetcher: Fetcher = fetch) {
    super('demo://local', fetcher);
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

  override async searchMerchants(options: SearchMerchantsOptions = {}): Promise<PageResult<Merchant>> {
    return searchDemoMerchants(options);
  }

  override async getMerchant(id: string): Promise<Merchant> {
    return findDemoMerchant(id);
  }

  override async getLot(id: string): Promise<LiveRoomLot> {
    return findDemoLot(id);
  }

  override async listMyAuctionRecords(): Promise<PageResult<UserAuctionRecord>> {
    return listDemoAuctionRecords();
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

  override async enrollAuction(id: string): Promise<EnrollResult> {
    const lot = findDemoLotByAuctionId(id);
    return {
      ...demoEnrollResult,
      auctionId: id,
      amount: lot.depositAmount ?? demoEnrollResult.amount
    };
  }

  override async listMyOrders(options: ListOrderOptions = {}): Promise<PageResult<Order>> {
    const items = options.auctionId ? demoOrderPage.items.filter((order) => order.auctionId === options.auctionId) : demoOrderPage.items;
    return {
      items,
      total: items.length,
      page: 1,
      page_size: 20
    };
  }

  override async getOrder(id: string): Promise<Order> {
    return findDemoOrder(id);
  }

  override async payOrder(id: string): Promise<Order> {
    return {
      ...demoPaidOrder,
      id
    };
  }

  override async confirmReceipt(id: string): Promise<Order> {
    const order = findDemoOrder(id);
    return {
      ...order,
      status: 'PAID',
      payStatus: 'PAID',
      fulfillmentStatus: 'RECEIVED',
      receivedAt: new Date().toISOString()
    };
  }
}

const remoteApiClient = new ApiClient(
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8888'
);

export const defaultApiClient =
  import.meta.env.VITE_API_MODE === 'remote' ? remoteApiClient : new DemoApiClient();
