import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { FollowedLiveRoom, LiveRoom, LiveRoomFootprint } from '../services/types';

const maxFootprints = 100;

interface LiveActivityState {
  followedRooms: FollowedLiveRoom[];
  footprints: LiveRoomFootprint[];
  followRoom: (room: LiveRoom) => void;
  unfollowRoom: (roomId: string) => void;
  isFollowing: (roomId: string) => boolean;
  recordFootprint: (room: LiveRoom) => void;
  getFootprintsPage: (offset: number, limit: number) => LiveRoomFootprint[];
  clearActivity: () => void;
}

export const useLiveActivityStore = create<LiveActivityState>()(
  persist(
    (set, get) => ({
      followedRooms: [],
      footprints: [],
      followRoom: (room) => {
        const item = roomToFollowed(room);
        set((state) => ({
          followedRooms: [item, ...state.followedRooms.filter((followed) => followed.roomId !== item.roomId)]
        }));
      },
      unfollowRoom: (roomId) => {
        set((state) => ({
          followedRooms: state.followedRooms.filter((followed) => followed.roomId !== roomId)
        }));
      },
      isFollowing: (roomId) => get().followedRooms.some((followed) => followed.roomId === roomId),
      recordFootprint: (room) => {
        const item = roomToFootprint(room);
        set((state) => ({
          footprints: [item, ...state.footprints.filter((footprint) => footprint.roomId !== item.roomId)].slice(0, maxFootprints)
        }));
      },
      getFootprintsPage: (offset, limit) => get().footprints.slice(offset, offset + limit),
      clearActivity: () => set({ followedRooms: [], footprints: [] })
    }),
    {
      name: 'aieas-user-live-activity',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        followedRooms: state.followedRooms,
        footprints: state.footprints
      })
    }
  )
);

function roomToFollowed(room: LiveRoom): FollowedLiveRoom {
  return {
    roomId: room.id,
    title: room.title,
    merchantName: room.merchantName,
    coverUrl: room.coverUrl,
    followedAt: new Date().toISOString()
  };
}

function roomToFootprint(room: LiveRoom): LiveRoomFootprint {
  return {
    roomId: room.id,
    title: room.title,
    merchantName: room.merchantName,
    coverUrl: room.coverUrl,
    viewedAt: new Date().toISOString()
  };
}
