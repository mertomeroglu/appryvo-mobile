import { useAppLocaleStore, translateSync } from '../i18n/appLocale';

function currentLocale(): string {
  return useAppLocaleStore.getState().locale;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatMessageDay(input?: string | number | Date | null): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const locale = currentLocale();
  const now = new Date();
  const today = startOfDay(now);
  const target = startOfDay(date);
  const dayDiff = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (dayDiff === 0) return translateSync('todayLabel');
  if (dayDiff === 1) return translateSync('yesterdayLabel');
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Formats a timestamp for the messages list / notifications feed:
 * today -> locale time (e.g. "14:35"), yesterday -> yesterday label, within the last 6 days ->
 * locale weekday name, older -> locale short date. Never renders a raw ISO string.
 */
export function formatMessageTime(input?: string | number | Date | null): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const locale = currentLocale();
  const now = new Date();
  const today = startOfDay(now);
  const target = startOfDay(date);
  const dayDiff = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (dayDiff === 0) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (dayDiff === 1) {
    return translateSync('yesterdayLabel');
  }
  if (dayDiff > 1 && dayDiff < 7) {
    return date.toLocaleDateString(locale, { weekday: 'long' });
  }
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
