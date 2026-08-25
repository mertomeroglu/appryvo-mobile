import { registerPlugin, Capacitor } from '@capacitor/core';

interface CallAudioPlugin {
  setSpeakerOn(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  getSpeakerOn(): Promise<{ enabled: boolean }>;
  resetAudioMode(): Promise<void>;
}

const CallAudio = registerPlugin<CallAudioPlugin>('CallAudio');

/**
 * Earpiece/loudspeaker routing for an active call. Android-only native plugin (see
 * android/.../CallAudioPlugin.java) -- there is no web/WebView API for this, so every method
 * no-ops on web/iOS rather than throwing "not implemented".
 */
export const nativeCallAudio = {
  async setSpeakerOn(enabled: boolean): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return enabled;
    try {
      const res = await CallAudio.setSpeakerOn({ enabled });
      return res.enabled;
    } catch {
      return enabled;
    }
  },

  async resetAudioMode(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    try {
      await CallAudio.resetAudioMode();
    } catch {
      // Non-fatal: worst case the next call re-asserts MODE_IN_COMMUNICATION on its own.
    }
  },

  isSupported(): boolean {
    return Capacitor.getPlatform() === 'android';
  },
};
