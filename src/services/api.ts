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
  OrderFulfillmentStatus,
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
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

function normalizeVideoSource(value: unknown): LiveRoom['videoSource'] {
  if (value === 'recorded' || value === 'digitalHuman') return value;
  return undefined;
}

function normalizeDigitalHumanConfig(raw: unknown): LiveRoom['digitalHuman'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const source = raw as Record<string, unknown>;
  const idleVideoUrl = typeof source.idleVideoUrl === 'string' ? source.idleVideoUrl : undefined;
  const speakingVideoUrl = typeof source.speakingVideoUrl === 'string' ? source.speakingVideoUrl : undefined;
  if (!idleVideoUrl || !speakingVideoUrl) return undefined;
  return {
    idleVideoUrl,
    speakingVideoUrl,
    ttsWsUrl: typeof source.ttsWsUrl === 'string' ? source.ttsWsUrl : undefined
  };
}

function normalizePage<T>(data: unknown, itemKeys: string[], normalizer: (raw: Record<string, unknown>) => T): PageResult<T> {
  const source = (data ?? {}) as Record<string, unknown>;
  const list = itemKeys.map((key) => source[key]).find(Array.isArray) as Record<string, unknown>[] | undefined;
  const items = list ?? [];
  return {
    items: items.map(normalizer),
    total: Number(source.total ?? items.length),
    page: Number(source.page ?? 1),
    page_size: Number(source.page_size ?? source.limit ?? items.length ?? 20)
  };
}

function normalizeLiveRoom(raw: Record<string, unknown>): LiveRoom {
  const id = String(raw.id ?? raw.roomId ?? raw.liveRoomId ?? '0');
  return {
    id,
    title: String(raw.title ?? raw.name ?? `Live Room ${id}`),
    merchantId: raw.merchantId === undefined ? undefined : String(raw.merchantId),
    merchantName: String(raw.merchantName ?? raw.shopName ?? 'Live Store'),
    status: String(raw.status ?? 'LIVE') as LiveRoom['status'],
    videoSource: normalizeVideoSource(raw.videoSource),
    coverUrl: typeof raw.coverUrl === 'string' ? raw.coverUrl : undefined,
    videoUrl: typeof raw.videoUrl === 'string' ? raw.videoUrl : undefined,
    digitalHuman: normalizeDigitalHumanConfig(raw.digitalHuman),
    onlineCount: Number(raw.onlineCount ?? raw.online ?? 0),
    watcherCount: Number(raw.watcherCount ?? raw.watchers ?? raw.viewCount ?? 0),
    activeAuctionId: raw.activeAuctionId === undefined ? undefined : String(raw.activeAuctionId),
    liveSessionId: raw.liveSessionId === undefined ? undefined : Number(raw.liveSessionId),
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : undefined,
    endedAt: typeof raw.endedAt === 'string' ? raw.endedAt : undefined
  };
}

function normalizeLot(raw: Record<string, unknown>): LiveRoomLot {
  const auctionId = String(raw.auctionId ?? raw.auctionID ?? raw.id ?? '0');
  const currentPrice = Number(raw.currentPrice ?? raw.finalPrice ?? raw.dealPrice ?? raw.startPrice ?? 0);
  const rawRuleSnapshot = (raw.ruleSnapshot ?? {}) as NonNullable<LiveRoomLot['ruleSnapshot']>;
  return {
    id: String(raw.id ?? raw.lotId ?? auctionId),
    auctionId,
    roomId: String(raw.roomId ?? raw.liveRoomId ?? ''),
    merchantId: raw.merchantId === undefined ? undefined : String(raw.merchantId),
    categoryId: raw.categoryId === undefined ? undefined : String(raw.categoryId),
    title: String(raw.title ?? raw.name ?? `Lot ${auctionId}`),
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : typeof raw.coverUrl === 'string' ? raw.coverUrl : undefined,
    status: String(raw.status ?? 'UPCOMING') as LiveRoomLot['status'],
    startPrice: Number(raw.startPrice ?? rawRuleSnapshot.startPrice ?? 0),
    currentPrice,
    finalPrice: raw.finalPrice === undefined ? undefined : Number(raw.finalPrice),
    leaderBidderId: raw.leaderBidderId === undefined ? undefined : String(raw.leaderBidderId),
    startTsMs: raw.startTsMs === undefined && raw.startTime === undefined ? undefined : toMs(raw.startTsMs ?? raw.startTime),
    endTsMs: toMs(raw.endTsMs ?? raw.endTime),
    ruleSnapshot: rawRuleSnapshot,
    depositAmount: raw.depositAmount === undefined ? undefined : Number(raw.depositAmount),
    participantCount: raw.participantCount === undefined ? undefined : Number(raw.participantCount),
    bidCount: raw.bidCount === undefined ? undefined : Number(raw.bidCount),
    sortOrder: raw.sortOrder === undefined ? undefined : Number(raw.sortOrder),
    publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : undefined
  };
}

function normalizeCategory(raw: Record<string, unknown>): Category {
  return {
    id: String(raw.id ?? raw.categoryId ?? '0'),
    name: String(raw.name ?? raw.title ?? 'Category'),
    iconName: typeof raw.iconName === 'string' ? raw.iconName : undefined
  };
}

function normalizeMerchant(raw: Record<string, unknown>): Merchant {
  const id = String(raw.id ?? raw.merchantId ?? raw.sellerId ?? '0');
  return {
    id,
    name: String(raw.name ?? raw.merchantName ?? raw.shopName ?? `Merchant ${id}`),
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : typeof raw.logoUrl === 'string' ? raw.logoUrl : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    followerCount: Number(raw.followerCount ?? raw.fansCount ?? 0),
    fansCount: raw.fansCount === undefined ? undefined : Number(raw.fansCount),
    rating: raw.rating === undefined ? undefined : Number(raw.rating),
    liveRoomId: raw.liveRoomId === undefined ? undefined : String(raw.liveRoomId),
    location: typeof raw.location === 'string' ? raw.location : undefined
  };
}

function normalizeStats(raw: Record<string, unknown>): LiveRoomStats {
  return {
    roomId: String(raw.roomId ?? raw.id ?? '0'),
    onlineCount: Number(raw.onlineCount ?? raw.online ?? 0),
    watcherCount: Number(raw.watcherCount ?? raw.watchers ?? raw.viewCount ?? 0),
    bidCount: Number(raw.bidCount ?? 0),
    gmvCent: raw.gmvCent === undefined ? undefined : Number(raw.gmvCent)
  };
}

function normalizeState(raw: Record<string, unknown>): AuctionState {
  return {
    auctionId: String(raw.auctionId ?? raw.id ?? '0'),
    status: String(raw.status ?? 'RUNNING') as AuctionState['status'],
    currentPrice: Number(raw.currentPrice ?? 0),
    leaderBidderId: raw.leaderBidderId === undefined ? undefined : String(raw.leaderBidderId),
    bidCount: raw.bidCount === undefined ? undefined : Number(raw.bidCount),
    participantCount: raw.participantCount === undefined ? undefined : Number(raw.participantCount),
    endTsMs: toMs(raw.endTsMs ?? raw.endTime),
    serverTsMs: Number(raw.serverTsMs ?? Date.now())
  };
}

function normalizeOrder(raw: Record<string, unknown>): Order {
  return {
    id: String(raw.id ?? raw.orderId ?? '0'),
    auctionId: String(raw.auctionId ?? '0'),
    buyerId: String(raw.buyerId ?? raw.winnerId ?? ''),
    merchantId: raw.merchantId === undefined ? undefined : String(raw.merchantId ?? raw.sellerId),
    amount: Number(raw.amount ?? raw.dealPrice ?? raw.price ?? 0),
    status: String(raw.status ?? raw.payStatus ?? 'PENDING_PAY'),
    payStatus: raw.payStatus === undefined ? undefined : String(raw.payStatus),
    fulfillmentStatus: normalizeFulfillmentStatus(raw.fulfillmentStatus),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    paidAt: typeof raw.paidAt === 'string' ? raw.paidAt : undefined,
    shippedAt: typeof raw.shippedAt === 'string' ? raw.shippedAt : undefined,
    receivedAt: typeof raw.receivedAt === 'string' ? raw.receivedAt : undefined
  };
}

function normalizeFulfillmentStatus(value: unknown): OrderFulfillmentStatus | undefined {
  if (value === 'UNSHIPPED' || value === 'SHIPPED' || value === 'RECEIVED') return value;
  return undefined;
}

function normalizeProfile(raw: Record<string, unknown>): UserProfile {
  return {
    userId: String(raw.userId ?? raw.id ?? '0'),
    nickname: String(raw.nickname ?? raw.name ?? 'User'),
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : undefined,
    reminderCount: Number(raw.reminderCount ?? 0),
    favoriteCount: Number(raw.favoriteCount ?? 0),
    followingCount: Number(raw.followingCount ?? 0),
    footprintCount: Number(raw.footprintCount ?? 0)
  };
}

function normalizeAuctionRecord(raw: Record<string, unknown>): UserAuctionRecord {
  const rawLot = (raw.lot ?? raw.auction ?? {}) as Record<string, unknown>;
  const rawRoom = raw.room === undefined ? undefined : (raw.room as Record<string, unknown>);
  const rawOrder = raw.order === undefined ? undefined : (raw.order as Record<string, unknown>);
  const lot = normalizeLot(rawLot);
  return {
    id: String(raw.id ?? raw.recordId ?? lot.auctionId),
    userId: String(raw.userId ?? raw.buyerId ?? ''),
    lot,
    room: rawRoom ? normalizeLiveRoom(rawRoom) : undefined,
    order: rawOrder ? normalizeOrder(rawOrder) : undefined,
    depositAmount: Number(raw.depositAmount ?? lot.depositAmount ?? 0),
    depositStatus: String(raw.depositStatus ?? ''),
    enrolledAt: typeof raw.enrolledAt === 'string' ? raw.enrolledAt : undefined
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
  if (options.sort) params.set('sort', options.sort);
  if (options.status && options.status !== 'all') params.set('status', options.status);
  if (options.categoryId && options.categoryId !== 'all') params.set('categoryId', options.categoryId);
  if (options.merchantId) params.set('merchantId', options.merchantId);
  return params.toString();
}

function liveRoomSearchQuery(options: SearchLiveRoomsOptions = {}): string {
  const params = new URLSearchParams();
  params.set('limit', '20');
  params.set('offset', '0');
  if (options.keyword) params.set('keyword', options.keyword);
  if (options.sort) params.set('sort', options.sort);
  if (options.status && options.status !== 'all') params.set('status', options.status);
  return params.toString();
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
    const data = await this.request('/api/v1/users/me/profile');
    return normalizeProfile(data as Record<string, unknown>);
  }

  async updateMyProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
    const data = await this.request('/api/v1/users/me/profile', { method: 'PATCH', body: profile });
    return normalizeProfile(data as Record<string, unknown>);
  }

  async listLiveRooms(): Promise<PageResult<LiveRoom>> {
    const data = await this.request('/api/v1/live-rooms?limit=20&offset=0');
    return normalizePage(data, ['items', 'rooms', 'liveRooms'], normalizeLiveRoom);
  }

  async getLiveRoom(id: string): Promise<LiveRoom> {
    const data = await this.request(`/api/v1/live-rooms/${id}`);
    return normalizeLiveRoom(data as Record<string, unknown>);
  }

  async listLiveRoomLots(roomId: string): Promise<PageResult<LiveRoomLot>> {
    const data = await this.request(`/api/v1/live-rooms/${roomId}/lots`);
    return normalizePage(data, ['items', 'lots', 'auctions'], normalizeLot);
  }

  async getLiveRoomStats(roomId: string): Promise<LiveRoomStats> {
    const data = await this.request(`/api/v1/live-rooms/${roomId}/stats`);
    return normalizeStats(data as Record<string, unknown>);
  }

  async listCategories(): Promise<PageResult<Category>> {
    const data = await this.request('/api/v1/categories?limit=20&offset=0');
    return normalizePage(data, ['items', 'categories'], normalizeCategory);
  }

  async searchLots(options: SearchLotsOptions = {}): Promise<PageResult<LiveRoomLot>> {
    const data = await this.request(`/api/v1/search/lots?${lotSearchQuery(options)}`);
    return normalizePage(data, ['items', 'lots'], normalizeLot);
  }

  async searchLiveRooms(options: SearchLiveRoomsOptions = {}): Promise<PageResult<LiveRoom>> {
    const data = await this.request(`/api/v1/search/live-rooms?${liveRoomSearchQuery(options)}`);
    return normalizePage(data, ['items', 'rooms', 'liveRooms'], normalizeLiveRoom);
  }

  async searchMerchants(options: SearchMerchantsOptions = {}): Promise<PageResult<Merchant>> {
    const data = await this.request(`/api/v1/search/merchants?${merchantSearchQuery(options)}`);
    return normalizePage(data, ['items', 'merchants'], normalizeMerchant);
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
    return normalizePage(data, ['items', 'records'], normalizeAuctionRecord);
  }

  async getAuctionState(id: string): Promise<AuctionState> {
    const data = await this.request(`/api/v1/auctions/${id}/state`);
    return normalizeState(data as Record<string, unknown>);
  }

  async enrollAuction(id: string): Promise<EnrollResult> {
    return this.request(`/api/v1/auctions/${id}/enroll`, {
      method: 'POST',
      idempotencyKey: `enroll-${id}-${Date.now()}`,
      body: { depositPayChannel: 'MOCK_PAY' }
    });
  }

  async listMyOrders(options: ListOrderOptions = {}): Promise<PageResult<Order>> {
    const data = await this.request(`/api/v1/orders/mine?${orderQuery(options)}`);
    return normalizePage(data, ['items', 'orders'], normalizeOrder);
  }

  async getOrder(id: string): Promise<Order> {
    const data = await this.request(`/api/v1/orders/${id}`);
    return normalizeOrder(data as Record<string, unknown>);
  }

  async payOrder(id: string): Promise<Order> {
    const data = await this.request(`/api/v1/orders/${id}/pay`, {
      method: 'POST',
      idempotencyKey: `pay-${id}-${Date.now()}`,
      body: { payChannel: 'MOCK_PAY' }
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
      depositAmount: lot.depositAmount ?? demoEnrollResult.depositAmount
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
}

const remoteApiClient = new ApiClient(
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4523/m1/8317345-8081123-default'
);

export const defaultApiClient =
  import.meta.env.VITE_API_MODE === 'remote' ? remoteApiClient : new DemoApiClient();
