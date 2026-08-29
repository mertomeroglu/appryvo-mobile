import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  post: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mocks.storage.get(key) || null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mocks.storage.set(key, value); }),
  },
}));

vi.mock('../src/services/api/apiClient', () => ({
  apiClient: { post: mocks.post },
}));

import { pushRegistrationService } from '../src/services/push/pushRegistrationService';
import { resolvePushDestination, shouldSuppressForegroundPush } from '../src/services/push/pushRouting';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('P0 push-token recovery', () => {
  beforeEach(() => {
    mocks.storage.clear();
    mocks.post.mockReset().mockResolvedValue({ status: 'success' });
  });

  it('associates once, throttles the same account, and re-associates on account switch', async () => {
    await expect(pushRegistrationService.registerToken('device-token', 'android', 'user-a')).resolves.toBe(true);
    await expect(pushRegistrationService.registerToken('device-token', 'android', 'user-a')).resolves.toBe(false);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenLastCalledWith('/api/devices/push-token', {
      token: 'device-token', platform: 'android',
    });

    await expect(pushRegistrationService.ensureCurrentUser('user-b')).resolves.toBe(true);
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });

  it('clears only the association on logout so the same device can recover on next login', async () => {
    await pushRegistrationService.registerToken('device-token', 'ios', 'user-a');
    await pushRegistrationService.clearAssociation();
    await expect(pushRegistrationService.ensureCurrentUser('user-a')).resolves.toBe(true);
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });

  it('registers native listeners before register and keeps Android/iOS dynamic', () => {
    const nativePush = source('src/native/push.ts');
    const realtime = source('src/components/RealtimeSync.tsx');
    // RYVO PATCH V2 03: swapped @capacitor/push-notifications (raw-APNs-token-only on iOS, no
    // Firebase dependency) for @capacitor-firebase/messaging, which performs a real APNs->FCM
    // token exchange -- see native/push.ts and the Patch V2 03 report. tokenReceived/
    // notificationActionPerformed listeners are still attached before the awaitable getToken()
    // call, for the same reason the old plugin needed listeners before its register() call.
    expect(nativePush.indexOf("addListener('tokenReceived'")).toBeLessThan(nativePush.indexOf('FirebaseMessaging.getToken()'));
    expect(nativePush).toContain('onRegistrationError?.(error)');
    expect(realtime).toContain('const platform = Capacitor.getPlatform()');
    expect(realtime).toContain("platform !== 'android' && platform !== 'ios'");
    expect(realtime).toContain('ensureCurrentUser(authenticatedUserId)');
    expect(realtime).toContain('resolvePushDestination(data)');
    expect(realtime).toContain('shouldSuppressForegroundPush(data, window.location.pathname)');
    expect(realtime).not.toContain('pushRegisteredRef');
  });

  it('routes every supported payload type and rejects external routes', () => {
    expect(resolvePushDestination({ type: 'match', matchId: 'match-1' })).toBe('/chat/match-1');
    expect(resolvePushDestination({ type: 'gift', matchId: 'match-1' })).toBe('/chat/match-1');
    expect(resolvePushDestination({ type: 'match_note' })).toBe('/likes');
    expect(resolvePushDestination({ type: 'moderator_message' })).toBe('/messages/ryvo');
    expect(resolvePushDestination({ type: 'VERIFICATION_APPROVED' })).toBe('/profile');
    expect(resolvePushDestination({ type: 'confession_comment' })).toBe('/confessions');
    expect(resolvePushDestination({ eventType: 'PREMIUM_EXPIRING' })).toBe('/premium');
    expect(resolvePushDestination({ eventType: 'BOOST_ENDING' })).toBe('/boost');
    expect(resolvePushDestination({ type: 'incoming_call', matchId: 'match-1' })).toBe('/chat/match-1');
    expect(resolvePushDestination({ ctaUrl: 'https://evil.example/profile' })).toBeNull();
    expect(resolvePushDestination({ ctaUrl: 'https://appryvo.online/messages' })).toBe('/messages');
  });

  it('suppresses the foreground toast when the realtime chat already rendered the same thread', () => {
    expect(shouldSuppressForegroundPush({ type: 'chat', matchId: 'match-1' }, '/chat/match-1')).toBe(true);
    expect(shouldSuppressForegroundPush({ type: 'chat', matchId: 'match-1' }, '/messages')).toBe(false);
  });

  it('logs out only the cached physical-device token', () => {
    const auth = source('src/services/auth/authService.ts');
    expect(auth).toContain("apiClient.delete('/api/devices/push-token', { token: pushToken })");
    expect(auth).toContain('{ refreshToken, pushToken }');
    expect(auth).toContain('pushRegistrationService.clearAssociation()');
  });
});
