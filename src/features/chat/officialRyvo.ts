export const OFFICIAL_RYVO_EVENT_TYPES = new Set([
  'ADMIN_TEST',
  'MODERATOR_MESSAGE',
  'SYSTEM_MESSAGE',
  'ACCOUNT_STATUS',
  'SAFETY_NOTICE',
  'SUPPORT_MESSAGE',
]);

export function isOfficialRyvoMessage(item: any) {
  return OFFICIAL_RYVO_EVENT_TYPES.has(String(item?.event_type || item?.type || '').toUpperCase());
}

export function officialMessageTimestamp(item: any) {
  return item?.created_at || item?.createdAt || '';
}

export function buildOfficialRyvoThread(items: any[]) {
  const byId = new Map<string, any>();
  items.filter(isOfficialRyvoMessage).forEach((item) => {
    const id = String(item?.id || '');
    if (id && !byId.has(id)) byId.set(id, item);
  });
  return [...byId.values()].sort(
    (a, b) => new Date(officialMessageTimestamp(a)).getTime() - new Date(officialMessageTimestamp(b)).getTime()
  );
}
