import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRoom, LiveRoomLot } from '../services/types';
import { useLiveActivityStore } from './liveActivity';

const baseRoom: LiveRoom = {
  id: 'room_1001',
  title: 'Live Room One',
  merchantName: 'Merchant One',
  status: 'LIVE',
  videoSource: 'recorded',
  onlineCount: 128,
  watcherCount: 320,
  coverUrl: '/cover-one.png'
};

function room(id: string): LiveRoom {
  return {
    ...baseRoom,
    id,
    title: `Live Room ${id}`,
    merchantName: `Merchant ${id}`,
    coverUrl: `/cover-${id}.png`
  };
}

function lot(id: string): LiveRoomLot {
  return {
    id,
    auctionId: `auc_${id}`,
    roomId: 'room_1001',
    merchantId: 'merchant_01',
    categoryId: 'jewelry',
    title: `Lot ${id}`,
    description: `Intro ${id}`,
    imageUrl: `/lot-${id}.png`,
    status: 'RUNNING',
    startPrice: 100,
    currentPrice: 200,
    endTsMs: Date.now() + 60_000
  };
}

describe('live activity store', () => {
  beforeEach(() => {
    localStorage.clear();
    useLiveActivityStore.getState().clearActivity();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-31T10:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('follows rooms, deduplicates repeated follows, and removes followed rooms', () => {
    useLiveActivityStore.getState().followRoom(baseRoom);
    useLiveActivityStore.getState().followRoom({ ...baseRoom, title: 'Live Room One Updated' });

    expect(useLiveActivityStore.getState().followedRooms).toHaveLength(1);
    expect(useLiveActivityStore.getState().followedRooms[0]).toMatchObject({
      roomId: 'room_1001',
      title: 'Live Room One Updated',
      merchantName: 'Merchant One',
      coverUrl: '/cover-one.png'
    });

    useLiveActivityStore.getState().unfollowRoom('room_1001');

    expect(useLiveActivityStore.getState().followedRooms).toHaveLength(0);
  });

  it('records footprints newest first, keeps one entry per room, caps at 100, and pages by tens', () => {
    for (let index = 0; index < 105; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 4, 31, 2, index, 0)));
      useLiveActivityStore.getState().recordFootprint(room(`room_${index}`));
    }

    expect(useLiveActivityStore.getState().footprints).toHaveLength(100);
    expect(useLiveActivityStore.getState().footprints[0].roomId).toBe('room_104');
    expect(useLiveActivityStore.getState().footprints.at(-1)?.roomId).toBe('room_5');

    vi.setSystemTime(new Date('2026-05-31T12:00:00+08:00'));
    useLiveActivityStore.getState().recordFootprint(room('room_10'));

    expect(useLiveActivityStore.getState().footprints).toHaveLength(100);
    expect(useLiveActivityStore.getState().footprints[0].roomId).toBe('room_10');
    expect(useLiveActivityStore.getState().footprints.filter((item) => item.roomId === 'room_10')).toHaveLength(1);
    expect(useLiveActivityStore.getState().getFootprintsPage(0, 10)).toHaveLength(10);
    expect(useLiveActivityStore.getState().getFootprintsPage(10, 10)).toHaveLength(10);
  });

  it('records lot footprints separately from live room footprints', () => {
    useLiveActivityStore.getState().recordFootprint(room('room_1001'));

    for (let index = 0; index < 105; index += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 4, 31, 3, index, 0)));
      useLiveActivityStore.getState().recordLotFootprint(lot(`lot_${index}`));
    }

    expect(useLiveActivityStore.getState().footprints).toHaveLength(1);
    expect(useLiveActivityStore.getState().lotFootprints).toHaveLength(100);
    expect(useLiveActivityStore.getState().lotFootprints[0]).toMatchObject({
      lotId: 'lot_104',
      title: 'Lot lot_104',
      roomId: 'room_1001',
      imageUrl: '/lot-lot_104.png'
    });

    vi.setSystemTime(new Date('2026-05-31T12:00:00+08:00'));
    useLiveActivityStore.getState().recordLotFootprint({ ...lot('lot_10'), title: 'Lot 10 updated' });

    expect(useLiveActivityStore.getState().lotFootprints).toHaveLength(100);
    expect(useLiveActivityStore.getState().lotFootprints[0].lotId).toBe('lot_10');
    expect(useLiveActivityStore.getState().lotFootprints[0].title).toBe('Lot 10 updated');
    expect(useLiveActivityStore.getState().lotFootprints.filter((item) => item.lotId === 'lot_10')).toHaveLength(1);
    expect(useLiveActivityStore.getState().getLotFootprintsPage(0, 10)).toHaveLength(10);
  });

  it('refreshes a room footprint cover when the room is visited again', () => {
    useLiveActivityStore.getState().recordFootprint({ ...room('room_1001'), coverUrl: undefined });
    expect(useLiveActivityStore.getState().footprints[0].coverUrl).toBeUndefined();

    useLiveActivityStore.getState().recordFootprint({ ...room('room_1001'), coverUrl: '/cover-updated.png' });

    expect(useLiveActivityStore.getState().footprints).toHaveLength(1);
    expect(useLiveActivityStore.getState().footprints[0]).toMatchObject({
      roomId: 'room_1001',
      coverUrl: '/cover-updated.png'
    });
  });

  it('updates an existing room footprint cover without changing its browsing time', () => {
    useLiveActivityStore.getState().recordFootprint({ ...room('room_1001'), coverUrl: undefined });
    const viewedAt = useLiveActivityStore.getState().footprints[0].viewedAt;

    useLiveActivityStore.getState().updateFootprintCover('room_1001', '/cover-backfilled.png');

    expect(useLiveActivityStore.getState().footprints[0]).toMatchObject({
      roomId: 'room_1001',
      coverUrl: '/cover-backfilled.png',
      viewedAt
    });
  });

  it('uses the lot subtitle as the compact footprint intro before the long detail text', () => {
    useLiveActivityStore.getState().recordLotFootprint({
      ...lot('lot_intro'),
      subtitle: 'Compact list intro',
      description: 'Long product detail text'
    });

    expect(useLiveActivityStore.getState().lotFootprints[0].description).toBe('Compact list intro');
  });

  it('stores demo likes and comment drafts per live room', () => {
    useLiveActivityStore.getState().likeRoom('room_1001');
    useLiveActivityStore.getState().likeRoom('room_1001');
    useLiveActivityStore.getState().likeRoom('room_1002');
    useLiveActivityStore.getState().setCommentDraft('room_1001', 'Draft comment');
    useLiveActivityStore.getState().setCommentDraft('room_1002', 'Other draft');

    expect(useLiveActivityStore.getState().roomLikeCounts).toMatchObject({
      room_1001: 2,
      room_1002: 1
    });
    expect(useLiveActivityStore.getState().commentDrafts.room_1001).toBe('Draft comment');

    useLiveActivityStore.getState().clearCommentDraft('room_1001');

    expect(useLiveActivityStore.getState().commentDrafts.room_1001).toBeUndefined();
    expect(useLiveActivityStore.getState().commentDrafts.room_1002).toBe('Other draft');
  });
});
