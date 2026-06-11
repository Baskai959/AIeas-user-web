import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { FollowedLiveRoom, LiveRoom, LiveRoomFootprint, LiveRoomLot, LotFootprint } from '../services/types';

const maxFootprints = 100;

interface LiveActivityState {
  followedRooms: FollowedLiveRoom[];
  footprints: LiveRoomFootprint[];
  lotFootprints: LotFootprint[];
  roomLikeCounts: Record<string, number>;
  commentDrafts: Record<string, string>;
  followRoom: (room: LiveRoom) => void;
  unfollowRoom: (roomId: string) => void;
  isFollowing: (roomId: string) => boolean;
  likeRoom: (roomId: string) => void;
  setCommentDraft: (roomId: string, draft: string) => void;
  clearCommentDraft: (roomId: string) => void;
  recordFootprint: (room: LiveRoom) => void;
  updateFootprintCover: (roomId: string, coverUrl: string) => void;
  getFootprintsPage: (offset: number, limit: number) => LiveRoomFootprint[];
  recordLotFootprint: (lot: LiveRoomLot) => void;
  getLotFootprintsPage: (offset: number, limit: number) => LotFootprint[];
  clearActivity: () => void;
}

export const useLiveActivityStore = create<LiveActivityState>()(
  persist(
    (set, get) => ({
      followedRooms: [],
      footprints: [],
      lotFootprints: [],
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
      updateFootprintCover: (roomId, coverUrl) => {
        const normalizedCoverUrl = coverUrl.trim();
        if (!normalizedCoverUrl) return;
        set((state) => ({
          footprints: state.footprints.map((footprint) => (footprint.roomId === roomId && footprint.coverUrl !== normalizedCoverUrl ? { ...footprint, coverUrl: normalizedCoverUrl } : footprint))
        }));
      },
      getFootprintsPage: (offset, limit) => get().footprints.slice(offset, offset + limit),
      recordLotFootprint: (lot) => {
        const item = lotToFootprint(lot);
        set((state) => ({
          lotFootprints: [item, ...state.lotFootprints.filter((footprint) => footprint.lotId !== item.lotId)].slice(0, maxFootprints)
        }));
      },
      getLotFootprintsPage: (offset, limit) => get().lotFootprints.slice(offset, offset + limit),
      clearActivity: () => set({ followedRooms: [], footprints: [], lotFootprints: [], roomLikeCounts: {}, commentDrafts: {} })
    }),
    {
      name: 'aieas-user-live-activity',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        followedRooms: state.followedRooms,
        footprints: state.footprints,
        lotFootprints: state.lotFootprints,
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

function lotToFootprint(lot: LiveRoomLot): LotFootprint {
  return {
    lotId: lot.id,
    auctionId: lot.auctionId,
    roomId: lot.roomId,
    title: lot.title,
    description: lot.subtitle ?? lot.description,
    imageUrl: lot.imageUrls?.[0] ?? lot.imageUrl,
    status: lot.status,
    currentPrice: lot.currentPrice,
    viewedAt: new Date().toISOString()
  };
}
