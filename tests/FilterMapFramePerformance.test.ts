import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { avatarMarkerHtml, buildSocialClusterHtml, markerSizeForZoom } from '../src/features/map/SocialMapScreen';

const mobileSource = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
const webSource = (path: string) => readFileSync(resolve(process.cwd(), '..', 'web', path), 'utf8');

describe('filter, map, and frame performance contracts', () => {
  it('keeps one 18-99 draft-only age interval whose rail ends at thumb centres', () => {
    const filter = mobileSource('components/FilterBottomSheet.tsx');
    const slider = mobileSource('components/ui/DualRangeSlider.tsx');
    expect(filter).toContain('<DualRangeSlider min={18} max={99}');
    expect(filter).toMatch(/onChange=\{\(a, b\) => \{ setMinAge\(a\); setMaxAge\(b\); \}\}/);
    expect(filter).toMatch(/const handleApply = async[\s\S]*updateProfile\.mutateAsync/);
    expect(slider).toContain('left-[10px] right-[10px]');
    expect(slider).toContain('(100% - 20px)');
    expect(slider).not.toContain('Minimum</');
    expect(slider).not.toContain('Maksimum</');
  });

  it('uses an intuitive device icon for System appearance', () => {
    const settings = mobileSource('features/profile/SettingsScreen.tsx');
    expect(settings).toContain("{ value: 'system', labelKey: 'settingsThemeSystem', icon: <Smartphone");
    expect(settings).not.toContain('font-black">A</span>');
  });

  it('renders bounded avatar markers and social face clusters from thumbnails', () => {
    const users = Array.from({ length: 500 }, (_, index) => ({
      id: String(index), name: `Kişi ${index}`, displayLat: 39, displayLng: 35,
      photoThumbnailUrl: `/thumb-${index}.webp`, photo: `/full-${index}.jpg`,
    }));
    const started = performance.now();
    const html = buildSocialClusterHtml(users as any, users.length);
    const elapsedMs = performance.now() - started;
    expect(html.match(/<img/g)).toHaveLength(3);
    expect(html).toContain('/thumb-0.webp');
    expect(html).not.toContain('/full-0.jpg');
    expect(html).toContain('500');
    expect(elapsedMs).toBeLessThan(50);
    expect(markerSizeForZoom(3)).toBe(40);
    expect(markerSizeForZoom(20)).toBe(48);
    expect(markerSizeForZoom(20, true)).toBe(58);

    const map = mobileSource('features/map/SocialMapScreen.tsx');
    // Still the same 150-marker ceiling this test exists to pin; the third argument is the
    // saved gender filter, which only participates in the query key (it is read server-side).
    expect(map).toContain('useDiscoveryMapQuery(bbox, 150, genderFilter)');
    expect(map).toContain('if (map2.getZoom() < MAX_ZOOM) {');
    expect(map).toContain('getProfileFramePreviewAsset(frame)');
  });

  it.each([100, 250, 500])('builds %i lightweight MapLibre avatar marker HTML within budget', (count) => {
    const started = performance.now();
    for (let index = 0; index < count; index += 1) {
      avatarMarkerHtml({
        id: String(index), name: `Kişi ${index}`, displayLat: 39, displayLng: 35,
        photoThumbnailUrl: `/thumb-${index}.webp`,
      }, false, [], 13);
    }
    const elapsedMs = performance.now() - started;
    console.info(`[MAP PERF] ${count} avatar icons: ${elapsedMs.toFixed(2)}ms`);
    expect(elapsedMs).toBeLessThan(500);
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
    expect(server).toContain('ORDER BY is_main DESC, display_order ASC, created_at ASC');
    expect(server).toContain("await client.query('BEGIN')");
    expect(server).toContain("await client.query('ROLLBACK')");
    expect(server).toContain('FROM unnest($2::text[]) WITH ORDINALITY');
    expect(server).toContain('photos.map((url) => buildPublicImageVariants(url))');
    expect(authStore).toContain('requestId === latestFetchMeRequest');
    expect(authStore).toContain('versionAtStart === userStateVersion');
  });
});
