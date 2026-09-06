import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import type { AppLocale } from '../../i18n/appLocale';

export const REENGAGEMENT_NOTIFICATION_ID = 48001;
export const REENGAGEMENT_DELAY_MS = 48 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const STATE_KEY = 'ryvo_local_reengagement_v1';

interface ReengagementState {
  pendingAt: number | null;
  deliveryHistory: number[];
}

const COPY: Record<AppLocale, { title: string; body: string }> = {
  tr: { title: 'Ryvo', body: "Ryvo'da seni bekleyen yenilikler var." },
  en: { title: 'Ryvo', body: 'There are new things waiting for you on Ryvo.' },
  es: { title: 'Ryvo', body: 'Hay novedades esperándote en Ryvo.' },
  fr: { title: 'Ryvo', body: 'Des nouveautés vous attendent sur Ryvo.' },
  pt: { title: 'Ryvo', body: 'Há novidades esperando por você no Ryvo.' },
  ru: { title: 'Ryvo', body: 'В Ryvo вас ждут новые события.' },
  ar: { title: 'Ryvo', body: 'هناك أشياء جديدة بانتظارك على Ryvo.' },
  hi: { title: 'Ryvo', body: 'Ryvo पर आपके लिए नई चीज़ें इंतज़ार कर रही हैं।' },
  zh: { title: 'Ryvo', body: 'Ryvo 上有新鲜内容等着你。' },
};

async function readState(): Promise<ReengagementState> {
  try {
    const { value } = await Preferences.get({ key: STATE_KEY });
    const parsed = value ? JSON.parse(value) : null;
    return {
      pendingAt: Number.isFinite(parsed?.pendingAt) ? parsed.pendingAt : null,
      deliveryHistory: Array.isArray(parsed?.deliveryHistory)
        ? parsed.deliveryHistory.filter(Number.isFinite)
        : [],
    };
  } catch {
    return { pendingAt: null, deliveryHistory: [] };
  }
}

async function writeState(state: ReengagementState): Promise<void> {
  await Preferences.set({ key: STATE_KEY, value: JSON.stringify(state) });
}

export function shiftOutOfQuietTime(date: Date): Date {
  const shifted = new Date(date);
  if (shifted.getHours() >= 22) {
    shifted.setDate(shifted.getDate() + 1);
    shifted.setHours(9, 15, 0, 0);
  } else if (shifted.getHours() < 9) {
    shifted.setHours(9, 15, 0, 0);
  }
  return shifted;
}

function reconcileState(state: ReengagementState, now: number): ReengagementState {
  const deliveryHistory = state.deliveryHistory.filter((at) => at > now - SEVEN_DAYS_MS);
  if (state.pendingAt !== null && state.pendingAt <= now) deliveryHistory.push(state.pendingAt);
  return { pendingAt: state.pendingAt !== null && state.pendingAt > now ? state.pendingAt : null, deliveryHistory };
}

export const localReengagement = {
  async schedule(locale: AppLocale, now = new Date()): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') return false;

      const nowMs = now.getTime();
      const state = reconcileState(await readState(), nowMs);
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.some((notification) => notification.id === REENGAGEMENT_NOTIFICATION_ID)) return false;
      if (state.pendingAt && state.pendingAt > nowMs) return false;
      if (state.deliveryHistory.some((at) => at > nowMs - ONE_DAY_MS)) return false;
      if (state.deliveryHistory.length >= 3) return false;

      const trigger = shiftOutOfQuietTime(new Date(nowMs + REENGAGEMENT_DELAY_MS));
      const copy = COPY[locale] || COPY.en;
      await LocalNotifications.schedule({ notifications: [{
        id: REENGAGEMENT_NOTIFICATION_ID,
        title: copy.title,
        body: copy.body,
        schedule: { at: trigger, allowWhileIdle: false },
        extra: { kind: 'RYVO_GENERIC_REENGAGEMENT' },
      }] });
      await writeState({ ...state, pendingAt: trigger.getTime() });
      return true;
    } catch {
      return false;
    }
  },

  async cancel(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await LocalNotifications.cancel({ notifications: [{ id: REENGAGEMENT_NOTIFICATION_ID }] });
      const state = reconcileState(await readState(), Date.now());
      await writeState({ ...state, pendingAt: null });
    } catch {
      // Notification permission/plugin failures never block foregrounding or logout.
    }
  },
};
