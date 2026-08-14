const WEEKDAY_LABELS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Formats a timestamp for the messages list / notifications feed:
 * today -> "14:35", yesterday -> "Dün", within the last 6 days -> weekday name,
 * older -> "DD.MM.YYYY". Never renders a raw ISO string.
 */
export function formatMessageTime(input?: string | number | Date | null): string {
  if (!input) return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const today = startOfDay(now);
  const target = startOfDay(date);
  const dayDiff = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (dayDiff === 0) {
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  if (dayDiff === 1) {
    return 'Dün';
  }
  if (dayDiff > 1 && dayDiff < 7) {
    return WEEKDAY_LABELS[date.getDay()];
  }
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
