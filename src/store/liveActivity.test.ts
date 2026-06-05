import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRoom } from '../services/types';
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
