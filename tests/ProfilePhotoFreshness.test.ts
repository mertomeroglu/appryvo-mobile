import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../src/services/auth/authService', () => ({
  authService: {
    getCurrentUser: mocks.getCurrentUser,
  },
}));

vi.mock('../src/services/socket/socketService', () => ({
  socketService: { disconnect: vi.fn() },
}));

import { useAuthStore } from '../src/stores/useAuthStore';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('profile photo freshness', () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    useAuthStore.getState().setUser(null);
  });

  it('does not let an older reconciliation overwrite the newest photo list', async () => {
    const oldRequest = deferred<any>();
    const freshRequest = deferred<any>();
    mocks.getCurrentUser
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(freshRequest.promise);

    const oldFetch = useAuthStore.getState().fetchMe();
    const freshFetch = useAuthStore.getState().fetchMe();
    freshRequest.resolve({ data: { id: 'u1', name: 'Ryvo', photos: [{ original: '/new.jpg' }] } });
    await freshFetch;
    oldRequest.resolve({ data: { id: 'u1', name: 'Ryvo', photos: [{ original: '/old.jpg' }] } });
    await oldFetch;

    expect(useAuthStore.getState().user?.photos?.[0]?.original).toBe('/new.jpg');
  });

  it('keeps an optimistic uploaded photo when an older request finishes afterward', async () => {
    const staleRequest = deferred<any>();
    mocks.getCurrentUser.mockReturnValueOnce(staleRequest.promise);
    const fetch = useAuthStore.getState().fetchMe();

    useAuthStore.getState().setUser({ id: 'u1', email: 'r@ryvo.test', name: 'Ryvo', photos: ['/uploaded.jpg'] });
    staleRequest.resolve({ data: { id: 'u1', name: 'Ryvo', photos: ['/previous.jpg'] } });
    await fetch;

    expect(useAuthStore.getState().user?.photos?.[0]).toBe('/uploaded.jpg');
  });
});
