import type {
  AuctionState,
  AuctionStatus,
  Category,
  EnrollResult,
  LiveRoom,
  LiveRoomLot,
  LiveRoomStats,
  LiveRoomStatus,
  LiveRoomStatusFilter,
  LiveRoomSortKey,
  LoginResult,
  LotSortKey,
  LotStatusFilter,
  Merchant,
  Order,
  PageResult,
  SearchLiveRoomsOptions,
  SearchLotsOptions,
  SearchMerchantsOptions,
  UserAuctionRecord,
  UserProfile
} from './types';

const now = Date.now();

export const demoLoginResult: LoginResult = {
  accessToken: 'demo_access_token',
  refreshToken: 'demo_refresh_token',
  expiresIn: 43_200,
  user: {
    id: 'u1',
    nickname: '竞拍用户001',
    role: 'buyer',
    avatarUrl: '',
    status: 'ACTIVE'
  }
};

export const demoCategories: Category[] = [
  { id: 'jewelry', name: '珠宝玉石', iconName: 'gem' },
  { id: 'watch', name: '腕表钟表', iconName: 'watch' },
  { id: 'craft', name: '工艺收藏', iconName: 'sparkles' },
  { id: 'fashion', name: '潮流配饰', iconName: 'shopping-bag' },
  { id: 'tea', name: '茶酒滋补', iconName: 'leaf' },
  { id: 'digital', name: '数码潮玩', iconName: 'badge' },
  { id: 'painting', name: '书画篆刻', iconName: 'sparkles' },
  { id: 'ceramic', name: '瓷器陶艺', iconName: 'badge' },
  { id: 'wine', name: '名酒陈酿', iconName: 'leaf' },
  { id: 'bag', name: '箱包皮具', iconName: 'shopping-bag' },
  { id: 'coin', name: '钱币邮票', iconName: 'badge' },
  { id: 'furniture', name: '古典家具', iconName: 'sparkles' },
  { id: 'camera', name: '影像器材', iconName: 'badge' },
  { id: 'music', name: '乐器音响', iconName: 'sparkles' },
  { id: 'outdoor', name: '户外收藏', iconName: 'badge' }
];

export const demoUserProfile: UserProfile = {
  userId: demoLoginResult.user.id,
  nickname: demoLoginResult.user.nickname,
  avatarUrl: demoLoginResult.user.avatarUrl,
  reminderCount: 1,
  favoriteCount: 0,
  followingCount: 0,
  footprintCount: 4
};

export const demoMerchants: Merchant[] = [
  {
    id: 'merchant_01',
    name: '云上珠宝',
    avatarUrl: '/logo.png',
    description: '专注珠宝玉石、设计师首饰和轻奢收藏的直播拍卖商家。',
    followerCount: 128_000,
    fansCount: 128_000,
    rating: 4.9,
    liveRoomId: 'room_1001',
    location: '杭州'
  },
  {
    id: 'merchant_02',
    name: '时计公社',
    avatarUrl: '/logo.png',
    description: '腕表、古董钟和机械计时藏品专场。',
    followerCount: 68_400,
    fansCount: 68_400,
    rating: 4.8,
    liveRoomId: 'room_1002',
    location: '上海'
  },
  {
    id: 'merchant_03',
    name: '潮物研究所',
    avatarUrl: '/logo.png',
    description: '潮流配饰、艺术玩具和限量收藏集合店。',
    followerCount: 42_900,
    fansCount: 42_900,
    rating: 4.7,
    liveRoomId: 'room_1003',
    location: '深圳'
  }
];

export const demoLiveRoom: LiveRoom = {
  id: 'room_1001',
  title: '珠宝严选直播间',
  merchantId: 'merchant_01',
  merchantName: '云上珠宝',
  status: 'LIVE',
  videoSource: 'recorded',
  coverUrl: '/logo.png',
  videoUrl: '/media/live-room-demo.mp4',
  onlineCount: 328,
  watcherCount: 1208,
  activeAuctionId: 'auc_2001',
  liveSessionId: 9001,
  startedAt: new Date(now - 30 * 60_000).toISOString()
};

export const demoLiveRoomPage: PageResult<LiveRoom> = {
  items: [
    demoLiveRoom,
    {
      id: 'room_1002',
      title: '潮奢腕表夜场',
      merchantId: 'merchant_02',
      merchantName: '时计公社',
      status: 'SCHEDULED',
      videoSource: 'recorded',
      coverUrl: '/logo.png',
      videoUrl: '/media/live-room-demo.mp4',
      onlineCount: 86,
      watcherCount: 412,
      activeAuctionId: 'auc_2101',
      liveSessionId: 9002,
      startedAt: new Date(now + 50 * 60_000).toISOString()
    },
    {
      id: 'room_1003',
      title: '潮玩收藏收官专场',
      merchantId: 'merchant_03',
      merchantName: '潮物研究所',
      status: 'ENDED',
      videoSource: 'recorded',
      coverUrl: '/logo.png',
      videoUrl: '/media/live-room-demo.mp4',
      onlineCount: 0,
      watcherCount: 2356,
      activeAuctionId: 'auc_2201',
      liveSessionId: 9003,
      startedAt: new Date(now - 4 * 60 * 60_000).toISOString(),
      endedAt: new Date(now - 2 * 60 * 60_000).toISOString()
    },
    {
      id: 'room_1004',
      title: '腕表快闪直播间',
      merchantId: 'merchant_02',
      merchantName: '时计公社',
      status: 'LIVE',
      videoSource: 'digitalHuman',
      coverUrl: '/logo.png',
      digitalHuman: {
        idleVideoUrl: '/media/AI_Presenter_Silent.mp4',
        speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4'
      },
      onlineCount: 192,
      watcherCount: 873,
      activeAuctionId: 'auc_2301',
      liveSessionId: 9004,
      startedAt: new Date(now - 18 * 60_000).toISOString()
    }
  ],
  total: 4,
  page: 1,
  page_size: 20
};

export const demoLots: LiveRoomLot[] = [
  {
    id: 'lot_3001',
    auctionId: 'auc_2001',
    roomId: 'room_1001',
    merchantId: 'merchant_01',
    categoryId: 'jewelry',
    title: '18K 金钻石项链',
    subtitle: 'GIA 证书 主播实拍',
    description: '精选高净度钻石与 18K 金链身，适合直播间近景展示和高频竞拍。',
    imageUrl: '',
    status: 'RUNNING',
    startPrice: 0,
    currentPrice: 150_100,
    leaderBidderId: 'u2',
    startTsMs: now - 120_000,
    endTsMs: now + 240_000,
    publishedAt: new Date(now - 2 * 60 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 0,
      incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 },
      capPrice: 188_800,
      antiSnipingSec: 15,
      antiExtendSec: 10
    },
    depositAmount: 5000,
    participantCount: 128,
    bidCount: 36,
    sortOrder: 1
  },
  {
    id: 'lot_3002',
    auctionId: 'auc_2002',
    roomId: 'room_1001',
    merchantId: 'merchant_01',
    categoryId: 'jewelry',
    title: '翡翠冰种吊坠',
    subtitle: '老坑料 直播间专拍',
    description: '冰种翡翠吊坠，未开始前可查看规则和报名。',
    imageUrl: '',
    status: 'READY',
    startPrice: 0,
    currentPrice: 0,
    startTsMs: now + 10 * 60_000,
    endTsMs: now + 25 * 60_000,
    publishedAt: new Date(now - 90 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 0,
      incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 },
      capPrice: 92_000,
      antiSnipingSec: 15,
      antiExtendSec: 10
    },
    depositAmount: 5000,
    participantCount: 46,
    bidCount: 0,
    sortOrder: 2
  },
  {
    id: 'lot_3003',
    auctionId: 'auc_2003',
    roomId: 'room_1001',
    merchantId: 'merchant_01',
    categoryId: 'craft',
    title: '复古珍珠胸针',
    subtitle: '已落槌 待支付',
    description: '已成交拍品，用于展示落槌价和结果入口。',
    imageUrl: '',
    status: 'CLOSED_WON',
    startPrice: 0,
    currentPrice: 46_600,
    finalPrice: 46_600,
    leaderBidderId: demoLoginResult.user.id,
    startTsMs: now - 40 * 60_000,
    endTsMs: now - 25 * 60_000,
    publishedAt: new Date(now - 6 * 60 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 0,
      incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 },
      capPrice: 80_000,
      antiSnipingSec: 15,
      antiExtendSec: 10
    },
    depositAmount: 3000,
    participantCount: 72,
    bidCount: 24,
    sortOrder: 3
  },
  {
    id: 'lot_3004',
    auctionId: 'auc_2004',
    roomId: 'room_1001',
    merchantId: 'merchant_01',
    categoryId: 'fashion',
    title: '设计师银质手镯',
    subtitle: '流拍 可回看',
    description: '无有效出价的已结束拍品，用于展示流拍状态。',
    imageUrl: '',
    status: 'CLOSED_FAILED',
    startPrice: 0,
    currentPrice: 0,
    startTsMs: now - 70 * 60_000,
    endTsMs: now - 58 * 60_000,
    publishedAt: new Date(now - 8 * 60 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 0,
      incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 },
      antiSnipingSec: 15,
      antiExtendSec: 10
    },
    depositAmount: 2000,
    participantCount: 18,
    bidCount: 0,
    sortOrder: 4
  },
  {
    id: 'lot_3101',
    auctionId: 'auc_2101',
    roomId: 'room_1002',
    merchantId: 'merchant_02',
    categoryId: 'watch',
    title: '机械计时码表',
    subtitle: '夜场重点拍品',
    description: '计时码表待开拍，展示待开播直播间的商品列表。',
    imageUrl: '',
    status: 'READY',
    startPrice: 88_000,
    currentPrice: 88_000,
    startTsMs: now + 50 * 60_000,
    endTsMs: now + 70 * 60_000,
    publishedAt: new Date(now - 3 * 60 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 88_000,
      incrementRule: { type: 'fixed', amount: 1000, maxBidSteps: 10 },
      capPrice: 168_000,
      antiSnipingSec: 20,
      antiExtendSec: 15
    },
    depositAmount: 10_000,
    participantCount: 29,
    bidCount: 0,
    sortOrder: 1
  },
  {
    id: 'lot_3102',
    auctionId: 'auc_2102',
    roomId: 'room_1002',
    merchantId: 'merchant_02',
    categoryId: 'watch',
    title: '古董怀表套装',
    subtitle: '待开播场次',
    description: '古董怀表与原盒证书套装，适合收藏用户。',
    imageUrl: '',
    status: 'READY',
    startPrice: 42_000,
    currentPrice: 42_000,
    startTsMs: now + 72 * 60_000,
    endTsMs: now + 92 * 60_000,
    publishedAt: new Date(now - 2.5 * 60 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 42_000,
      incrementRule: { type: 'fixed', amount: 500, maxBidSteps: 10 },
      antiSnipingSec: 20,
      antiExtendSec: 15
    },
    depositAmount: 5000,
    participantCount: 18,
    bidCount: 0,
    sortOrder: 2
  },
  {
    id: 'lot_3301',
    auctionId: 'auc_2301',
    roomId: 'room_1004',
    merchantId: 'merchant_02',
    categoryId: 'watch',
    title: '复古潜水腕表',
    subtitle: '快闪直播竞拍中',
    description: '适合发现页直播流切换验收的进行中腕表拍品。',
    imageUrl: '',
    status: 'RUNNING',
    startPrice: 50_000,
    currentPrice: 56_000,
    leaderBidderId: 'u6',
    startTsMs: now - 8 * 60_000,
    endTsMs: now + 180_000,
    publishedAt: new Date(now - 90 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 50_000,
      incrementRule: { type: 'fixed', amount: 500, maxBidSteps: 10 },
      capPrice: 98_000,
      antiSnipingSec: 20,
      antiExtendSec: 15
    },
    depositAmount: 5000,
    participantCount: 42,
    bidCount: 9,
    sortOrder: 1
  },
  {
    id: 'lot_3201',
    auctionId: 'auc_2201',
    roomId: 'room_1003',
    merchantId: 'merchant_03',
    categoryId: 'digital',
    title: '限量艺术玩具套组',
    subtitle: '本场已成交',
    description: '潮玩收藏收官专场成交拍品，用于直播结束页展示成交详情。',
    imageUrl: '',
    status: 'CLOSED_WON',
    startPrice: 0,
    currentPrice: 32_800,
    finalPrice: 32_800,
    leaderBidderId: 'u8',
    startTsMs: now - 3 * 60 * 60_000,
    endTsMs: now - 2.8 * 60 * 60_000,
    publishedAt: new Date(now - 10 * 60 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 0,
      incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 },
      antiSnipingSec: 15,
      antiExtendSec: 10
    },
    depositAmount: 3000,
    participantCount: 56,
    bidCount: 18,
    sortOrder: 1
  },
  {
    id: 'lot_3202',
    auctionId: 'auc_2202',
    roomId: 'room_1003',
    merchantId: 'merchant_03',
    categoryId: 'fashion',
    title: '联名潮流项链',
    subtitle: '本场流拍',
    description: '已结束但未成交，用于展示已流拍筛选。',
    imageUrl: '',
    status: 'CLOSED_FAILED',
    startPrice: 12_000,
    currentPrice: 12_000,
    startTsMs: now - 2.7 * 60 * 60_000,
    endTsMs: now - 2.5 * 60 * 60_000,
    publishedAt: new Date(now - 9 * 60 * 60_000).toISOString(),
    ruleSnapshot: {
      startPrice: 12_000,
      incrementRule: { type: 'fixed', amount: 200, maxBidSteps: 10 },
      antiSnipingSec: 15,
      antiExtendSec: 10
    },
    depositAmount: 2000,
    participantCount: 23,
    bidCount: 0,
    sortOrder: 2
  }
];

export const demoLotPage: PageResult<LiveRoomLot> = {
  items: demoLots.filter((lot) => lot.roomId === demoLiveRoom.id),
  total: demoLots.filter((lot) => lot.roomId === demoLiveRoom.id).length,
  page: 1,
  page_size: 20
};

export const demoLiveRoomStats: LiveRoomStats = {
  roomId: demoLiveRoom.id,
  onlineCount: demoLiveRoom.onlineCount,
  watcherCount: demoLiveRoom.watcherCount,
  bidCount: demoLots.filter((lot) => lot.roomId === demoLiveRoom.id).reduce((sum, lot) => sum + (lot.bidCount ?? 0), 0),
  gmvCent: 46_600
};

export const demoAuctionState: AuctionState = {
  auctionId: demoLots[0].auctionId,
  status: demoLots[0].status,
  currentPrice: demoLots[0].currentPrice,
  leaderBidderId: demoLots[0].leaderBidderId,
  bidCount: demoLots[0].bidCount,
  participantCount: demoLots[0].participantCount,
  endTsMs: demoLots[0].endTsMs,
  serverTsMs: Date.now()
};

export const demoEnrollResult: EnrollResult = {
  auctionId: demoLots[0].auctionId,
  userId: demoLoginResult.user.id,
  enrolled: true,
  depositLedgerId: 'deposit_2001',
  depositAmount: demoLots[0].depositAmount ?? 5000,
  depositStatus: 'FROZEN'
};

export const demoOrderPage: PageResult<Order> = {
  items: [
    {
      id: 'ord_2001',
      auctionId: demoLots[0].auctionId,
      buyerId: demoLoginResult.user.id,
      merchantId: demoLiveRoom.merchantId,
      amount: demoLots[0].currentPrice,
      status: 'PENDING_PAY',
      payStatus: 'UNPAID',
      createdAt: new Date().toISOString()
    },
    {
      id: 'ord_2003',
      auctionId: demoLots[2].auctionId,
      buyerId: demoLoginResult.user.id,
      merchantId: demoLiveRoom.merchantId,
      amount: demoLots[2].finalPrice ?? demoLots[2].currentPrice,
      status: 'PENDING_PAY',
      payStatus: 'UNPAID',
      createdAt: new Date(now - 25 * 60_000).toISOString()
    },
    {
      id: 'ord_profile_ship',
      auctionId: 'auc_profile_ship',
      buyerId: demoLoginResult.user.id,
      merchantId: demoLiveRoom.merchantId,
      amount: 52_000,
      status: 'PAID',
      payStatus: 'PAID',
      fulfillmentStatus: 'UNSHIPPED',
      createdAt: new Date(now - 3 * 60 * 60_000).toISOString(),
      paidAt: new Date(now - 2.8 * 60 * 60_000).toISOString()
    },
    {
      id: 'ord_profile_receipt',
      auctionId: 'auc_profile_receipt',
      buyerId: demoLoginResult.user.id,
      merchantId: demoLiveRoom.merchantId,
      amount: 68_000,
      status: 'PAID',
      payStatus: 'PAID',
      fulfillmentStatus: 'SHIPPED',
      createdAt: new Date(now - 28 * 60 * 60_000).toISOString(),
      paidAt: new Date(now - 27 * 60 * 60_000).toISOString(),
      shippedAt: new Date(now - 8 * 60 * 60_000).toISOString()
    },
    {
      id: 'ord_profile_done',
      auctionId: 'auc_profile_done',
      buyerId: demoLoginResult.user.id,
      merchantId: demoLiveRoom.merchantId,
      amount: 79_000,
      status: 'PAID',
      payStatus: 'PAID',
      fulfillmentStatus: 'RECEIVED',
      createdAt: new Date(now - 72 * 60 * 60_000).toISOString(),
      paidAt: new Date(now - 71 * 60 * 60_000).toISOString(),
      shippedAt: new Date(now - 48 * 60 * 60_000).toISOString(),
      receivedAt: new Date(now - 2 * 60 * 60_000).toISOString()
    }
  ],
  total: 5,
  page: 1,
  page_size: 20
};

export const demoAuctionRecords: UserAuctionRecord[] = [
  {
    id: 'record_waiting_2002',
    userId: demoLoginResult.user.id,
    lot: demoLots[1],
    room: findDemoLiveRoom(demoLots[1].roomId),
    depositAmount: demoLots[1].depositAmount ?? 0,
    depositStatus: 'FROZEN',
    enrolledAt: new Date(now - 12 * 60_000).toISOString()
  },
  {
    id: 'record_bidding_2001',
    userId: demoLoginResult.user.id,
    lot: demoLots[0],
    room: findDemoLiveRoom(demoLots[0].roomId),
    depositAmount: demoLots[0].depositAmount ?? 0,
    depositStatus: 'FROZEN',
    enrolledAt: new Date(now - 24 * 60_000).toISOString()
  },
  {
    id: 'record_ended_2004',
    userId: demoLoginResult.user.id,
    lot: demoLots[3],
    room: findDemoLiveRoom(demoLots[3].roomId),
    depositAmount: demoLots[3].depositAmount ?? 0,
    depositStatus: 'RELEASED',
    enrolledAt: new Date(now - 80 * 60_000).toISOString()
  },
  {
    id: 'record_won_2003',
    userId: demoLoginResult.user.id,
    lot: demoLots[2],
    room: findDemoLiveRoom(demoLots[2].roomId),
    order: demoOrderPage.items[1],
    depositAmount: demoLots[2].depositAmount ?? 0,
    depositStatus: 'APPLIED',
    enrolledAt: new Date(now - 50 * 60_000).toISOString()
  },
  {
    id: 'record_ship_profile',
    userId: demoLoginResult.user.id,
    lot: {
      ...demoLots[2],
      id: 'lot_profile_ship',
      auctionId: 'auc_profile_ship',
      title: '宸叉敮浠樺緟鍙戣揣鎷嶅搧',
      currentPrice: 52_000,
      finalPrice: 52_000
    },
    room: findDemoLiveRoom(demoLots[2].roomId),
    order: demoOrderPage.items[2],
    depositAmount: demoLots[2].depositAmount ?? 0,
    depositStatus: 'APPLIED',
    enrolledAt: new Date(now - 3 * 60 * 60_000).toISOString()
  },
  {
    id: 'record_receipt_profile',
    userId: demoLoginResult.user.id,
    lot: {
      ...demoLots[2],
      id: 'lot_profile_receipt',
      auctionId: 'auc_profile_receipt',
      title: '宸插彂璐у緟鏀惰揣鎷嶅搧',
      currentPrice: 68_000,
      finalPrice: 68_000
    },
    room: findDemoLiveRoom(demoLots[2].roomId),
    order: demoOrderPage.items[3],
    depositAmount: demoLots[2].depositAmount ?? 0,
    depositStatus: 'APPLIED',
    enrolledAt: new Date(now - 28 * 60 * 60_000).toISOString()
  },
  {
    id: 'record_done_profile',
    userId: demoLoginResult.user.id,
    lot: {
      ...demoLots[2],
      id: 'lot_profile_done',
      auctionId: 'auc_profile_done',
      title: '已完成拍品',
      currentPrice: 79_000,
      finalPrice: 79_000
    },
    room: findDemoLiveRoom(demoLots[2].roomId),
    order: demoOrderPage.items[4],
    depositAmount: demoLots[2].depositAmount ?? 0,
    depositStatus: 'APPLIED',
    enrolledAt: new Date(now - 72 * 60 * 60_000).toISOString()
  }
];

export const demoPaidOrder: Order = {
  ...demoOrderPage.items[0],
  status: 'PAID',
  payStatus: 'PAID',
  fulfillmentStatus: 'UNSHIPPED',
  paidAt: new Date().toISOString()
};

export function listDemoCategories(): PageResult<Category> {
  return toPage(demoCategories);
}

export function findDemoLiveRoom(id: string): LiveRoom {
  return demoLiveRoomPage.items.find((room) => room.id === id) ?? demoLiveRoom;
}

export function findDemoLiveRoomStats(roomId: string): LiveRoomStats {
  const room = findDemoLiveRoom(roomId);
  const roomLots = demoLots.filter((lot) => lot.roomId === roomId);
  return {
    roomId,
    onlineCount: room.onlineCount,
    watcherCount: room.watcherCount,
    bidCount: roomLots.reduce((sum, lot) => sum + (lot.bidCount ?? 0), 0),
    gmvCent: roomLots.reduce((sum, lot) => sum + (lot.finalPrice ?? 0), 0)
  };
}

export function listDemoLots(roomId: string): PageResult<LiveRoomLot> {
  return toPage(demoLots.filter((lot) => lot.roomId === roomId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
}

export function findDemoLot(id: string): LiveRoomLot {
  return demoLots.find((lot) => lot.id === id) ?? demoLots[0];
}

export function findDemoLotByAuctionId(auctionId: string): LiveRoomLot {
  return demoLots.find((lot) => lot.auctionId === auctionId) ?? demoLots[0];
}

export function findDemoMerchant(id: string): Merchant {
  return demoMerchants.find((merchant) => merchant.id === id) ?? demoMerchants[0];
}

export function findDemoOrder(id: string): Order {
  return demoOrderPage.items.find((order) => order.id === id) ?? demoOrderPage.items[0];
}

export function getDemoUserProfile(): UserProfile {
  return demoUserProfile;
}

export function updateDemoUserProfile(profile: Partial<UserProfile>): UserProfile {
  return {
    ...demoUserProfile,
    ...profile
  };
}

export function listDemoAuctionRecords(): PageResult<UserAuctionRecord> {
  return toPage(demoAuctionRecords);
}

export function searchDemoLots(options: SearchLotsOptions = {}): PageResult<LiveRoomLot> {
  const keyword = normalizeKeyword(options.keyword);
  const items = demoLots
    .filter((lot) => !keyword || normalizeKeyword(lot.title).includes(keyword))
    .filter((lot) => !options.merchantId || lot.merchantId === options.merchantId)
    .filter((lot) => !options.categoryId || options.categoryId === 'all' || lot.categoryId === options.categoryId)
    .filter((lot) => matchLotStatus(lot.status, options.status ?? 'all'))
    .sort(lotSorter(options.sort ?? 'default'));
  return toPage(items);
}

export function searchDemoLiveRooms(options: SearchLiveRoomsOptions = {}): PageResult<LiveRoom> {
  const keyword = normalizeKeyword(options.keyword);
  const items = demoLiveRoomPage.items
    .filter((room) => !keyword || liveRoomMatchesKeyword(room, keyword))
    .filter((room) => matchLiveRoomStatus(room.status, options.status ?? 'all'))
    .sort(liveRoomSorter(options.sort ?? 'default'));
  return toPage(items);
}

export function searchDemoMerchants(options: SearchMerchantsOptions = {}): PageResult<Merchant> {
  const keyword = normalizeKeyword(options.keyword);
  const items = demoMerchants.filter((merchant) => !keyword || normalizeKeyword(merchant.name).includes(keyword));
  return toPage(items);
}

function normalizeKeyword(value?: string): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

function liveRoomMatchesKeyword(room: LiveRoom, keyword: string): boolean {
  return [room.title, room.description, room.merchantId].some((value) => normalizeKeyword(value).includes(keyword));
}

function toPage<T>(items: T[]): PageResult<T> {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 20
  };
}

function matchLotStatus(status: AuctionStatus, filter: LotStatusFilter): boolean {
  if (filter === 'all') return true;
  return status === filter;
}

function matchLiveRoomStatus(status: LiveRoomStatus, filter: LiveRoomStatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'live') return status === 'LIVE';
  if (filter === 'upcoming') return status === 'SCHEDULED' || status === 'DRAFT';
  return status === 'ENDED';
}

function lotSorter(sort: LotSortKey) {
  return (a: LiveRoomLot, b: LiveRoomLot) => {
    if (sort === 'auctionTime') return (a.startTsMs ?? 0) - (b.startTsMs ?? 0);
    if (sort === 'publishedAt') return Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '');
    if (sort === 'priceAsc') return lotPrice(a) - lotPrice(b);
    if (sort === 'priceDesc') return lotPrice(b) - lotPrice(a);
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  };
}

function liveRoomSorter(sort: LiveRoomSortKey) {
  return (a: LiveRoom, b: LiveRoom) => {
    if (sort === 'oldest' || sort === 'createdAtAsc') return liveRoomSortId(a) - liveRoomSortId(b);
    if (sort === 'startTimeAsc') return liveRoomTime(a.startedAt) - liveRoomTime(b.startedAt);
    if (sort === 'startTimeDesc') return liveRoomTime(b.startedAt) - liveRoomTime(a.startedAt);
    if (sort === 'openedAtAsc') return liveRoomTime(a.startedAt) - liveRoomTime(b.startedAt);
    if (sort === 'openedAtDesc') return liveRoomTime(b.startedAt) - liveRoomTime(a.startedAt);
    if (sort === 'gmvDesc') return (findDemoLiveRoomStats(b.id).gmvCent ?? 0) - (findDemoLiveRoomStats(a.id).gmvCent ?? 0);
    if (sort === 'viewerDesc' || sort === 'viewerPeakDesc') return b.watcherCount - a.watcherCount;
    return liveRoomSortId(b) - liveRoomSortId(a);
  };
}

function lotPrice(lot: LiveRoomLot): number {
  return lot.finalPrice ?? lot.currentPrice ?? lot.startPrice;
}

function liveRoomSortId(room: LiveRoom): number {
  return room.liveSessionId ?? (Number(room.id.replace(/\D/g, '')) || 0);
}

function liveRoomTime(value?: string): number {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}
