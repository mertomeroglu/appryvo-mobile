import {
  FirebaseMessaging,
  type NotificationActionPerformedEvent,
  type NotificationReceivedEvent,
  type Notification as FirebaseMessagingNotification,
} from '@capacitor-firebase/messaging';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

// RYVO PATCH V2 03 -- @capacitor/push-notifications alone only ever gets a raw APNs device token
// on iOS (confirmed: its podspec has zero Firebase dependency, and this app's AppDelegate never
// bridged the APNs token to Firebase's Messaging SDK either). The backend sends every platform
// through Firebase Admin SDK's FCM API, which rejects a raw APNs token outright -- a completely
// different token namespace/format -- so every iOS push failed unconditionally while Android
// (whose native registration already IS an FCM token) worked fine. @capacitor-firebase/messaging
// wraps the same native UNUserNotificationCenter/FCM machinery but actually performs the
// APNs-token -> FCM-token exchange on iOS via Firebase's native SDK, and returns a real,
// send-able FCM token on both platforms through one consistent API.
export type NotificationTapEvent = NotificationActionPerformedEvent;
export type NotificationReceivedPayload = FirebaseMessagingNotification;

// Must match the channelId the server sets on every push (fcm_service.js:
// android.notification.channelId). From Android 8 (API 26) on, a notification addressed to a
// channel that does not exist is dropped by the system without any error reaching the app or
// FCM -- which looked exactly like "push works in-app but never reaches the tray": the message
// arrived and our JS handler ran, but Android refused to post the tray notification.
export const PUSH_CHANNEL_ID = 'default';

let listenerHandles: PluginListenerHandle[] = [];

// Safe to call repeatedly: creating a channel that already exists is a no-op on Android, and
// the plugin is a no-op on iOS (which has no channels).
async function ensureAndroidChannel() {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    await FirebaseMessaging.createChannel({
      id: PUSH_CHANNEL_ID,
      // The app posts everything to this single channel, so the name has nothing to
      // disambiguate it from and a description would add nothing -- keeping it to the brand
      // name also keeps an untranslatable string out of Android's settings UI.
      name: 'Ryvo',
      importance: 4,
      visibility: 1,
      lights: true,
      vibration: true,
    });
  } catch (error) {
    console.warn('[PUSH] notification channel could not be created', error);
  }
}

async function removeManagedListeners() {
  const handles = listenerHandles;
  listenerHandles = [];
  await Promise.all(handles.map((handle) => handle.remove().catch(() => {})));
}

export const nativePush = {
  async register(
    onToken: (token: string) => void | Promise<void>,
    onNotificationTap?: (action: NotificationTapEvent) => void,
    onNotificationReceived?: (notification: NotificationReceivedPayload) => void,
    onRegistrationError?: (error: unknown) => void
  ) {
    if (!Capacitor.isNativePlatform()) return;

    await removeManagedListeners();

    try {
      // Listeners are attached before requesting permission/fetching the token, matching the
      // ordering already proven necessary for the previous plugin: the native side can start
      // emitting events (e.g. a token refresh) as soon as it's first touched, and a listener
      // added even slightly later has been observed to miss it.
      listenerHandles.push(await FirebaseMessaging.addListener('tokenReceived', (event) => {
        void onToken(event.token);
      }));

      if (onNotificationTap) {
        listenerHandles.push(await FirebaseMessaging.addListener('notificationActionPerformed', onNotificationTap));
      }

      // Fires when a push arrives while the app is in the foreground. On iOS specifically, per
      // this plugin's own contract, it also fires in the background but ONLY for silent
      // (content-available) pushes -- a standard alert push while backgrounded is handled by the
      // OS directly and only reaches the app via a subsequent notificationActionPerformed tap.
      if (onNotificationReceived) {
        listenerHandles.push(await FirebaseMessaging.addListener('notificationReceived', (event: NotificationReceivedEvent) => {
          onNotificationReceived(event.notification);
        }));
      }

      // Before the first push can arrive, not lazily on receipt: a push that lands while the
      // app is backgrounded is posted by the OS with no chance for us to create it first.
      await ensureAndroidChannel();

      let perm = await FirebaseMessaging.checkPermissions();
      if (perm.receive !== 'granted') {
        perm = await FirebaseMessaging.requestPermissions();
      }
      if (perm.receive !== 'granted') return;

      // getToken() is awaitable and directly returns the real FCM-compatible token (internally
      // performing the APNs exchange on iOS) -- no need to wait on a fire-and-forget native
      // 'registration' event just for the initial token the way the old plugin required.
      const { token } = await FirebaseMessaging.getToken();
      if (token) void onToken(token);
    } catch (error) {
      onRegistrationError?.(error);
    }
  },

  async removeAllListeners() {
    if (Capacitor.isNativePlatform()) {
      await removeManagedListeners();
    }
  },
};
