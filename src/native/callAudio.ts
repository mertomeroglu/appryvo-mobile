import { registerPlugin, Capacitor } from '@capacitor/core';

interface CallAudioPlugin {
  startCallAudioSession(options: { speakerOn: boolean }): Promise<{ speakerOn: boolean }>;
  setSpeakerOn(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  getSpeakerOn(): Promise<{ enabled: boolean }>;
  resetAudioMode(): Promise<void>;
}

const CallAudio = registerPlugin<CallAudioPlugin>('CallAudio');

/**
 * Earpiece/loudspeaker routing for an active call through the matching Android/iOS plugins.
 */
export const nativeCallAudio = {
  async startCallAudioSession(speakerOn: boolean): Promise<boolean> {
    if (!['android', 'ios'].includes(Capacitor.getPlatform())) return speakerOn;
    try {
      const res = await CallAudio.startCallAudioSession({ speakerOn });
      return res.speakerOn;
    } catch (error) {
      console.warn('[CALL][Audio] Failed to start native call audio session', error);
      return speakerOn;
    }
  },

  async setSpeakerOn(enabled: boolean): Promise<boolean> {
    if (!['android', 'ios'].includes(Capacitor.getPlatform())) return enabled;
    try {
      const res = await CallAudio.setSpeakerOn({ enabled });
      return res.enabled;
    } catch (error) {
      console.warn('[CALL][Audio] Failed to change native speaker route', error);
      return enabled;
    }
  },

  async resetAudioMode(): Promise<void> {
    if (!['android', 'ios'].includes(Capacitor.getPlatform())) return;
    try {
      await CallAudio.resetAudioMode();
    } catch (error) {
      console.warn('[CALL][Audio] Failed to restore native audio mode', error);
    }
  },

  isSupported(): boolean {
    return ['android', 'ios'].includes(Capacitor.getPlatform());
  },
};
