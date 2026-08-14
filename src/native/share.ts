import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

export const nativeShare = {
  async share(options: { title?: string; text?: string; url?: string; dialogTitle?: string }) {
    if (Capacitor.isNativePlatform()) {
      return await Share.share(options);
    }
    if (navigator.share) {
      return await navigator.share(options);
    }
    return null;
  },
};
