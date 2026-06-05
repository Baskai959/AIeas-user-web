import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, DemoApiClient } from './api';

const ok = (data: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify({ code: 0, message: 'success', data, trace_id: 'trc_test' }), {
      status: 200,
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

  it('uses the live-session REST resources registered by the backend', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => ok({ sessions: [{ id: 1001, merchantId: 'merchant_01', title: '珠宝严选直播间', status: 'LIVE', viewerTotal: 1208 }] }))
      .mockImplementationOnce(() => ok({ id: 1001, merchantId: 'merchant_01', title: '珠宝严选直播间', status: 'LIVE', activeAuctionId: 2001 }))
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
              startPrice: 0,
              currentPrice: 150100,
              endTime: '2026-06-04T12:00:00+08:00',
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

    expect(rooms.items[0]).toMatchObject({ id: '1001', title: '珠宝严选直播间', merchantId: 'merchant_01', status: 'LIVE', watcherCount: 1208 });
    expect(room.activeAuctionId).toBe('2001');
    expect(lots.items[0]).toMatchObject({ auctionId: '2001', currentPrice: 150100 });
    expect(stats).toMatchObject({ roomId: '1001', onlineCount: 328, watcherCount: 1208, bidCount: 36 });
    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://mock.local/api/v1/live-sessions?limit=20&offset=0', expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(3, 'http://mock.local/api/v1/live-sessions/1001/lots', expect.any(Object));
  });

  it('queries orders by auctionId and fetches order detail without old auction history endpoints', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => ok({ orders: [{ id: 2001, auctionId: 2001, winnerId: 'u1', sellerId: 'merchant_01', dealPrice: 150100, status: 'CREATED', payStatus: 'UNPAID' }] }))
      .mockImplementationOnce(() => ok({ id: 2001, auctionId: 2001, winnerId: 'u1', sellerId: 'merchant_01', dealPrice: 150100, status: 'CREATED', payStatus: 'UNPAID' }));
    const api = new ApiClient('http://mock.local', fetcher);

    const orders = await api.listMyOrders({ auctionId: '2001' });
    const order = await api.getOrder('2001');

    expect(orders.items[0].auctionId).toBe('2001');
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

  it('normalizes the new search, merchant, and category REST resources', async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => ok({ categories: [{ id: 'jewelry', name: '珠宝玉石', iconName: 'gem' }] }))
      .mockImplementationOnce(() => ok({ lots: [{ auctionId: 1001, liveSessionId: 9001, sellerId: 'merchant_1', category: '珠宝玉石', categoryId: 'jewelry', title: '钻石项链', imageUrl: 'https://cdn.example.com/lot.jpg', status: 'RUNNING', startPrice: 0, currentPrice: 1000, participantCount: 12, endTime: '2026-06-04T12:00:00+08:00' }] }))
      .mockImplementationOnce(() => ok({ sessions: [{ id: 9001, merchantId: 'merchant_1', merchantName: '云上珠宝', title: '珠宝直播间', status: 'LIVE', onlineCount: 12, viewerTotal: 99 }] }))
      .mockImplementationOnce(() => ok({ merchants: [{ id: 'merchant_1', name: '云上珠宝', followerCount: 1200 }] }))
      .mockImplementationOnce(() => ok({ id: 'merchant_1', name: '云上珠宝', followerCount: 1200, liveRoomId: 'room_1' }))
      .mockImplementationOnce(() => ok({ auctionId: 1001, liveSessionId: 9001, sellerId: 'merchant_1', category: 'jewelry', title: '钻石项链', status: 'RUNNING', startPrice: 0, currentPrice: 1000, endTime: '2026-06-04T12:00:00+08:00' }));
    const api = new ApiClient('http://mock.local', fetcher);

    const categories = await api.listCategories();
    const lots = await api.searchLots({ keyword: '钻石', sort: 'priceDesc', status: 'RUNNING', categoryId: 'jewelry' });
    const rooms = await api.searchLiveRooms({ keyword: '珠宝', sort: 'viewerDesc', status: 'live' });
    const merchants = await api.searchMerchants({ keyword: '云上' });
    const merchant = await api.getMerchant('merchant_1');
    const lot = await api.getLot('lot_1');

    expect(categories.items[0].name).toBe('珠宝玉石');
    expect(lots.items[0]).toMatchObject({ id: '1001', merchantId: 'merchant_1', categoryId: 'jewelry', imageUrl: 'https://cdn.example.com/lot.jpg', participantCount: 12 });
    expect(rooms.items[0]).toMatchObject({ merchantName: '云上珠宝', onlineCount: 12, watcherCount: 99 });
    expect(merchants.items[0].name).toBe('云上珠宝');
    expect(merchant.liveRoomId).toBe('room_1');
    expect(lot.title).toBe('钻石项链');
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://mock.local/api/v1/search/lots?limit=20&offset=0&keyword=%E9%92%BB%E7%9F%B3&sort=priceDesc&status=RUNNING&categoryId=jewelry', expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(3, 'http://mock.local/api/v1/live-sessions?limit=20&offset=0&keyword=%E7%8F%A0%E5%AE%9D&sort=viewerDesc&status=LIVE', expect.any(Object));
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
    expect(fetcher).toHaveBeenNthCalledWith(3, 'http://mock.local/api/v1/auction-participations/mine?limit=20&offset=0', expect.any(Object));
  });

  it('uses local demo data by default for independent presentation', async () => {
    const fetcher = vi.fn();
    const api = new DemoApiClient(fetcher);

    const rooms = await api.listLiveRooms();
    const lots = await api.listLiveRoomLots(rooms.items[0].id);

    expect(fetcher).not.toHaveBeenCalled();
    expect(rooms.items[0].title).toContain('直播间');
    expect(lots.items.some((lot) => lot.status === 'RUNNING')).toBe(true);
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
    const merchants = await api.searchMerchants({ keyword: '云上' });
    const liveRooms = await api.searchLiveRooms({ sort: 'viewerDesc', status: 'live' });
    const merchant = await api.getMerchant(merchants.items[0].id);
    const profile = await api.updateMyProfile({ nickname: 'Demo Buyer' });
    const records = await api.listMyAuctionRecords();

    expect(runningJewelry.items).toHaveLength(1);
    expect(runningJewelry.items[0].title).toContain('钻石');
    expect(merchants.items[0].name).toContain('云上');
    expect(liveRooms.items.every((room) => room.status === 'LIVE')).toBe(true);
    expect(merchant.liveRoomId).toBeTruthy();
    expect(profile.nickname).toBe('Demo Buyer');
    expect(records.items.map((record) => record.depositStatus).every(Boolean)).toBe(true);
    expect(records.items.some((record) => record.order?.fulfillmentStatus === 'UNSHIPPED')).toBe(true);
    expect(records.items.some((record) => record.order?.fulfillmentStatus === 'SHIPPED')).toBe(true);
    expect(records.items.some((record) => record.order?.fulfillmentStatus === 'RECEIVED')).toBe(true);
  });
});
