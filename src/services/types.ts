export type UserRole = 'buyer' | 'merchant' | 'admin';

export type LiveRoomStatus = 'LIVE' | 'UPCOMING' | 'ENDED';

export type LiveRoomVideoSource = 'recorded' | 'digitalHuman';

export type AuctionStatus =
  | 'UPCOMING'
  | 'READY'
  | 'WARMING_UP'
  | 'RUNNING'
  | 'EXTENDED'
  | 'HAMMER_PENDING'
  | 'CLOSED_WON'
  | 'CLOSED_FAILED'
  | 'SETTLED'
  | 'CANCELED';

export interface User {
  id: string;
  nickname: string;
  role: UserRole;
  avatarUrl?: string;
  status?: string;
}

export interface LoginRequest {
  account: string;
  password: string;
  role: UserRole;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface AuctionRuleSnapshot {
  startPrice?: number;
  minIncrement?: number;
  ceilingPrice?: number;
  minBidIntervalMs?: number;
  antiSnipeSec?: number;
  extendSec?: number;
  [key: string]: unknown;
}

export interface LiveRoom {
  id: string;
  title: string;
  merchantId?: string;
  merchantName: string;
  status: LiveRoomStatus;
  videoSource?: LiveRoomVideoSource;
  coverUrl?: string;
  videoUrl?: string;
  digitalHuman?: {
    idleVideoUrl: string;
    speakingVideoUrl: string;
    ttsWsUrl?: string;
  };
  onlineCount: number;
  watcherCount: number;
  activeAuctionId?: string;
  liveSessionId?: number;
  startedAt?: string;
  endedAt?: string;
}

export interface LiveRoomStats {
  roomId: string;
  onlineCount: number;
  watcherCount: number;
  bidCount: number;
  gmvCent?: number;
}

export interface Category {
  id: string;
  name: string;
  iconName?: string;
}

export interface Merchant {
  id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
  followerCount: number;
  fansCount?: number;
  rating?: number;
  liveRoomId?: string;
  location?: string;
}

export interface UserProfile {
  userId: string;
  nickname: string;
  avatarUrl?: string;
  reminderCount: number;
  favoriteCount: number;
  followingCount: number;
  footprintCount: number;
}

export interface LiveRoomLot {
  id: string;
  auctionId: string;
  roomId: string;
  merchantId?: string;
  categoryId?: string;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  status: AuctionStatus;
  startPrice: number;
  currentPrice: number;
  finalPrice?: number;
  leaderBidderId?: string;
  startTsMs?: number;
  endTsMs: number;
  ruleSnapshot?: AuctionRuleSnapshot;
  depositAmount?: number;
  participantCount?: number;
  bidCount?: number;
  sortOrder?: number;
  publishedAt?: string;
}

export type LotSortKey = 'default' | 'auctionTime' | 'publishedAt' | 'priceAsc' | 'priceDesc';

export type LotStatusFilter = 'all' | 'running' | 'ended' | 'failed' | 'upcoming';

export interface SearchLotsOptions {
  keyword?: string;
  sort?: LotSortKey;
  status?: LotStatusFilter;
  categoryId?: string;
  merchantId?: string;
}

export type LiveRoomSortKey = 'default' | 'lotCount' | 'gmv' | 'watchers';

export type LiveRoomStatusFilter = 'all' | 'ended' | 'live' | 'upcoming';

export interface SearchLiveRoomsOptions {
  keyword?: string;
  sort?: LiveRoomSortKey;
  status?: LiveRoomStatusFilter;
}

export interface SearchMerchantsOptions {
  keyword?: string;
}

export type MyAuctionTabKey = 'all' | 'pendingBid' | 'pendingPay' | 'pendingShipment' | 'pendingReceipt' | 'completed';

export interface FollowedLiveRoom {
  roomId: string;
  title: string;
  merchantName: string;
  coverUrl?: string;
  followedAt: string;
}

export interface LiveRoomFootprint {
  roomId: string;
  title: string;
  merchantName: string;
  coverUrl?: string;
  viewedAt: string;
}

export type OrderFulfillmentStatus = 'UNSHIPPED' | 'SHIPPED' | 'RECEIVED';

export interface UserAuctionRecord {
  id: string;
  userId: string;
  lot: LiveRoomLot;
  room?: LiveRoom;
  order?: Order;
  depositAmount: number;
  depositStatus: string;
  enrolledAt?: string;
}

export interface AvatarCropState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface AuctionState {
  auctionId: string;
  status: AuctionStatus;
  currentPrice: number;
  leaderBidderId?: string;
  bidCount?: number;
  participantCount?: number;
  endTsMs: number;
  serverTsMs: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface EnrollResult {
  auctionId: string;
  userId: string;
  enrolled: boolean;
  depositLedgerId: string;
  depositAmount: number;
  depositStatus: string;
}

export interface ListOrderOptions {
  auctionId?: string;
  status?: string;
  payStatus?: string;
  limit?: number;
  offset?: number;
}

export interface Order {
  id: string;
  auctionId: string;
  buyerId: string;
  merchantId?: string;
  amount: number;
  status: 'PENDING_PAY' | 'PAID' | 'CANCELED' | 'REFUNDED' | string;
  payStatus?: string;
  fulfillmentStatus?: OrderFulfillmentStatus;
  createdAt?: string;
  paidAt?: string;
  shippedAt?: string;
  receivedAt?: string;
}

export interface RankingItem {
  rank: number;
  bidderId: string;
  nicknameMask: string;
  avatarUrl?: string;
  price: number;
  bidTsMs: number;
}

export interface LiveChatMessage {
  id: string;
  roomId: string;
  userId?: string;
  nickname: string;
  avatarUrl?: string;
  content: string;
  createdAt: string;
  clientMessageId?: string;
  system?: boolean;
  pending?: boolean;
  failed?: boolean;
}
