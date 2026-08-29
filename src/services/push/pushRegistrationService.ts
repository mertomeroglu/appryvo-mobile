import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { apiClient } from '../api/apiClient';

export type PushPlatform = 'android' | 'ios';

interface PushRegistrationState {
  token: string;
  platform: PushPlatform;
  associatedUserId: string | null;
  lastSyncedAt: number;
}

const STORAGE_KEY = 'ryvo_push_registration_state';
const RESYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
let webState: PushRegistrationState | null = null;
let inFlight: Promise<boolean> | null = null;
let inFlightKey = '';

async function readState(): Promise<PushRegistrationState | null> {
  const raw = Capacitor.isNativePlatform()
    ? (await Preferences.get({ key: STORAGE_KEY })).value
    : webState ? JSON.stringify(webState) : null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PushRegistrationState;
    if (!parsed.token || (parsed.platform !== 'android' && parsed.platform !== 'ios')) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeState(state: PushRegistrationState): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(state) });
  } else {
    webState = state;
  }
}

async function syncState(state: PushRegistrationState, userId: string, force: boolean): Promise<boolean> {
  const now = Date.now();
  if (
    !force &&
    state.associatedUserId === userId &&
    now - state.lastSyncedAt < RESYNC_INTERVAL_MS
  ) return false;

  const key = `${userId}:${state.platform}:${state.token}`;
  if (inFlight && inFlightKey === key) return inFlight;
  inFlightKey = key;
  inFlight = apiClient
    .post('/api/devices/push-token', { token: state.token, platform: state.platform })
    .then(async () => {
      await writeState({ ...state, associatedUserId: userId, lastSyncedAt: Date.now() });
      return true;
    })
    .finally(() => {
      inFlight = null;
      inFlightKey = '';
    });
  return inFlight;
}

export const pushRegistrationService = {
  async registerToken(token: string, platform: PushPlatform, userId: string): Promise<boolean> {
    const cleanToken = token.trim();
    if (!cleanToken || !userId) return false;
    const current = await readState();
    const tokenChanged = current?.token !== cleanToken || current?.platform !== platform;
    const staleToken = tokenChanged ? current?.token : null;
    const next: PushRegistrationState = {
      token: cleanToken,
      platform,
      associatedUserId: tokenChanged ? null : current?.associatedUserId || null,
      lastSyncedAt: tokenChanged ? 0 : current?.lastSyncedAt || 0,
    };
    // Persist the native token before the network request. A failed request is retried on
    // resume/login instead of losing the only copy of the registration event.
    await writeState(next);
    if (staleToken) {
      // Firebase can rotate this device's token during the session (app restore, OS-level
      // refresh, re-registration after a native reinstall of the messaging SDK). Without this,
      // the OLD token row stays is_active=TRUE in device_push_tokens indefinitely -- it only ever
      // gets cleaned up lazily, if and when a future send happens to target it and fails with an
      // invalid-token error. Deactivating it here the moment we know it's superseded keeps this
      // device from silently accumulating duplicate active tokens between sends.
      apiClient.delete('/api/devices/push-token', { token: staleToken }).catch(() => {});
    }
    return syncState(next, userId, tokenChanged || next.associatedUserId !== userId);
  },

  async ensureCurrentUser(userId: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform() || !userId) return false;
    const current = await readState();
    if (!current) return false;
    return syncState(current, userId, current.associatedUserId !== userId);
  },

  async getCurrentToken(): Promise<string | null> {
    return (await readState())?.token || null;
  },

  async clearAssociation(): Promise<void> {
    const current = await readState();
    if (!current) return;
    await writeState({ ...current, associatedUserId: null, lastSyncedAt: 0 });
  },
};
