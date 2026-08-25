import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

let listenerHandles: PluginListenerHandle[] = [];

async function removeManagedListeners() {
  const handles = listenerHandles;
  listenerHandles = [];
  await Promise.all(handles.map((handle) => handle.remove().catch(() => {})));
}

export const nativePush = {
  async register(
    onToken: (token: string) => void | Promise<void>,
    onNotificationTap?: (action: ActionPerformed) => void,
    onNotificationReceived?: (notification: PushNotificationSchema) => void,
    onRegistrationError?: (error: unknown) => void
  ) {
    if (!Capacitor.isNativePlatform()) return;

    await removeManagedListeners();

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }

    if (perm.receive === 'granted') {
      // Listeners MUST be attached before register() is called, not after -- confirmed on
      // device that the native side can fire 'registration' as soon as register() runs, and a
      // listener added even a few milliseconds later than that call already missed it (no
      // buffering/replay observed for this event on this plugin version). Registering listeners
      // first, then calling register(), was the only ordering that actually delivered a token.
      listenerHandles.push(await PushNotifications.addListener('registration', (token: Token) => {
        void onToken(token.value);
      }));

      listenerHandles.push(await PushNotifications.addListener('registrationError', (error) => {
        onRegistrationError?.(error);
      }));

      if (onNotificationTap) {
        listenerHandles.push(await PushNotifications.addListener('pushNotificationActionPerformed', onNotificationTap));
      }

      // Fires when a push arrives while the app is in the foreground -- without this listener
      // the OS/plugin still receives the message, but nothing in the JS app ever finds out, so
      // a push sent while the user has the app open silently does nothing (confirmed missing;
      // this was the only push listener not wired up at all).
      if (onNotificationReceived) {
        listenerHandles.push(await PushNotifications.addListener('pushNotificationReceived', onNotificationReceived));
      }

      await PushNotifications.register();
    }
  },

  async removeAllListeners() {
    if (Capacitor.isNativePlatform()) {
      await removeManagedListeners();
    }
  },
};
