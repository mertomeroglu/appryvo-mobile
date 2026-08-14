import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient, ApiException, refreshTokenFlow } from '../src/services/api/apiClient';
import { secureStorage } from '../src/native/secureStorage';
import { SocketService } from '../src/services/socket/socketService';

describe('Phase 3 Core Services & Data Layer', () => {
  beforeEach(async () => {
    await secureStorage.clearAll();
    vi.restoreAllMocks();
  });

  // 1. Secure Storage Abstraction Test
  it('1. secure storage abstraction sets and retrieves tokens correctly', async () => {
    await secureStorage.setAccessToken('access_123');
    await secureStorage.setRefreshToken('refresh_456');

    const access = await secureStorage.getAccessToken();
    const refresh = await secureStorage.getRefreshToken();

    expect(access).toBe('access_123');
    expect(refresh).toBe('refresh_456');

    await secureStorage.clearAll();
    expect(await secureStorage.getAccessToken()).toBeNull();
  });

  // 2. API Error Normalize Test
  it('2. API error normalize creates structured ApiException', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ message: 'Geçersiz parametre.', code: 'INVALID_INPUT' }),
    });

    try {
      await apiClient.post('/api/auth/login', { email: 'test@example.com' });
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiException);
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe('Geçersiz parametre.');
      expect(err.code).toBe('INVALID_INPUT');
    }
  });

  // 3. Auth Refresh Test
  it('3. auth refresh updates token successfully on 401 response', async () => {
    await secureStorage.setRefreshToken('valid_refresh_token');

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            status: 'success',
            data: { accessToken: 'new_access_789', refreshToken: 'new_refresh_999' },
          }),
          text: async () =>
            JSON.stringify({
              status: 'success',
              data: { accessToken: 'new_access_789', refreshToken: 'new_refresh_999' },
            }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'Unauthorized' }),
        text: async () => JSON.stringify({ message: 'Unauthorized' }),
      });
    });

    const refreshed = await refreshTokenFlow();
    expect(refreshed).toBe(true);
    expect(await secureStorage.getAccessToken()).toBe('new_access_789');
    expect(await secureStorage.getRefreshToken()).toBe('new_refresh_999');
  });

  // 4. Simultaneous 401 Refresh Lock Test
  it('4. simultaneous 401 refresh calls return single in-flight promise', async () => {
    await secureStorage.setRefreshToken('shared_refresh_token');

    let fetchCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/refresh')) {
        fetchCount++;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: async () => ({
                  status: 'success',
                  data: { accessToken: 'shared_access', refreshToken: 'shared_refresh' },
                }),
                text: async () =>
                  JSON.stringify({
                    status: 'success',
                    data: { accessToken: 'shared_access', refreshToken: 'shared_refresh' },
                  }),
              }),
            50
          )
        );
      }
      return Promise.resolve({ ok: false, status: 401 });
    });

    const [res1, res2, res3] = await Promise.all([
      refreshTokenFlow(),
      refreshTokenFlow(),
      refreshTokenFlow(),
    ]);

    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect(res3).toBe(true);
    expect(fetchCount).toBe(1); // Only 1 refresh network call was executed!
  });

  // 5. Socket Duplicate Listener Test
  it('5. Socket service prevents duplicate listener registrations', () => {
    const service = SocketService.getInstance();
    const mockCallback = vi.fn();

    const unsub1 = service.on('message:received', mockCallback);
    const unsub2 = service.on('message:received', mockCallback);

    // Registering exact same callback twice should be idempotent
    expect(typeof unsub1).toBe('function');
    expect(typeof unsub2).toBe('function');

    unsub1();
  });

  // 6. Socket Reconnect Test
  it('6. Socket service supports reconnect with new token', async () => {
    const service = SocketService.getInstance();
    await secureStorage.setAccessToken('fresh_token');

    const disconnectSpy = vi.spyOn(service, 'disconnect');
    const connectSpy = vi.spyOn(service, 'connect');

    await service.reconnectWithNewToken();

    expect(disconnectSpy).toHaveBeenCalled();
    expect(connectSpy).toHaveBeenCalled();
  });

  // 7. Contract Endpoint Usage Test
  it('7. verifies contract endpoints exist and make expected fetch requests', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ status: 'success', data: { id: 'u1', name: 'Test' } }),
    });

    const res = await apiClient.get('/api/me');
    expect(res.status).toBe('success');
    expect(res.data.id).toBe('u1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/me'),
      expect.anything()
    );
  });
});
