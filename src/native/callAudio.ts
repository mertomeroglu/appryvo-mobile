import { registerPlugin, Capacitor } from '@capacitor/core';

interface CallAudioPlugin {
  startCallAudioSession(options: { speakerOn: boolean }): Promise<{ speakerOn: boolean }>;
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
  async startCallAudioSession(speakerOn: boolean): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return speakerOn;
    try {
      const res = await CallAudio.startCallAudioSession({ speakerOn });
      return res.speakerOn;
    } catch (error) {
      console.warn('[CALL][Audio] Failed to start Android call audio session', error);
      return speakerOn;
    }
  },

  async setSpeakerOn(enabled: boolean): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') return enabled;
    try {
      const res = await CallAudio.setSpeakerOn({ enabled });
      return res.enabled;
    } catch (error) {
      console.warn('[CALL][Audio] Failed to change Android speaker route', error);
      return enabled;
    }
  },

  async resetAudioMode(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    try {
      await CallAudio.resetAudioMode();
    } catch (error) {
      console.warn('[CALL][Audio] Failed to restore Android audio mode', error);
    }
  },

  isSupported(): boolean {
    return Capacitor.getPlatform() === 'android';
  },
};
