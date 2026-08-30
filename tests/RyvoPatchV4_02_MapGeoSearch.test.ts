import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const source = (relativePath: string) => fs.readFileSync(path.join(root, 'src', relativePath), 'utf8');

describe('RYVO PATCH V4 / PROMPT 02: map/geo/search', () => {
  // -----------------------------------------------------------------------------------------
  // A) RYVO PATCH V5 01: OpenMapTiles vector tiles + MapLibre GL JS, replacing the Leaflet
  //    raster setup from V4 -- no paid-key/demo provider baked in, capped zoom, real light/dark
  //    vector styles (not a CSS filter hack over raster tiles).
  // -----------------------------------------------------------------------------------------
  it('A -- the tile source is OpenFreeMap by product decision, env-overridable, no baked-in paid-provider key', () => {
    const screen = source('features/map/SocialMapScreen.tsx');
    const config = source('features/map/ryvoMapConfig.ts');
    expect(screen).toContain("from './ryvoMapConfig'");
    expect(screen).toContain('OPENMAPTILES_TILEJSON_URL');
    // RYVO PATCH V5 02: production points directly at OpenFreeMap (free, keyless, commercial use
    // permitted, no self-hosted TileServer GL -- the VPS doesn't have the disk for a global
    // planet.mbtiles). Still fully overridable via env for a future self-hosted/paid provider.
    expect(config).toContain("const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';");
    expect(config).toContain('VITE_OPENMAPTILES_TILEJSON_URL');
    expect(config).toContain('envTileJsonUrl || OPENFREEMAP_TILEJSON_URL');
    // No paid-provider access token/key string anywhere near the tile config.
    expect(config).not.toMatch(/access_token|api_key|apikey/i);
    expect(config).not.toMatch(/MAPTILER|MAPBOX/i);
  });

  it('A -- the map zoom ceiling is capped and consistent, shared by the map instance and the clustering index', () => {
    const screen = source('features/map/SocialMapScreen.tsx');
    // Lowered from 17 to 15 during Prompt 04 live emulator review: 17 still let a curious user
    // zoom into full street-level POI/label density, which the user flagged as too busy. Now a
    // named constant instead of a repeated literal, and also caps supercluster's own maxZoom so
    // expansion-zoom clicks can never overshoot the map's own ceiling.
    expect(screen).toMatch(/const MIN_ZOOM = 3;/);
    expect(screen).toMatch(/const MAX_ZOOM = 15;/);
    expect(screen).toMatch(/minZoom: MIN_ZOOM,\s*\n\s*maxZoom: MAX_ZOOM,/);
    expect(screen).toMatch(/maxZoom: MAX_ZOOM,\s*\r?\n\s*\}\);\s*\r?\n\s*index\.load\(points\);/);
  });

  it('A -- light and dark map both get a real vector style treatment, not a CSS filter over raster tiles', () => {
    const screen = source('features/map/SocialMapScreen.tsx');
    expect(screen).toContain("buildRyvoMapStyle(isDark ? 'dark' : 'light',");
    expect(screen).toContain('map.setStyle(');

    const style = source('features/map/ryvoMapStyle.ts');
    expect(style).toContain("light: {");
    expect(style).toContain("dark: {");
    // Genuinely different palettes per theme, not the same tokens reused under two names.
    expect(style).toContain("background: '#f7f7f4'");
    expect(style).toContain("background: '#15151c'");
    // The simplification rules called for in the migration: no leftover Leaflet raster tile CSS.
    const css = fs.readFileSync(path.join(root, 'src', 'features', 'map', 'SocialMapScreen.css'), 'utf8');
    expect(css).not.toContain('leaflet-tile-pane');
  });

  it('A -- the custom style simplifies OpenMapTiles layers per the migration spec (hide mountain_peak/housenumber, mute poi/building, major-road-only labels)', () => {
    const style = source('features/map/ryvoMapStyle.ts');
    expect(style).not.toContain("'source-layer': 'mountain_peak'");
    expect(style).not.toContain("'source-layer': 'housenumber'");
    expect(style).toContain("'source-layer': 'poi'");
    expect(style).toMatch(/id:\s*'poi'[\s\S]{0,120}minzoom:\s*16/);
    expect(style).toMatch(/id:\s*'building'[\s\S]{0,160}minzoom:\s*14/);
    expect(style).toContain('MAJOR_ROAD_CLASSES');
    // No contour/terrain/hillshade layer or raster-dem source actually defined anywhere in the
    // style (checking layer `type`/source `type` values, not prose -- this file's own comments
    // legitimately mention "hillshade"/"terrain" when explaining why none is added).
    expect(style).not.toMatch(/type:\s*'hillshade'/);
    expect(style).not.toMatch(/type:\s*'raster-dem'/);
    expect(style).not.toContain("'source-layer': 'contour'");
  });

  // -----------------------------------------------------------------------------------------
  // B) Map visibility realtime primary, 15s poll fallback, no auto-GPS.
  // -----------------------------------------------------------------------------------------
  it('B -- SocialMapScreen subscribes to the map:viewers realtime channel on mount and unsubscribes on unmount', () => {
    const screen = source('features/map/SocialMapScreen.tsx');
    expect(screen).toContain("socketService.emit('map:subscribe')");
    expect(screen).toContain("socketService.emit('map:unsubscribe')");
    expect(screen).toContain("socketService.on('map:visibility-changed'");
  });

  it('B -- both visible:true and visible:false trigger an invalidate/refetch, never trusting the event for coordinates', () => {
    const screen = source('features/map/SocialMapScreen.tsx');
    const handlerStart = screen.indexOf("socketService.on('map:visibility-changed'");
    // Bounded by the enclosing effect's own dependency array, not a bare "});" -- the
    // invalidateQueries(...) call itself ends in "});", which would truncate the slice early.
    const handlerEnd = screen.indexOf('}, [queryClient]);', handlerStart);
    const handlerBody = screen.slice(handlerStart, handlerEnd);
    expect(handlerBody).toContain("queryClient.invalidateQueries({ queryKey: ['discovery', 'map'] })");
    // No branch-specific coordinate handling -- the payload only ever has {userId, visible}.
    expect(handlerBody).not.toMatch(/latitude|longitude|\.lat\b|\.lng\b/);
  });

  it('B -- the 15s poll fallback is still present alongside the realtime primary path', () => {
    const queries = source('hooks/useQueries.ts');
    const fnStart = queries.indexOf('export function useDiscoveryMapQuery');
    const fnEnd = queries.indexOf('\n}', fnStart);
    const fnBody = queries.slice(fnStart, fnEnd);
    expect(fnBody).toContain('refetchInterval: 15 * 1000');
    expect(fnBody).toContain('placeholderData: keepPreviousData');
  });

  it('B -- no automatic GPS acquisition on map mount, resume, language change, or socket reconnect', () => {
    const screen = source('features/map/SocialMapScreen.tsx');
    // acquireLocalLocation must only be reachable from explicit user actions (checkInToMap /
    // handleRecenter / retry buttons), never from a mount-only effect with no user-gesture guard.
    const acquireCallSites = [...screen.matchAll(/acquireLocalLocation\(/g)].length;
    // 1 definition + calls from checkInToMap, handleRecenter, and error-pill retries -- none of
    // which may live inside the map:subscribe/checkedIn-learning mount effects.
    expect(acquireCallSites).toBeGreaterThan(1);
    const mountEffects = screen.slice(screen.indexOf('checkedIn === null'), screen.indexOf('const openPin'));
    expect(mountEffects).not.toContain('acquireLocalLocation(');

    const socketEffectStart = screen.indexOf("socketService.emit('map:subscribe')");
    const socketEffectEnd = screen.indexOf('}, [queryClient]);', socketEffectStart);
    const socketEffectBody = screen.slice(socketEffectStart, socketEffectEnd);
    expect(socketEffectBody).not.toContain('acquireLocalLocation');
    expect(socketEffectBody).not.toContain('getCurrentPosition');
  });

  it('B -- DiscoverScreen resume listener never touches GPS on a normal (non-retry) app resume', () => {
    const screen = source('features/discovery/DiscoverScreen.tsx');
    expect(screen).toContain('retryLocationOnResumeRef');
    expect(screen).toMatch(/Resuming the app must NEVER touch GPS on its own/);
  });

  // -----------------------------------------------------------------------------------------
  // C) RYVO PATCH V5 01: Passport and Map now share one city-search service instead of each
  //    carrying their own copy-pasted fetch + DTO mapping -- field mapping, no GPS/visibility
  //    side effects, loading/error states present.
  // -----------------------------------------------------------------------------------------
  it('C -- the shared cityService reads the real server DTO fields (city/latitude/longitude/country)', () => {
    const service = source('services/geo/cityService.ts');
    expect(service).toContain("entry?.city || entry?.name");
    expect(service).toContain('entry?.latitude');
    expect(service).toContain('entry?.longitude');
    expect(service).toContain('entry?.country');
  });

  it('C -- selecting a Passport city never requests GPS and never touches map visibility', () => {
    const screen = source('features/passport/PassportScreen.tsx');
    expect(screen).not.toMatch(/getCurrentPosition|acquireLocalLocation|nativeLocation/);
    expect(screen).not.toMatch(/mapVisible|map_visible/);
    expect(screen).toContain("apiClient.post('/api/user/passport'");
  });

  it('C -- both Passport and Map search have loading and error states, not a silent empty result on failure', () => {
    const passport = source('features/passport/PassportScreen.tsx');
    const map = source('features/map/SocialMapScreen.tsx');
    expect(passport).toContain('isSearching');
    expect(passport).toContain('searchError');
    expect(map).toContain('isSearchingCities');
    expect(map).toContain('citySearchError');
  });

  it('C -- SocialMapScreen\'s own city search uses the shared service, no duplicated DTO logic; selecting a result never touches visibility or GPS', () => {
    const screen = source('features/map/SocialMapScreen.tsx');
    expect(screen).toContain("import { searchCities, type GeoCityResult } from '../../services/geo/cityService';");
    expect(screen).not.toContain("apiClient.get(`/api/geo/search-cities");
    // Selecting a search result must only pan the map (flyTo), never toggle visibility or fetch GPS.
    const selectCityStart = screen.indexOf('const selectCity');
    const selectCityEnd = screen.indexOf('};', selectCityStart);
    const selectCityBody = screen.slice(selectCityStart, selectCityEnd);
    expect(selectCityBody).not.toMatch(/mapVisible|getCurrentPosition|acquireLocalLocation/);
    expect(selectCityBody).toContain('flyTo');
  });
});
