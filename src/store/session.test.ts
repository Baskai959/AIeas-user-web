import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './session';

describe('session store', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useSessionStore.getState().clearSession();
    });
  });

  it('persists login session for route reloads and deep links', () => {
    act(() => {
      useSessionStore.getState().setSession({
        accessToken: 'jwt',
        refreshToken: 'refresh',
        expiresIn: 43_200,
        user: {
          id: 'u1',
          nickname: '竞拍用户',
          role: 'buyer'
        }
      });
    });

    const stored = JSON.parse(localStorage.getItem('aieas-user-session') ?? '{}') as {
      state?: { accessToken?: string; refreshToken?: string; user?: { id?: string } };
    };

    expect(stored.state?.accessToken).toBe('jwt');
    expect(stored.state?.refreshToken).toBe('refresh');
    expect(stored.state?.user?.id).toBe('u1');
  });

  it('updates only the access token after refresh', () => {
    act(() => {
      useSessionStore.getState().setSession({
        accessToken: 'jwt_old',
        refreshToken: 'refresh',
        expiresIn: 43_200,
        user: {
          id: 'u1',
          nickname: '竞拍用户',
          role: 'buyer'
        }
      });
      useSessionStore.getState().refreshAccessToken({
        accessToken: 'jwt_new',
        expiresIn: 43_200
      });
    });

    expect(useSessionStore.getState().accessToken).toBe('jwt_new');
    expect(useSessionStore.getState().refreshToken).toBe('refresh');
    expect(useSessionStore.getState().user?.id).toBe('u1');
  });
});
