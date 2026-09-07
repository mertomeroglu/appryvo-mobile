import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({
  pending: [] as { id: number }[],
  permission: 'granted' as 'granted' | 'denied',
  stored: null as string | null,
  schedule: vi.fn(async ({ notifications }: any) => { mocks.pending.push(...notifications); }),
  cancel: vi.fn(async () => { mocks.pending.length = 0; }),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: mocks.permission })),
    getPending: vi.fn(async () => ({ notifications: mocks.pending })),
    schedule: mocks.schedule,
    cancel: mocks.cancel,
  },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: mocks.stored })),
    set: vi.fn(async ({ value }: { value: string }) => { mocks.stored = value; }),
  },
}));

import {
  localReengagement,
  REENGAGEMENT_DELAY_MS,
  REENGAGEMENT_NOTIFICATION_ID,
  shiftOutOfQuietTime,
} from '../src/services/notifications/localReengagement';
import { navigateMapToGeography } from '../src/features/map/geoNavigation';

const source = (file: string) => readFileSync(resolve(process.cwd(), 'src', file), 'utf8');

describe('production map, header, avatar, and local re-engagement fixes', () => {
  beforeEach(() => {
    mocks.pending.length = 0;
    mocks.permission = 'granted';
    mocks.stored = null;
    mocks.schedule.mockClear();
    mocks.cancel.mockClear();
  });

  it('uses PEOPLE as the environment-independent map default while retaining rooms', () => {
    const map = source('features/map/SocialMapScreen.tsx');
    expect(map).toContain("useState<'people'|'rooms'>('people')");
    expect(map).not.toContain('import.meta.env.MODE');
    expect(map).toContain("(['rooms','people'] as const)");
  });

  it('map geography selection never routes to a room directory and preserves lng,lat order', () => {
    const map = source('features/map/SocialMapScreen.tsx');
    expect(map).not.toContain('navigate(`/rooms/city/${city.id}`)');
    const flyTo = vi.fn();
    const fitBounds = vi.fn();
    navigateMapToGeography({ flyTo, fitBounds }, { type: 'city', city: 'Paris', latitude: 48.8566, longitude: 2.3522 });
    expect(flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [2.3522, 48.8566], zoom: 13 }));
    expect(fitBounds).not.toHaveBeenCalled();
    navigateMapToGeography({ flyTo, fitBounds }, {
      type: 'country', city: 'France', latitude: 46.2, longitude: 2.2,
      westLongitude: -5, southLatitude: 42, eastLongitude: 8, northLatitude: 51,
    });
    expect(fitBounds).toHaveBeenCalledWith([[-5, 42], [8, 51]], expect.objectContaining({ maxZoom: 5 }));
  });

  it('keeps the search icon above the input and pointer-safe result selection', () => {
    const map = source('features/map/SocialMapScreen.tsx');
    expect(map).toMatch(/<Search[^>]+pointer-events-none[^>]+z-10/);
    expect(map).toContain('onPointerDown={(event) => { event.preventDefault(); selectCity(city); }}');
  });

  it('uses an additive shared safe-area header and suppresses duplicate room subtitles', async () => {
    const header = source('components/ui/ScreenHeader.tsx');
    expect(header).toContain('<div className="pt-safe">');
    expect(header).toContain('min-h-14');
    expect(header).not.toMatch(/pt-safe[^'\"]*h-16/);
    const { usefulRoomSubtitle } = await import('../src/features/rooms/roomTitle');
    expect(usefulRoomSubtitle('Şehir Odaları', '  şehir odaları ')).toBeNull();
    expect(usefulRoomSubtitle('Paris', 'Şehir Odaları')).toBe('Şehir Odaları');
  });

  it('uses a thin xs flag border and layered unclipped avatar badges', () => {
    expect(source('components/ui/CountryFlagBadge.tsx')).toContain("xs: 'h-3.5 w-3.5 border'");
    const avatar = source('components/ui/FramedAvatar.tsx');
    expect(avatar).toContain('isolate overflow-visible');
    expect(avatar).toContain('data-avatar-clip="circular"');
    expect(avatar).toContain('data-avatar-badge="online"');
    expect(avatar).toContain("typeof online === 'boolean'");
    expect(avatar).toContain("online ? 'bg-success' : 'bg-presence-offline'");
    expect(avatar).toContain('h-[13%]');
    expect(avatar).toContain('left-[16%] top-[86%]');
    expect(avatar).toContain('left-[87%] top-[86%]');
    expect(avatar).toContain("style={{ width: '16%', height: '16%' }}");
    expect(avatar).toContain('data-avatar-badge="verified"');
    expect(avatar).toContain('data-avatar-badge="country"');
  });

  it('ships semantic presence and badge colors in production CSS', () => {
    const css = source('styles/globals.css');
    expect(css).toContain('.bg-success');
    expect(css).toContain('.bg-presence-offline');
    expect(css).toContain('.border-surface');
  });

  it('schedules one stable generic reminder about 48h after backgrounding', async () => {
    const now = new Date(2026, 8, 7, 10, 0, 0);
    expect(await localReengagement.schedule('tr', now)).toBe(true);
    const notification = mocks.schedule.mock.calls[0][0].notifications[0];
    expect(notification.id).toBe(REENGAGEMENT_NOTIFICATION_ID);
    expect(notification.body).not.toMatch(/mesaj|eşleş|beğen/i);
    expect(notification.schedule.at.getTime()).toBe(now.getTime() + REENGAGEMENT_DELAY_MS);
  });

  it('prevents duplicate pending reminders', async () => {
    const now = new Date(2026, 8, 7, 10, 0, 0);
    expect(await localReengagement.schedule('en', now)).toBe(true);
    expect(await localReengagement.schedule('en', now)).toBe(false);
    expect(mocks.schedule).toHaveBeenCalledTimes(1);
  });

  it('cancels only the stable Ryvo reminder on foreground/logout paths', async () => {
    await localReengagement.cancel();
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: REENGAGEMENT_NOTIFICATION_ID }] });
    expect(source('stores/useAuthStore.ts')).toContain('await localReengagement.cancel()');
  });

  it('shifts overnight reminders to 09:15 local time', () => {
    const shifted = shiftOutOfQuietTime(new Date(2026, 8, 7, 23, 30));
    expect(shifted.getDate()).toBe(8);
    expect([shifted.getHours(), shifted.getMinutes()]).toEqual([9, 15]);
  });

  it('does not crash or schedule when notification permission is denied', async () => {
    mocks.permission = 'denied';
    await expect(localReengagement.schedule('en')).resolves.toBe(false);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('enforces the rolling 24-hour and seven-day delivery caps', async () => {
    const now = new Date(2026, 8, 7, 12, 0, 0);
    mocks.stored = JSON.stringify({ pendingAt: null, deliveryHistory: [now.getTime() - 60_000] });
    expect(await localReengagement.schedule('en', now)).toBe(false);
    mocks.stored = JSON.stringify({ pendingAt: null, deliveryHistory: [2, 3, 4].map((days) => now.getTime() - days * 86_400_000) });
    expect(await localReengagement.schedule('en', now)).toBe(false);
  });

  it('does not introduce a local unread-message reminder', () => {
    const local = source('services/notifications/localReengagement.ts');
    expect(local).not.toContain('UNREAD_MESSAGES');
    expect(local).toContain('RYVO_GENERIC_REENGAGEMENT');
  });
});
