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

  /** Scoped hardware-back handler for a component that owns its own "close this overlay"
   * concept (e.g. a fullscreen viewer) -- NOT a general app-wide back-stack. Caller must remove
   * the listener when the overlay closes/unmounts so back returns to default router behavior. */
  async addBackButtonListener(onBack: () => void) {
    if (Capacitor.isNativePlatform()) {
      return await App.addListener('backButton', onBack);
    }
    return { remove: () => {} };
  },

  async getAppInfo() {
    if (Capacitor.isNativePlatform()) {
      return await App.getInfo();
    }
    return { name: 'Ryvo', id: 'com.appryvo.ryvo', build: '1', version: '1.0.0' };
  },

  async exitApp() {
    if (Capacitor.isNativePlatform()) {
      await App.exitApp();
    }
  },
};
