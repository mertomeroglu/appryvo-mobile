import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const source = (relativePath: string) => fs.readFileSync(path.join(root, 'src', relativePath), 'utf8');

describe('P0 Discover recovery contract', () => {
  it('keeps Discover and its shared states UTF-8 clean and SVG-only', () => {
    const discover = source('features/discovery/DiscoverScreen.tsx');
    const states = [
      discover,
      source('components/ui/EmptyState.tsx'),
      source('components/ui/ErrorState.tsx'),
      source('components/ui/PermissionDeniedState.tsx'),
      source('components/ui/NoInternetState.tsx'),
      source('components/ui/LoadingState.tsx'),
      source('services/api/apiClient.ts'),
    ].join('\n');

    expect(states).not.toMatch(/[ÃÅÄ]|â[€šœ]|ï¸|ğŸ/);
    expect(discover).not.toContain('⚠️');
    expect(discover).not.toContain('🔥');
    expect(discover).toContain('TriangleAlert');
    expect(discover).toContain('SearchX');
    expect(source('components/ui/ErrorState.tsx')).toContain('TriangleAlert');
  });

  it('separates feed eligibility from transport failures and useful empty states', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');

    expect(screen).toContain("feedErrorCode === 'MIN_PROFILE_PHOTOS'");
    expect(screen).toContain('Profil Fotoğraflarını Tamamla');
    expect(screen).toContain('Filtrelerine Uygun Profil Bulunamadı');
    expect(screen).toContain("feedErrorCode === 'NETWORK_ERROR'");
    expect(screen).toContain('onRetry={() => void refetch()}');
  });

  it('distinguishes app permission, disabled device services, missing signal, and API sync failure', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');

    expect(screen).toContain("| 'permissionDenied'");
    expect(screen).toContain("| 'servicesDisabled'");
    expect(screen).toContain("| 'unavailable'");
    expect(screen).toContain("| 'syncFailed'");
    expect(screen).toContain('Geolocation.checkPermissions()');
    expect(screen).toContain("setLocationGate(isLocationServicesDisabled(error) ? 'servicesDisabled' : 'unavailable')");
    expect(screen).toContain("setLocationGate('syncFailed')");
    expect(screen).toContain('Cihaz konum servisini aç');
    expect(screen).toContain('void resolveDiscoverLocation(false, announceSuccess, false)');
    expect(screen).not.toContain('Yakındakileri görmek için konumu aç');
  });

  it('paginates only with the opaque server cursor and preserves response order', () => {
    const hooks = source('hooks/useQueries.ts');
    const screen = source('features/discovery/DiscoverScreen.tsx');

    expect(hooks).toContain("params.set('cursor', cursor)");
    expect(hooks).not.toContain('/api/discovery/feed?page=');
    expect(screen).toContain('return [...prev, ...additions]');
    expect(screen).not.toMatch(/\.sort\(/);
    expect(screen).toContain('setCursor(nextCursor)');
  });

  it('commits a swipe optimistically and retains a stable keyed exit layer', () => {
    const card = source('features/discovery/SwipeCard.tsx');
    const screen = source('features/discovery/DiscoverScreen.tsx');

    expect(card.indexOf('onSwiped(direction, profile)')).toBeLessThan(card.indexOf("animate(x, targetX"));
    expect(screen).toContain('key={profile.id}');
    expect(screen).toContain('isExiting={isExiting}');
    expect(screen).toContain('consumedProfileIdsRef.current.has(p.id)');
  });

  it('uses the same central trigger for buttons and blocks unavailable super likes', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');

    expect(screen).toContain("handleAction('left')");
    expect(screen).toContain("handleAction('right')");
    expect(screen).toContain("handleAction('up')");
    expect(screen).toContain("topCardRef.current?.triggerSwipe(direction)");
    expect(screen).toContain("navigate('/premium')");
  });

  it('keeps photo taps inside Framer gesture arbitration', () => {
    const card = source('features/discovery/SwipeCard.tsx');

    expect(card).toContain('drag={isTop}');
    expect(card).toContain('onTap={() => goPhoto(-1)}');
    expect(card).toContain('onTap={() => goPhoto(1)}');
    expect(card).not.toContain('onClick={() => goPhoto');
  });
});
