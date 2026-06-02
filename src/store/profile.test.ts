import { beforeEach, describe, expect, it } from 'vitest';
import { mergeProfile, useProfileStore } from './profile';
import type { UserProfile } from '../services/types';

const baseProfile: UserProfile = {
  userId: 'u1',
  nickname: 'Buyer One',
  avatarUrl: '',
  reminderCount: 1,
  favoriteCount: 2,
  followingCount: 3,
  footprintCount: 4
};

describe('profile store', () => {
  beforeEach(() => {
    localStorage.clear();
    useProfileStore.getState().clearProfileOverride();
  });

  it('merges local profile overrides onto the server profile', () => {
    const profile = mergeProfile(baseProfile, { nickname: 'New Name', avatarUrl: 'data:image/jpeg;base64,test' });

    expect(profile).toMatchObject({
      userId: 'u1',
      nickname: 'New Name',
      avatarUrl: 'data:image/jpeg;base64,test',
      reminderCount: 1
    });
  });

  it('persists nickname and avatar overrides locally', () => {
    useProfileStore.getState().setProfileOverride({ nickname: 'Local Name' });
    useProfileStore.getState().setProfileOverride({ avatarUrl: 'data:image/jpeg;base64,avatar' });

    expect(useProfileStore.getState().profileOverride).toMatchObject({
      nickname: 'Local Name',
      avatarUrl: 'data:image/jpeg;base64,avatar'
    });

    const persisted = JSON.parse(localStorage.getItem('aieas-user-profile') ?? '{}') as {
      state?: { profileOverride?: Partial<UserProfile> };
    };
    expect(persisted.state?.profileOverride).toMatchObject({
      nickname: 'Local Name',
      avatarUrl: 'data:image/jpeg;base64,avatar'
    });
  });
});
