import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const ACCESS_TOKEN_KEY = 'ryvo_secure_access_token';
const REFRESH_TOKEN_KEY = 'ryvo_secure_refresh_token';
const USER_DATA_KEY = 'ryvo_secure_user_data';
const LEGACY_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_DATA_KEY];

// Development in-memory fallback for non-native web dev mode. Never persisted, so there is
// nothing to migrate/encrypt here -- the security concern this file exists for is native only.
const memoryStore = new Map<string, string>();

// Auth tokens previously lived in @capacitor/preferences -- plain SharedPreferences XML on
// Android (world-readable by anyone with root/adb on the device, e.g. `adb shell run-as` +
// `cat shared_prefs/*.xml`) and an unencrypted plist-backed store on iOS, not Keychain. Now
// backed by @aparajita/capacitor-secure-storage: AES-GCM via the Android Keystore on Android,
// the system Keychain on iOS. One-time, idempotent, self-limiting migration below moves any
// pre-existing plaintext token over on first use per app process.
// A shared in-flight PROMISE, not a boolean flag: apiClient reads the access token on every
// outgoing request, so several getAccessToken()/getRefreshToken()/getUserData() calls routinely
// fire concurrently at app boot. A boolean flag set synchronously before the async migration
// finishes would let every call after the first one read the (not-yet-written) secure store
// immediately and see null. Every caller must await the SAME migration promise instead.
let migrationPromise: Promise<void> | null = null;

async function migrateLegacyKey(key: string): Promise<void> {
  try {
    const legacy = await Preferences.get({ key });
    if (!legacy.value) return;
    await SecureStorage.setItem(key, legacy.value);
    const verify = await SecureStorage.getItem(key);
    if (verify !== legacy.value) {
      // Do not delete the plaintext copy if we can't prove the secure copy is readable --
      // losing the token would force an unnecessary logout. Migration will retry next launch.
      return;
    }
    await Preferences.remove({ key });
  } catch {
    // Never logs the token itself. A failed migration leaves the old plaintext value in place
    // (still functional, just not yet upgraded) rather than losing the session; it retries on
    // the next call in this process and on the next app launch.
  }
}

function ensureMigrated(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (!migrationPromise) {
    migrationPromise = Promise.all(LEGACY_KEYS.map(migrateLegacyKey)).then(() => undefined);
  }
  return migrationPromise;
}

// "Fail safely" per product decision: if the secure storage plugin itself errors (corrupted
// Keystore entry, OS-level failure, etc.), getters resolve to null (treated as "no session" --
// the app falls back to its normal logged-out state) rather than silently reading/writing the
// old plaintext store. A security downgrade is never an implicit fallback.
async function safeGet(key: string): Promise<string | null> {
  try {
    return await SecureStorage.getItem(key);
  } catch {
    return null;
  }
}

export const secureStorage = {
  async getAccessToken(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      await ensureMigrated();
      return safeGet(ACCESS_TOKEN_KEY);
    }
    return memoryStore.get(ACCESS_TOKEN_KEY) || null;
  },

  async setAccessToken(token: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await SecureStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      memoryStore.set(ACCESS_TOKEN_KEY, token);
    }
  },

  async getRefreshToken(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      await ensureMigrated();
      return safeGet(REFRESH_TOKEN_KEY);
    }
    return memoryStore.get(REFRESH_TOKEN_KEY) || null;
  },

  async setRefreshToken(token: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await SecureStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      memoryStore.set(REFRESH_TOKEN_KEY, token);
    }
  },

  async getUserData<T = any>(): Promise<T | null> {
    let raw: string | null = null;
    if (Capacitor.isNativePlatform()) {
      await ensureMigrated();
      raw = await safeGet(USER_DATA_KEY);
    } else {
      raw = memoryStore.get(USER_DATA_KEY) || null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async setUserData(data: any): Promise<void> {
    const val = JSON.stringify(data);
    if (Capacitor.isNativePlatform()) {
      await SecureStorage.setItem(USER_DATA_KEY, val);
    } else {
      memoryStore.set(USER_DATA_KEY, val);
    }
  },

  async clearAll(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      // Clear both stores -- a still-pending/failed migration could otherwise leave a stale
      // plaintext token behind after logout even though the secure copy was removed.
      await Promise.allSettled([
        SecureStorage.removeItem(ACCESS_TOKEN_KEY),
        SecureStorage.removeItem(REFRESH_TOKEN_KEY),
        SecureStorage.removeItem(USER_DATA_KEY),
        Preferences.remove({ key: ACCESS_TOKEN_KEY }),
        Preferences.remove({ key: REFRESH_TOKEN_KEY }),
        Preferences.remove({ key: USER_DATA_KEY }),
      ]);
    } else {
      memoryStore.clear();
    }
  },
};
