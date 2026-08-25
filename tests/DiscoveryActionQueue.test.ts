import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiException, apiClient } from '../src/services/api/apiClient';
import {
  enqueueDiscoveryAction,
  flushDiscoveryActions,
  getPendingDiscoveryActionCount,
} from '../src/services/discovery/discoveryActionQueue';

describe('Discover network outbox', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('deduplicates an uncertain pass and flushes it once after reconnect', async () => {
    enqueueDiscoveryAction({ viewerId: 'viewer-a', targetUserId: 'profile-1', direction: 'left', createdAt: 1 });
    enqueueDiscoveryAction({ viewerId: 'viewer-a', targetUserId: 'profile-1', direction: 'left', createdAt: 2 });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ status: 'success' });

    expect(getPendingDiscoveryActionCount('viewer-a')).toBe(1);
    await expect(flushDiscoveryActions('viewer-a')).resolves.toEqual({ sent: 1, pending: 0 });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('retains retryable actions without sending another account outbox', async () => {
    enqueueDiscoveryAction({ viewerId: 'viewer-a', targetUserId: 'profile-1', direction: 'right', createdAt: 1 });
    enqueueDiscoveryAction({ viewerId: 'viewer-b', targetUserId: 'profile-2', direction: 'left', createdAt: 1 });
    vi.spyOn(apiClient, 'post').mockRejectedValue(new ApiException('offline', 0, 'NETWORK_ERROR'));

    await expect(flushDiscoveryActions('viewer-a')).resolves.toEqual({ sent: 0, pending: 1 });
    expect(getPendingDiscoveryActionCount('viewer-a')).toBe(1);
    expect(getPendingDiscoveryActionCount('viewer-b')).toBe(1);
  });
});
