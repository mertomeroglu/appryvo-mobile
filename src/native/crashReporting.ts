import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';
import { Capacitor } from '@capacitor/core';

// Crashlytics is native-only (no web/dev-server implementation) -- every call here is a no-op
// off-device so this is safe to call unconditionally from anywhere, including during `vite dev`.
const isNative = () => Capacitor.isNativePlatform();

export const crashReporting = {
  async recordException(error: unknown, context?: string) {
    if (!isNative()) return;
    try {
      // The plugin's optional `stacktrace` field expects stacktrace.js's parsed StackFrame[]
      // shape specifically, not a raw string -- rather than hand-parsing V8 stack strings into
      // that shape (fragile, JS-engine-dependent), fold the raw stack into the message itself.
      // Crashlytics still groups/displays it; it just won't get symbolicated per-frame.
      const base = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const withStack = error instanceof Error && error.stack ? `${base}\n${error.stack}` : base;
      const message = (context ? `[${context}] ${withStack}` : withStack).slice(0, 4000);
      await FirebaseCrashlytics.recordException({ message });
    } catch {
      // Never let crash-reporting itself throw -- it must not be able to break the app it's
      // supposed to be observing.
    }
  },

  async setUserId(userId: string | null) {
    if (!isNative()) return;
    try {
      await FirebaseCrashlytics.setUserId({ userId: userId || '' });
    } catch {
      // best-effort
    }
  },

  async log(message: string) {
    if (!isNative()) return;
    try {
      await FirebaseCrashlytics.log({ message });
    } catch {
      // best-effort
    }
  },
};
