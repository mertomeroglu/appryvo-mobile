import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

export const nativeKeyboard = {
  async hide() {
    if (Capacitor.isNativePlatform()) {
      try {
        await Keyboard.hide();
      } catch {
        // Keyboard dismissal is best-effort and must never block form navigation/submission.
      }
    }
  },

  async addShowListener(callback: (info: { keyboardHeight: number }) => void) {
    if (Capacitor.isNativePlatform()) {
      return await Keyboard.addListener('keyboardWillShow', callback);
    }
    return { remove: () => {} };
  },

  async addHideListener(callback: () => void) {
    if (Capacitor.isNativePlatform()) {
      return await Keyboard.addListener('keyboardWillHide', callback);
    }
    return { remove: () => {} };
  },
};
