import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mobileSource = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
const webSource = (path: string) => readFileSync(resolve(process.cwd(), '..', 'web', path), 'utf8');

describe('filter, map, and frame performance contracts', () => {
  it('uses an intuitive device icon for System appearance', () => {
    const settings = mobileSource('features/profile/SettingsScreen.tsx');
    expect(settings).toContain("{ value: 'system', labelKey: 'settingsThemeSystem', icon: <Smartphone");
    expect(settings).not.toContain('font-black">A</span>');
  });

  it('caches immutable catalog separately and uses optimized lazy preview artwork', () => {
    const hooks = mobileSource('hooks/useQueries.ts');
    const screen = mobileSource('features/frames/ProfileFramesScreen.tsx');
    const server = webSource('server/api/src/user_controller.js');
    expect(hooks).toContain("'/api/profile/frames/catalog'");
    expect(hooks).toContain('staleTime: 24 * 60 * 60 * 1000');
    expect(hooks).toContain('gcTime: 7 * 24 * 60 * 60 * 1000');
    expect(hooks).toContain("'/api/profile/frames/ownership'");
    expect(screen).toContain('preferPreview');
    expect(screen).toContain('eager={index < 4}');
    expect(screen).toContain("contentVisibility: 'auto'");
    expect(screen).toContain('ryvo:frames:shell-ready');
    expect(screen).toContain('ryvo:frames:catalog-ready');
    expect(screen).toContain('ryvo:frames:first-artwork-ready');
    expect(server).toContain('previewAsset:');
    expect(server).toContain('PROFILE_FRAME_ASSET_BASE_URL');
    expect(server).not.toContain('FALLBACK_PROFILE_FRAME_ROWS');

    const previewDir = resolve(process.cwd(), '..', 'web', 'assets', 'frames', 'preview');
    const assets = readdirSync(previewDir).filter((name) => name.endsWith('.webp'));
    const totalBytes = assets.reduce((total, name) => total + statSync(resolve(previewDir, name)).size, 0);
    expect(assets).toHaveLength(6);
    expect(totalBytes).toBeLessThan(150 * 1024);
  });

  it('warms profile code, measures the three milestones, and avoids redundant frame profile reads', () => {
    const routes = mobileSource('routes/index.tsx');
    const preload = mobileSource('routes/routePreload.ts');
    const nav = mobileSource('components/FloatingNavBar.tsx');
    const profile = mobileSource('features/profile/OwnProfileScreen.tsx');
    const frames = mobileSource('features/frames/ProfileFramesScreen.tsx');

    expect(routes).toContain('ProfileRouteFallback');
    expect(preload).toContain('preloadProfileExperience');
    expect(nav).toContain('markProfileNavigationStart');
    expect(profile).toContain("measureProfileMilestone('shell-ready')");
    expect(profile).toContain("measureProfileMilestone('data-ready')");
    expect(profile).toContain("measureProfileMilestone('interactive')");
    expect(frames).not.toContain('useMeQuery');
  });

  it('keeps profile photo persistence atomic and primary-photo ordering authoritative', () => {
    const server = webSource('server/api/src/user_controller.js');
    const authStore = mobileSource('stores/useAuthStore.ts');
    expect(server).toContain('await Promise.all([');
    expect(server).toContain('ORDER BY up.is_main DESC, up.display_order ASC, up.created_at ASC');
    expect(server).toContain("await client.query('BEGIN')");
    expect(server).toContain("await client.query('ROLLBACK')");
    expect(server).toContain('FROM unnest($2::text[]) WITH ORDINALITY');
    expect(server).toContain('photos.map((url) => ownPhotoView(url, statuses.get(url)))');
    expect(authStore).toContain('requestId === latestFetchMeRequest');
    expect(authStore).toContain('versionAtStart === userStateVersion');
  });
});
