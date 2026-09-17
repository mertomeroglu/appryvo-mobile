import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { messages } from '../src/i18n/appLocale';

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
    expect(screen).toContain("t('discoverCompletePhotosTitle')");
    expect(screen).toContain("t('discoverNoMatchTitle')");
    expect(messages.tr.discoverCompletePhotosTitle).toBe('Profil Fotoğraflarını Tamamla');
    expect(messages.tr.discoverNoMatchTitle).toBe('Filtrelerine Uygun Profil Bulunamadı');
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
    expect(screen).toContain("t('discoverServicesDisabledBanner')");
    expect(messages.tr.discoverServicesDisabledBanner).toBe('Cihaz konum servisini aç');
    expect(screen).toContain('void resolveDiscoverLocationRef.current(false, true, false)');
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

  it('shows one profile at a time with a keyed, gesture-free exit transition', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');

    // Question-based discovery replaced the swipe deck: exactly one candidate is on screen, it
    // leaves through an AnimatePresence transition (never a drag), and a handled profile is
    // never handed out again in the same session.
    expect(screen).toContain('key={currentProfile.id}');
    expect(screen).toContain('<AnimatePresence mode="wait" initial={false}>');
    expect(screen).toContain('consumedProfileIds.has(p.id)');
    expect(screen).not.toContain('SwipeCard');
    expect(screen).not.toContain('drag=');
    expect(screen).not.toContain('enqueueDiscoveryAction');
  });

  it('offers exactly the three question-flow actions and no like/pass/rewind buttons', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');

    expect(screen).toContain("qt('answerQuestion')");
    expect(screen).toContain("qt('viewProfile')");
    expect(screen).toContain("qt('skipForNow')");
    expect(screen).toContain('passMutation.mutateAsync(profile.id)');
    expect(screen).toContain('<QuestionAnswerSheet');
    // Blocked feeds send people to the question editor, never to a swipe upsell.
    expect(screen).toContain('<QuestionsRequiredGate />');
    expect(screen).not.toContain('handleAction(');
    expect(screen).not.toContain('useLikeMutation');
    expect(screen).not.toContain('handleRewind');
  });

  it('keeps photo taps inside Framer gesture arbitration', () => {
    const card = source('features/discovery/SwipeCard.tsx');

    expect(card).toContain('drag={isTop}');
    expect(card).toContain('onTap={() => goPhoto(-1)}');
    expect(card).toContain('onTap={() => goPhoto(1)}');
    expect(card).not.toContain('onClick={() => goPhoto');
  });
});
