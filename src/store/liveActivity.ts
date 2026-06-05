import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { FollowedLiveRoom, LiveRoom, LiveRoomFootprint } from '../services/types';

const maxFootprints = 100;

interface LiveActivityState {
  followedRooms: FollowedLiveRoom[];
  footprints: LiveRoomFootprint[];
  roomLikeCounts: Record<string, number>;
  commentDrafts: Record<string, string>;
  followRoom: (room: LiveRoom) => void;
  unfollowRoom: (roomId: string) => void;
  isFollowing: (roomId: string) => boolean;
  likeRoom: (roomId: string) => void;
  setCommentDraft: (roomId: string, draft: string) => void;
  clearCommentDraft: (roomId: string) => void;
  recordFootprint: (room: LiveRoom) => void;
  getFootprintsPage: (offset: number, limit: number) => LiveRoomFootprint[];
  clearActivity: () => void;
}

export const useLiveActivityStore = create<LiveActivityState>()(
  persist(
    (set, get) => ({
      followedRooms: [],
      footprints: [],
      roomLikeCounts: {},
      commentDrafts: {},
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
      likeRoom: (roomId) => {
        set((state) => ({
          roomLikeCounts: {
            ...state.roomLikeCounts,
            [roomId]: (state.roomLikeCounts[roomId] ?? 0) + 1
          }
        }));
      },
      setCommentDraft: (roomId, draft) => {
        set((state) => ({
          commentDrafts: {
            ...state.commentDrafts,
            [roomId]: draft
          }
        }));
      },
      clearCommentDraft: (roomId) => {
        set((state) => {
          const nextDrafts = { ...state.commentDrafts };
          delete nextDrafts[roomId];
          return { commentDrafts: nextDrafts };
        });
      },
      recordFootprint: (room) => {
        const item = roomToFootprint(room);
        set((state) => ({
          footprints: [item, ...state.footprints.filter((footprint) => footprint.roomId !== item.roomId)].slice(0, maxFootprints)
        }));
      },
      getFootprintsPage: (offset, limit) => get().footprints.slice(offset, offset + limit),
      clearActivity: () => set({ followedRooms: [], footprints: [], roomLikeCounts: {}, commentDrafts: {} })
    }),
    {
      name: 'aieas-user-live-activity',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        followedRooms: state.followedRooms,
        footprints: state.footprints,
        roomLikeCounts: state.roomLikeCounts,
        commentDrafts: state.commentDrafts
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
