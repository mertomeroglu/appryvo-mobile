import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../src/services/auth/authService';
import { secureStorage } from '../src/native/secureStorage';

const cachedUser = { id: 'user-1', name: 'Ryvo User' };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('authenticated feature recovery', () => {
  beforeEach(async () => {
    await secureStorage.clearAll();
    await secureStorage.setRefreshToken('valid-refresh');
    await secureStorage.setUserData(cachedUser);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('restores a missing access token before loading the current user', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: 'success', data: { accessToken: 'new-access', refreshToken: 'rotated-refresh' } }))
      .mockResolvedValueOnce(jsonResponse({ status: 'success', data: cachedUser }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authService.restoreSession()).resolves.toEqual(cachedUser);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(secureStorage.getAccessToken()).resolves.toBe('new-access');
  });

  it('keeps the cached authenticated shell when refresh is temporarily offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(authService.restoreSession()).resolves.toEqual(cachedUser);
    await expect(secureStorage.getRefreshToken()).resolves.toBe('valid-refresh');
  });

  it('clears an actually rejected refresh session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'error' }, 401)));
    await expect(authService.restoreSession()).resolves.toBeNull();
    await expect(secureStorage.getRefreshToken()).resolves.toBeNull();
    await expect(secureStorage.getUserData()).resolves.toBeNull();
  });

  it('never restores a suspended account from cached profile data', async () => {
    await secureStorage.setAccessToken('access');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      status: 'error',
      code: 'ACCOUNT_SUSPENDED',
      message: 'suspended',
    }, 403)));

    await expect(authService.restoreSession()).resolves.toBeNull();
    await expect(secureStorage.getAccessToken()).resolves.toBeNull();
    await expect(secureStorage.getUserData()).resolves.toBeNull();
  });
});
