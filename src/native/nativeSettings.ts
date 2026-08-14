import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';
import { Capacitor } from '@capacitor/core';

/** Opens the app's own OS settings screen (for a permanently-denied permission). No-ops on web. */
export const nativeAppSettings = {
  async open() {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.App,
      });
    } catch {
      // Non-fatal: user just won't be auto-navigated to settings.
    }
  },
};
