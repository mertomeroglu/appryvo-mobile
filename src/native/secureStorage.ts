import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const ACCESS_TOKEN_KEY = 'ryvo_secure_access_token';
const REFRESH_TOKEN_KEY = 'ryvo_secure_refresh_token';
const USER_DATA_KEY = 'ryvo_secure_user_data';

// Development in-memory fallback for non-native web dev mode
const memoryStore = new Map<string, string>();

export const secureStorage = {
  async getAccessToken(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: ACCESS_TOKEN_KEY });
      return value;
    }
    return memoryStore.get(ACCESS_TOKEN_KEY) || null;
  },

  async setAccessToken(token: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: ACCESS_TOKEN_KEY, value: token });
    } else {
      memoryStore.set(ACCESS_TOKEN_KEY, token);
    }
  },

  async getRefreshToken(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: REFRESH_TOKEN_KEY });
      return value;
    }
    return memoryStore.get(REFRESH_TOKEN_KEY) || null;
  },

  async setRefreshToken(token: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key: REFRESH_TOKEN_KEY, value: token });
    } else {
      memoryStore.set(REFRESH_TOKEN_KEY, token);
    }
  },

  async getUserData<T = any>(): Promise<T | null> {
    let raw: string | null = null;
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: USER_DATA_KEY });
      raw = value;
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
      await Preferences.set({ key: USER_DATA_KEY, value: val });
    } else {
      memoryStore.set(USER_DATA_KEY, val);
    }
  },

  async clearAll(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key: ACCESS_TOKEN_KEY });
      await Preferences.remove({ key: REFRESH_TOKEN_KEY });
      await Preferences.remove({ key: USER_DATA_KEY });
    } else {
      memoryStore.clear();
    }
  },
};
