import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, DemoApiClient } from './api';

const ok = (data: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify({ code: 0, message: 'success', data, trace_id: 'trc_test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  );

const apiError = (status: number, code: number, message: string) =>
  Promise.resolve(
    new Response(JSON.stringify({ code, message, data: null, trace_id: 'trc_error' }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  );

describe('ApiClient', () => {
  it('logs in through the REST envelope', async () => {
    const fetcher = vi.fn(() =>
      ok({
        accessToken: 'jwt',
        refreshToken: 'rft',
        expiresIn: 43200,
        user: { id: 'u1', nickname: '竞拍用户', role: 'buyer' }
      })
    );
    const api = new ApiClient('http://mock.local', fetcher);

    const result = await api.login({ account: 'buyer001', password: 'Passw0rd!', role: 'buyer' });

    expect(result.accessToken).toBe('jwt');
    expect(fetcher).toHaveBeenCalledWith('http://mock.local/api/v1/auth/login', expect.objectContaining({ method: 'POST' }));
  });

  it('can use same-origin REST paths for reverse-proxy deployment', async () => {
    const fetcher = vi.fn(() =>
      ok({
        accessToken: 'jwt',
        refreshToken: 'rft',
        expiresIn: 43200,
        user: { id: 'u1', nickname: '竞拍用户', role: 'buyer' }
      })
    );
    const api = new ApiClient('', fetcher);

    await api.login({ account: 'buyer001', password: 'Passw0rd!', role: 'buyer' });

    expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/login', expect.objectContaining({ method: 'POST' }));
  });

  it('uses the live-session REST resources registered by the backend', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => ok({ sessions: [{ id: 1001, merchantId: 'merchant_01', title: '珠宝严选直播间', status: 'LIVE', viewerTotal: 1208, aiAssistantEnabled: false, cover_url: '/api/v1/images/live-list.png' }] }))
      .mockImplementationOnce(() => ok({ id: 1001, merchantId: 'merchant_01', title: '珠宝严选直播间', status: 'LIVE', activeAuctionId: 2001, aiAssistantEnabled: true, cover_url: '/api/v1/images/live-detail.png' }))
      .mockImplementationOnce(() =>
        ok({
          lots: [
            {
              auctionId: 2001,
              liveSessionId: 1001,
              sellerId: 'merchant_01',
              category: 'jewelry',
              title: '18K 金钻石项链',
              status: 'RUNNING',
              subtitle: 'Compact intro',
              description: 'Long detail text',
              startPrice: 0,
              currentPrice: 150100,
              startTime: '2026-06-04T12:00:00+08:00',
              endTime: '2026-06-04T12:00:00+08:00',
              ruleSnapshot: { extendSec: 10, antiSnipeSec: 15 },
              incrementRule: { type: 'fixed', amount: 100, maxBidSteps: 10 }
            }
          ]
        })
      )
      .mockImplementationOnce(() => ok({ liveSessionId: 1001, online: 328, viewerTotal: 1208, bidCount: 36 }));
    const api = new ApiClient('http://mock.local', fetcher);

    const rooms = await api.listLiveRooms();
    const room = await api.getLiveRoom('1001');
    const lots = await api.listLiveRoomLots('1001');
    const stats = await api.getLiveRoomStats('1001');

    expect(rooms.items[0]).toMatchObject({ id: '1001', title: '珠宝严选直播间', merchantId: 'merchant_01', status: 'LIVE', watcherCount: 1208, videoSource: 'recorded', aiAssistantEnabled: false, coverUrl: '/api/v1/images/live-list.png' });
    expect(room).toMatchObject({
      activeAuctionId: '2001',
      videoSource: 'digitalHuman',
      aiAssistantEnabled: true,
      coverUrl: '/api/v1/images/live-detail.png',
      digitalHuman: {
        idleVideoUrl: '/media/AI_Presenter_Silent.mp4',
        speakingVideoUrl: '/media/AI_Presenter_Speaking.mp4'
      }
    });
    expect(lots.items[0]).toMatchObject({
      auctionId: '2001',
      subtitle: 'Compact intro',
      description: 'Long detail text',
      currentPrice: 150100,
      startTsMs: Date.parse('2026-06-04T12:00:00+08:00'),
      ruleSnapshot: expect.objectContaining({ antiExtendSec: 10, antiSnipingSec: 15 })
    });
    expect(stats).toMatchObject({ roomId: '1001', onlineCount: 328, watcherCount: 1208, bidCount: 36 });
    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://mock.local/api/v1/live-sessions?limit=20&offset=0', expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(3, 'http://mock.local/api/v1/live-sessions/1001/lots', expect.any(Object));
  });

  it('preserves missing live room stats counters as non-finite sentinels while accepting explicit zero and aliases', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => ok({ liveSessionId: 1001, bidCount: 36 }))
      .mockImplementationOnce(() => ok({ liveSessionId: 1001, online_count: 0, viewer_count: 1208, bidCount: 37 }));
    const api = new ApiClient('http://mock.local', fetcher);

    const missingStats = await api.getLiveRoomStats('1001');
    const explicitStats = await api.getLiveRoomStats('1001');

    expect(Number.isFinite(missingStats.onlineCount)).toBe(false);
    expect(Number.isFinite(missingStats.watcherCount)).toBe(false);
    expect(explicitStats).toMatchObject({ roomId: '1001', onlineCount: 0, watcherCount: 1208, bidCount: 37 });
  });

  it('fetches the initial auction ranking through the HTTP snapshot endpoint', async () => {
    const fetcher = vi.fn(() =>
      ok({
        auctionId: 2001,
        ranking: [
          { rank: 1, bidderId: 'u2', bidderNickname: '初始用户', bidderAvatarUrl: 'https://cdn.example.com/u2.png', price: 150100 }
        ]
      })
    );
    const api = new ApiClient('http://mock.local', fetcher);

    const ranking = await api.getAuctionRanking('2001');

    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toMatchObject({ bidderId: 'u2', bidderNickname: '初始用户', bidderAvatarUrl: 'https://cdn.example.com/u2.png', price: 150100 });
    expect(fetcher).toHaveBeenCalledWith('http://mock.local/api/v1/auctions/2001/ranking?limit=10', expect.any(Object));
  });

  it('queries orders by auctionId and fetches order detail without old auction history endpoints', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        ok({
          orders: [
            {
              id: 2001,
              auctionId: 2001,
              liveSessionId: 9001,
              winnerId: 'u1',
              sellerId: 'merchant_01',
              dealPrice: 150100,
              status: 'CREATED',
              payStatus: 'UNPAID',
              lotSnapshot: {
                auctionId: 2001,
                liveSessionId: 9001,
                title: '后端订单拍品',
                coverUrl: '/api/v1/images/order.png',
                dealPrice: 150100,
                depositAmount: 5000
              }
            }
          ]
        })
      )
      .mockImplementationOnce(() => ok({ id: 2001, auctionId: 2001, winnerId: 'u1', sellerId: 'merchant_01', dealPrice: 150100, status: 'CREATED', payStatus: 'UNPAID' }));
    const api = new ApiClient('http://mock.local', fetcher);

    const orders = await api.listMyOrders({ auctionId: '2001' });
    const order = await api.getOrder('2001');

    expect(orders.items[0].auctionId).toBe('2001');
    expect(orders.items[0]).toMatchObject({
      liveSessionId: '9001',
      lotSnapshot: {
        title: '后端订单拍品',
        coverUrl: '/api/v1/images/order.png',
        depositAmount: 5000
      }
    });
    expect(order.amount).toBe(150100);
    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://mock.local/api/v1/orders/mine?limit=20&offset=0&auctionId=2001', expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://mock.local/api/v1/orders/2001', expect.any(Object));
  });

  it('confirms receipt through the order receive endpoint', async () => {
    const fetcher = vi.fn(() =>
      ok({
        id: 'ord_1',
        auctionId: 'auc_1',
        buyerId: 'u1',
        amount: 120000,
        status: 'PAID',
        payStatus: 'PAID',
        fulfillmentStatus: 'RECEIVED',
        receivedAt: '2026-06-05T12:00:00+08:00'
      })
    );
    const api = new ApiClient('http://mock.local', fetcher);

    const order = await api.confirmReceipt('ord_1');

    expect(order.fulfillmentStatus).toBe('RECEIVED');
    expect(order.receivedAt).toBe('2026-06-05T12:00:00+08:00');
    expect(fetcher).toHaveBeenCalledWith('http://mock.local/api/v1/orders/ord_1/receive', expect.objectContaining({ method: 'POST' }));
    expect((fetcher.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^receive-ord_1-/)
    });
  });

  it('normalizes order status aliases and snake_case response fields', async () => {
    const fetcher = vi.fn(() =>
      ok({
        orders: [
          {
            id: 57024847413760,
            auction_id: 56973840220672,
            live_session_id: 90000021,
            winner_id: '1001',
            seller_id: '2001',
            deal_price: 1700,
            status: 'shipped',
            pay_status: 'paid',
            fulfillment_status: 'delivered',
            lot_snapshot: {
              auctionId: 56973840220672,
              title: '复古机械表',
              dealPrice: 1700
            },
            shipped_at: '2026-06-07T08:36:23.28Z'
          }
        ]
      })
    );
    const api = new ApiClient('http://mock.local', fetcher);

    const orders = await api.listMyOrders({ status: 'PAID', fulfillmentStatus: 'SHIPPED' });

    expect(orders.items[0]).toMatchObject({
      auctionId: '56973840220672',
      liveSessionId: '90000021',
      buyerId: '1001',
      merchantId: '2001',
      amount: 1700,
      status: 'PAID',
      payStatus: 'PAID',
      fulfillmentStatus: 'SHIPPED',
      shippedAt: '2026-06-07T08:36:23.28Z'
    });
    expect(fetcher).toHaveBeenCalledWith('http://mock.local/api/v1/orders/mine?limit=20&offset=0&status=PAID&fulfillmentStatus=SHIPPED', expect.any(Object));
  });

  it('throws ApiError when business code is non-zero', async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ code: 50001, message: '出价过低', data: null, trace_id: 'trc_error' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    const api = new ApiClient('http://mock.local', fetcher);

    await expect(api.getAuctionState('2001')).rejects.toBeInstanceOf(ApiError);
  });

  it('refreshes an expired access token and retries the original request once', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => apiError(401, 10002, '访问令牌无效或已过期'))
      .mockImplementationOnce(() => ok({ accessToken: 'jwt_new', expiresIn: 43200 }))
      .mockImplementationOnce(() => ok({ auctionId: 2001, status: 'RUNNING', currentPrice: 150100, participantCount: 9, endTime: '2026-06-04T12:00:00+08:00' }));
    const refreshed = vi.fn();
    const api = new ApiClient('http://mock.local', fetcher);
    api.setToken('jwt_old');
    api.configureAuthRefresh({
      getRefreshToken: () => 'rft_1',
      onAccessTokenRefreshed: refreshed
    });

    const state = await api.getAuctionState('2001');

    expect(state.currentPrice).toBe(150100);
    expect(state.participantCount).toBe(9);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'http://mock.local/api/v1/auctions/2001/state',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt_old' })
      })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'http://mock.local/api/v1/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'rft_1' })
      })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      'http://mock.local/api/v1/auctions/2001/state',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt_new' })
      })
    );
    expect(refreshed).toHaveBeenCalledWith({ accessToken: 'jwt_new', expiresIn: 43200 });
  });

  it('normalizes the new search, merchant, and category REST resources', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => ok({ categories: [{ id: 'jewelry', name: '珠宝玉石', iconName: 'gem' }] }))
      .mockImplementationOnce(() =>
        ok({
          lots: [
            { auctionId: 1001, liveSessionId: 9001, sellerId: 'merchant_1', category: '珠宝玉石', categoryId: 'jewelry', title: '钻石项链', imageUrl: 'https://cdn.example.com/lot.jpg', status: 'RUNNING', startPrice: 0, currentPrice: 1000, participantCount: 12, endTime: '2026-06-04T12:00:00+08:00' },
            { auctionId: 1002, liveSessionId: 9001, sellerId: 'merchant_1', category: '珠宝玉石', categoryId: 'jewelry', title: '钻石手链', status: 'EXTENDED', startPrice: 0, currentPrice: 1200, participantCount: 8, endTime: '2026-06-04T12:03:00+08:00' },
            { auctionId: 1003, liveSessionId: 9001, sellerId: 'merchant_1', category: '珠宝玉石', categoryId: 'jewelry', title: '钻石戒指', status: 'READY', startPrice: 0, currentPrice: 800, participantCount: 3, endTime: '2026-06-04T12:10:00+08:00' }
          ]
        })
      )
      .mockImplementationOnce(() => ok({ sessions: [{ id: 9001, merchantId: 'merchant_1', merchantName: '云上珠宝', title: '珠宝直播间', status: 'LIVE', onlineCount: 12, viewerTotal: 99 }] }))
      .mockImplementationOnce(() => ok({ id: 'merchant_1', name: '云上珠宝', followerCount: 1200, location: '杭州' }))
      .mockImplementationOnce(() => ok({ sessions: [{ id: 9002, merchantId: 'merchant_1', merchantName: '云上珠宝', title: '商家直播中', status: 'LIVE', onlineCount: 8, viewerTotal: 18 }] }))
      .mockImplementationOnce(() => ok({ auctionId: 1001, liveSessionId: 9001, sellerId: 'merchant_1', category: 'jewelry', title: '钻石项链', status: 'RUNNING', startPrice: 0, currentPrice: 1000, endTime: '2026-06-04T12:00:00+08:00' }));
    const api = new ApiClient('http://mock.local', fetcher);

    const categories = await api.listCategories();
    const lots = await api.searchLots({ keyword: '钻石', sort: 'priceDesc', status: 'RUNNING', categoryId: 'jewelry' });
    const rooms = await api.searchLiveRooms({ keyword: '珠宝', sort: 'viewerDesc', status: 'live' });
    const merchant = await api.getMerchant('merchant_1');
    const merchantRooms = await api.listMerchantLiveSessions('merchant_1', { sort: 'openedAtDesc', status: 'live' });
    const lot = await api.getLot('lot_1');

    expect(categories.items[0].name).toBe('珠宝玉石');
    expect(lots.items[0]).toMatchObject({ id: '1001', merchantId: 'merchant_1', categoryId: 'jewelry', imageUrl: 'https://cdn.example.com/lot.jpg', participantCount: 12 });
    expect(lots.items.map((item) => item.status)).toEqual(['RUNNING', 'EXTENDED']);
    expect(rooms.items[0]).toMatchObject({ merchantName: '云上珠宝', onlineCount: 12, watcherCount: 99 });
    expect(merchant).toMatchObject({ id: 'merchant_1', location: '杭州' });
    expect(merchantRooms.items[0]).toMatchObject({ id: '9002', merchantId: 'merchant_1', status: 'LIVE' });
    expect(lot.title).toBe('钻石项链');
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://mock.local/api/v1/search/lots?limit=20&offset=0&keyword=%E9%92%BB%E7%9F%B3&sort=priceDesc&status=RUNNING&categoryId=jewelry', expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(3, 'http://mock.local/api/v1/live-sessions?limit=20&offset=0&keyword=%E7%8F%A0%E5%AE%9D&sort=viewerDesc&status=LIVE', expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(5, 'http://mock.local/api/v1/merchants/merchant_1/live-sessions?limit=20&offset=0&sort=openedAtDesc&status=LIVE', expect.any(Object));
  });

  it('keeps discover lot search limited to upcoming, warming, and running lots', async () => {
    const fetcher = vi.fn(() =>
      ok({
        lots: [
          { auctionId: 1001, liveSessionId: 9001, title: '待开拍拍品', status: 'READY', startPrice: 1000, currentPrice: 1000, endTime: '2026-06-04T12:00:00+08:00' },
          { auctionId: 1002, liveSessionId: 9001, title: '预热中拍品', status: 'WARMING_UP', startPrice: 1000, currentPrice: 1000, endTime: '2026-06-04T12:00:00+08:00' },
          { auctionId: 1003, liveSessionId: 9001, title: '竞拍中拍品', status: 'RUNNING', startPrice: 1000, currentPrice: 1200, endTime: '2026-06-04T12:00:00+08:00' },
          { auctionId: 1004, liveSessionId: 9001, title: '延时拍品', status: 'EXTENDED', startPrice: 1000, currentPrice: 1300, endTime: '2026-06-04T12:00:00+08:00' },
          { auctionId: 1005, liveSessionId: 9001, title: '落槌拍品', status: 'HAMMER_PENDING', startPrice: 1000, currentPrice: 1300, endTime: '2026-06-04T12:00:00+08:00' },
          { auctionId: 1006, liveSessionId: 9001, title: '成交拍品', status: 'CLOSED_WON', startPrice: 1000, currentPrice: 1300, endTime: '2026-06-04T12:00:00+08:00' },
          { auctionId: 1007, liveSessionId: 9001, title: '结算拍品', status: 'SETTLED', startPrice: 1000, currentPrice: 1300, endTime: '2026-06-04T12:00:00+08:00' }
        ],
        total: 7
      })
    );
    const api = new ApiClient('http://mock.local', fetcher);

    const lots = await api.searchLots();

    expect(lots.items.map((item) => item.status)).toEqual(['READY', 'WARMING_UP', 'RUNNING', 'EXTENDED']);
    expect(lots.total).toBe(4);
    expect(fetcher).toHaveBeenCalledWith('http://mock.local/api/v1/search/lots?limit=20&offset=0', expect.any(Object));
  });

  it('normalizes profile and my auction participation resources', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => ok({ id: 'u1', nickname: 'Buyer One', avatarUrl: 'data:image/jpeg;base64,old', role: 'buyer', status: 'ACTIVE' }))
      .mockImplementationOnce(() => ok({ id: 'u1', nickname: 'Buyer Two', avatarUrl: 'data:image/jpeg;base64,old', role: 'buyer', status: 'ACTIVE' }))
      .mockImplementationOnce(() =>
        ok({
          records: [
            {
              id: 'part_1',
              userId: 'u1',
              depositAmount: 5000,
              depositStatus: 'READY',
              lot: {
                auctionId: 1001,
                liveSessionId: 9001,
                sellerId: 'merchant_1',
                category: 'jewelry',
                title: 'Diamond Lot',
                status: 'RUNNING',
                currentPrice: 120000,
                endTime: '2026-06-04T12:00:00+08:00'
              },
              room: { id: 9001, merchantId: 'merchant_1', title: 'Jewelry Live', status: 'LIVE' },
              order: {
                id: 3001,
                auctionId: 1001,
                winnerId: 'u1',
                sellerId: 'merchant_1',
                dealPrice: 120000,
                status: 'PAID',
                payStatus: 'PAID',
                fulfillmentStatus: 'UNSHIPPED'
              }
            }
          ]
        })
      );
    const api = new ApiClient('http://mock.local', fetcher);

    const profile = await api.getMyProfile();
    const saved = await api.updateMyProfile({ userId: 'u1', nickname: 'Buyer Two', avatarUrl: 'data:image/jpeg;base64,new' });
    const records = await api.listMyAuctionRecords();

    expect(profile).toMatchObject({ userId: 'u1', nickname: 'Buyer One', favoriteCount: 0 });
    expect(saved).toMatchObject({ userId: 'u1', nickname: 'Buyer Two', avatarUrl: 'data:image/jpeg;base64,old' });
    expect(records.items[0]).toMatchObject({
      id: 'part_1',
      depositAmount: 5000,
      lot: { id: '1001', auctionId: '1001', status: 'RUNNING' },
      room: { id: '9001', title: 'Jewelry Live' },
      order: { id: '3001', amount: 120000, fulfillmentStatus: 'UNSHIPPED' }
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://mock.local/api/v1/auth/me', expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://mock.local/api/v1/auth/me', expect.objectContaining({ method: 'PATCH' }));
    expect((fetcher.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      'Idempotency-Key': expect.stringMatching(/^patch-\d+-[a-z0-9]+$/)
    });
    expect(fetcher).toHaveBeenNthCalledWith(3, 'http://mock.local/api/v1/auction-participations/mine?limit=20&offset=0', expect.any(Object));
  });

  it('uploads avatar as multipart form data without overriding the content type boundary', async () => {
    const fetcher = vi.fn(() => ok({ id: 'u1', nickname: 'Buyer One', avatarUrl: 'https://cdn.example.com/u1.jpg', role: 'buyer', status: 'ACTIVE' }));
    const api = new ApiClient('http://mock.local', fetcher);
    api.setToken('jwt');
    const avatar = new File(['cropped'], 'avatar.jpg', { type: 'image/jpeg' });

    const saved = await api.uploadMyAvatar(avatar, { userId: 'u1', nickname: 'Buyer One' });

    const request = fetcher.mock.calls[0][1] as RequestInit;
    expect(saved.avatarUrl).toBe('https://cdn.example.com/u1.jpg');
    expect(fetcher).toHaveBeenCalledWith('http://mock.local/api/v1/auth/me/avatar', expect.objectContaining({ method: 'POST' }));
    expect(request.body).toBeInstanceOf(FormData);
    const uploaded = (request.body as FormData).get('avatar');
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe('avatar.jpg');
    expect((uploaded as File).type).toBe('image/jpeg');
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer jwt',
      'Idempotency-Key': expect.stringMatching(/^post-\d+-[a-z0-9]+$/)
    });
    expect(request.headers).not.toHaveProperty('Content-Type');
  });

  it('uses local demo data by default for independent presentation', async () => {
    const fetcher = vi.fn();
    const api = new DemoApiClient(fetcher);

    const rooms = await api.listLiveRooms();
    const lots = await api.listLiveRoomLots(rooms.items[0].id);

    expect(fetcher).not.toHaveBeenCalled();
    expect(rooms.items[0].title).toContain('直播间');
    expect(lots.items.some((lot) => lot.status === 'RUNNING')).toBe(true);
    const runningLot = lots.items.find((lot) => lot.status === 'RUNNING');
    expect(runningLot?.endTsMs).toBeGreaterThan(Date.now());
    expect((runningLot?.endTsMs ?? 0) - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it('keeps local demo order state after payment and receipt confirmation', async () => {
    const api = new DemoApiClient(vi.fn());

    const paidOrder = await api.payOrder('ord_2001');
    const orderAfterPay = await api.getOrder('ord_2001');
    const ordersAfterPay = await api.listMyOrders({ auctionId: paidOrder.auctionId });
    const recordsAfterPay = await api.listMyAuctionRecords();
    const recordAfterPay = recordsAfterPay.items.find((record) => record.order?.id === 'ord_2001');

    expect(orderAfterPay).toMatchObject({ id: 'ord_2001', status: 'PAID', payStatus: 'PAID', fulfillmentStatus: 'UNSHIPPED' });
    expect(ordersAfterPay.items[0]).toMatchObject({ id: 'ord_2001', fulfillmentStatus: 'UNSHIPPED' });
    expect(recordAfterPay?.order).toMatchObject({ id: 'ord_2001', fulfillmentStatus: 'UNSHIPPED' });

    const receivedOrder = await api.confirmReceipt('ord_2001');
    const recordsAfterReceipt = await api.listMyAuctionRecords();
    const recordAfterReceipt = recordsAfterReceipt.items.find((record) => record.order?.id === 'ord_2001');

    expect(receivedOrder).toMatchObject({ id: 'ord_2001', fulfillmentStatus: 'RECEIVED' });
    expect(recordAfterReceipt?.order).toMatchObject({ id: 'ord_2001', fulfillmentStatus: 'RECEIVED' });
  });

  it('provides initial ranking snapshots in local demo mode', async () => {
    const api = new DemoApiClient(vi.fn());

    const ranking = await api.getAuctionRanking('auc_2001');

    expect(ranking.length).toBeGreaterThan(0);
    expect(ranking[0]).toMatchObject({ bidderNickname: '用户**02', bidderAvatarUrl: '/logo.png' });
  });

  it('provides five-image galleries for selected local demo lots', async () => {
    const api = new DemoApiClient(vi.fn());

    const lots = await api.listLiveRoomLots('room_1001');
    const galleryLots = lots.items.filter((lot) => lot.imageUrls?.length === 5);

    expect(galleryLots.length).toBeGreaterThanOrEqual(2);
    expect(galleryLots.every((lot) => lot.imageUrl === lot.imageUrls?.[0])).toBe(true);
    expect(galleryLots.flatMap((lot) => lot.imageUrls ?? []).every((url) => url.startsWith('/gallery/'))).toBe(true);
  });

  it('filters and sorts local demo search data for the redesigned H5 UI', async () => {
    const api = new DemoApiClient(vi.fn());

    const runningJewelry = await api.searchLots({ keyword: '钻石', status: 'RUNNING', categoryId: 'jewelry' });
    const liveRooms = await api.searchLiveRooms({ sort: 'viewerDesc', status: 'live' });
    const merchant = await api.getMerchant('merchant_1');
    const merchantRooms = await api.listMerchantLiveSessions(merchant.id, { status: 'live' });
    const profile = await api.updateMyProfile({ nickname: 'Demo Buyer' });
    const avatarProfile = await api.uploadMyAvatar(new Blob(['demo-avatar'], { type: 'image/jpeg' }), profile);
    const records = await api.listMyAuctionRecords();

    expect(runningJewelry.items).toHaveLength(1);
    expect(runningJewelry.items[0].title).toContain('钻石');
    expect(merchant.name).toContain('云上');
    expect(liveRooms.items.every((room) => room.status === 'LIVE')).toBe(true);
    expect(merchantRooms.items.every((room) => room.merchantId === merchant.id)).toBe(true);
    expect(profile.nickname).toBe('Demo Buyer');
    expect(avatarProfile.avatarUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(records.items.map((record) => record.depositStatus).every(Boolean)).toBe(true);
    expect(records.items.some((record) => record.order?.fulfillmentStatus === 'UNSHIPPED')).toBe(true);
    expect(records.items.some((record) => record.order?.fulfillmentStatus === 'SHIPPED')).toBe(true);
    expect(records.items.some((record) => record.order?.fulfillmentStatus === 'RECEIVED')).toBe(true);
  });
});
