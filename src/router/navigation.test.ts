import { describe, expect, it, vi } from 'vitest';
import { navigateWithTransition } from './navigation';

describe('navigateWithTransition', () => {
  it('uses router-managed synchronous view transitions for route updates', () => {
    const navigate = vi.fn();
    const state = { sourceTab: 'home', returnTo: '/' };

    navigateWithTransition(navigate, '/discover', {
      replace: true,
      state
    });

    expect(navigate).toHaveBeenCalledWith('/discover', {
      replace: true,
      state,
      flushSync: true,
      viewTransition: true
    });
  });
});
