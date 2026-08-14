import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export const nativeDeepLinks = {
  async addUrlListener(callback: (event: URLOpenListenerEvent) => void) {
    if (Capacitor.isNativePlatform()) {
      return await App.addListener('appUrlOpen', callback);
    }
    return { remove: () => {} };
  },
};
