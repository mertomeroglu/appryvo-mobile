import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const nativeHaptics = {
  async impact(style: ImpactStyle = ImpactStyle.Medium) {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style });
    } else if ('vibrate' in navigator) {
      navigator.vibrate(15);
    }
  },

  async notification(type: NotificationType = NotificationType.Success) {
    if (Capacitor.isNativePlatform()) {
      await Haptics.notification({ type });
    }
  },

  async vibrate() {
    if (Capacitor.isNativePlatform()) {
      await Haptics.vibrate();
    } else if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  },
};
