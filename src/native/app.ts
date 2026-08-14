import { App, AppState } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export const nativeApp = {
  async addStateChangeListener(listener: (state: AppState) => void) {
    if (Capacitor.isNativePlatform()) {
      return await App.addListener('appStateChange', listener);
    }
    const handler = () => {
      listener({ isActive: !document.hidden });
    };
    document.addEventListener('visibilitychange', handler);
    return {
      remove: () => document.removeEventListener('visibilitychange', handler),
    };
  },

  async getAppInfo() {
    if (Capacitor.isNativePlatform()) {
      return await App.getInfo();
    }
    return { name: 'Appryvo', id: 'com.appryvo.ryvo', build: '1', version: '1.0.0' };
  },

  async exitApp() {
    if (Capacitor.isNativePlatform()) {
      await App.exitApp();
    }
  },
};
