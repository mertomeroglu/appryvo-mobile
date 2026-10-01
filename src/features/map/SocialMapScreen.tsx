import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapLibreMap, Marker as MapLibreMarker, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre-gl resolves its tile-parsing Web Worker at runtime via a `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`-style template string built from a variable, not a literal -- Vite's static
// worker-bundling analysis can't trace that, so the file was silently never emitted into the build
// and every map render came up as a blank canvas (confirmed on-device: Capacitor's local asset
// server logged "Unable to open asset URL: https://localhost/assets/maplibre-gl-worker.mjs"). Fixed
// by copying the worker file into public/ (scripts/copy-maplibre-worker-assets.mjs, runs before
// every dev/build) and pointing setWorkerUrl() at that fixed, unhashed path -- NOT a Vite `?url`
// import: the worker has its own internal `from "./maplibre-gl-shared.mjs"` sibling import that is
// never rewritten (it's copied verbatim, not parsed by Vite), so hashing just the worker's own
// filename via `?url` would leave that unhashed sibling reference dangling. Copying the matched
// pair into public/ together, unhashed, keeps their relative reference to each other intact.
setWorkerUrl('/maplibre-gl-worker.mjs');
import './SocialMapScreen.css';
import { Search, Compass, ShieldCheck, LocateFixed, MoreHorizontal, ChevronRight, MessagesSquare } from 'lucide-react';
import type { MapBbox } from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { nativeLocation } from '../../native/location';
import { nativeHaptics } from '../../native/haptics';
import { nativeAppSettings } from '../../native/nativeSettings';
import { searchCities, type GeoCityResult } from '../../services/geo/cityService';
import { buildRyvoMapStyle, type ResolvedTileSource } from './ryvoMapStyle';
import {
  ROOM_CLUSTER_LAYER_ID,
  ROOM_SOURCE_ID,
  ROOM_UNCLUSTERED_LAYER_ID,
  buildRoomFeatureCollection,
  installRoomMapLayers,
  type RoomFeatureCollection,
} from './roomMapLayers';
import { OPENMAPTILES_SPRITE_URL, OPENMAPTILES_GLYPHS_URL, OPENMAPTILES_TILEJSON_URL, isRyvoMapConfigured } from './ryvoMapConfig';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { RoomAvatar } from '../rooms/RoomAvatar';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { APP_LOCALE_LABELS, useAppTranslation, type AppLocale } from '../../i18n/appLocale';
import { communityRoomsService, type CommunityRoom, type RoomCategory } from '../../services/rooms/communityRoomsService';
import { roomsText } from '../rooms/roomsLocale';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { navigateMapToGeography } from './geoNavigation';
import { useSocialText } from '../social/socialLocale';

// The map is a map of community rooms. It never shows individual people: there are no user
// pins, no people clusters, no gender filter and no "appear on the map" check-in, and this screen
// never sends the device's location anywhere. The device fix is used only locally, to centre the
// map and draw the "you are here" dot.

const ROOM_CATEGORY_KEY: Record<RoomCategory, Parameters<typeof roomsText>[1]> = {
  GENERAL: 'categoryGeneral', TRAVEL: 'categoryTravel', FOOD_CAFE: 'categoryFoodCafe', MUSIC: 'categoryMusic',
  MOVIES: 'categoryMovies', GAMING: 'categoryGaming', TECHNOLOGY: 'categoryTechnology', LOCAL: 'categoryLocal',
  LANGUAGE: 'categoryLanguage', OTHER: 'categoryOther',
};

const ROOM_FILTERS = ['ALL', 'OFFICIAL', 'TRAVEL', 'LOCAL', 'LANGUAGE'] as const;
type RoomFilter = (typeof ROOM_FILTERS)[number];

// A room's pin sits on its city's centroid, so city scale is the useful range. MIN_ZOOM 2 lets
// the whole world fit on screen so rooms in any country stay reachable.
const MIN_ZOOM = 2;
const MAX_ZOOM = 15;

// MapLibre reports viewport bounds as raw floats, so every pan produced a brand-new request for a
// viewport a few metres from the last one. Snapping to ~110 m collapses small drags onto one box.
// The snap is deliberately *outward* (floor the south/west edge, ceil the north/east) so the box
// we ask for always contains everything actually on screen.
const BBOX_SNAP_PER_DEGREE = 1000;
function quantizeBbox(bounds: MapBbox): MapBbox {
  return {
    south: Math.floor(bounds.south * BBOX_SNAP_PER_DEGREE) / BBOX_SNAP_PER_DEGREE,
    north: Math.ceil(bounds.north * BBOX_SNAP_PER_DEGREE) / BBOX_SNAP_PER_DEGREE,
    west: Math.floor(bounds.west * BBOX_SNAP_PER_DEGREE) / BBOX_SNAP_PER_DEGREE,
    east: Math.ceil(bounds.east * BBOX_SNAP_PER_DEGREE) / BBOX_SNAP_PER_DEGREE,
  };
}
// [lng, lat] -- MapLibre's coordinate order. Türkiye, shown until the user recentres.
const DEFAULT_CENTER: [number, number] = [35.2, 39.0];
const DEFAULT_ZOOM = 5.2;
const LOCATE_ZOOM = 13;
const MOVE_DEBOUNCE_MS = 350;
const FLY_DURATION_MS = 1100;
const CLUSTER_EXPANSION_DURATION_MS = 400;
// Enough to identify the cities behind any realistic room cluster without walking a huge one.
const CLUSTER_LEAF_PROBE_LIMIT = 200;

function htmlToElement(html: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const el = template.content.firstElementChild as HTMLElement | null;
  if (!el) throw new Error('htmlToElement: no root element produced');
  return el;
}

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(el.classList.contains('dark')));
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function selfLocationHtml(): string {
  return `
    <div class="relative flex items-center justify-center w-[30px] h-[30px]" style="z-index:500;pointer-events:none">
      <div class="absolute w-[30px] h-[30px] rounded-full bg-[#536DFE]/25 animate-ping"></div>
      <div class="relative w-[14px] h-[14px] rounded-full bg-[#536DFE]" style="box-shadow:0 0 0 3px rgba(83,109,254,0.35),0 2px 6px rgba(0,0,0,0.35);border:2px solid white"></div>
    </div>
  `;
}

export const SocialMapScreen: React.FC = () => {
  const { t, locale } = useAppTranslation();
  const { st } = useSocialText();
  const navigate = useNavigate();
  // The map is initialised once, so its handlers read navigate through a ref rather than
  // closing over the first render's binding.
  const navigateRef = useRef(navigate);
  const isDark = useIsDarkMode();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selfMarkerRef = useRef<MapLibreMarker | null>(null);
  const roomDataRef = useRef<RoomFeatureCollection>(buildRoomFeatureCollection([]));
  const roomsByIdRef = useRef<Map<string, CommunityRoom>>(new Map());
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Set once the init effect's own fetch() resolves the TileJSON -- the theme-swap effect reuses
  // it instead of re-fetching.
  const tileSourceRef = useRef<ResolvedTileSource | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'pending' | 'granted' | 'denied' | 'error'>('idle');
  const [bbox, setBbox] = useState<MapBbox | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityResults, setCityResults] = useState<GeoCityResult[]>([]);
  const [isSearchingCities, setIsSearchingCities] = useState(false);
  const [citySearchError, setCitySearchError] = useState(false);
  const [rooms, setRooms] = useState<CommunityRoom[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [roomFilter, setRoomFilter] = useState<RoomFilter>('ALL');
  const [selectedRoom, setSelectedRoom] = useState<CommunityRoom | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);

  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  useEffect(() => {
    if (!bbox) return;
    let cancelled = false;
    setRoomsLoading(true);
    const params: Record<string, string | number | undefined> = { ...bbox };
    if (roomFilter === 'OFFICIAL') params.official = 'true';
    else if (roomFilter !== 'ALL') params.category = roomFilter;
    communityRoomsService.list(params)
      .then((items) => { if (!cancelled) setRooms(items); })
      .catch(() => { if (!cancelled) setRooms([]); })
      .finally(() => { if (!cancelled) { setRoomsLoading(false); setRoomsLoaded(true); } });
    return () => { cancelled = true; };
  }, [bbox, roomFilter]);

  // Initialize the map exactly once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    if (!isRyvoMapConfigured()) {
      // Production build with VITE_OPENMAPTILES_TILEJSON_URL never set -- fail loudly in the
      // console; the "map unavailable" state in the JSX covers the user-facing side.
      console.error('[SocialMapScreen] OPENMAPTILES_TILEJSON_URL is not configured; map cannot initialize.');
      return;
    }

    let cancelled = false;
    let map: MapLibreMap | null = null;
    let raf = 0;

    // The vector source is given a fully-resolved `tiles` array instead of MapLibre's own
    // `url: tileJsonUrl` auto-resolution -- confirmed on-device (RYVO PATCH V5 03) that MapLibre's
    // internal TileJSON fetch silently never settles in the Capacitor/Android WebView, while a
    // plain fetch() to the same URL reliably succeeds. MapLibre's own per-tile fetching still
    // handles every .pbf request from here on.
    fetch(OPENMAPTILES_TILEJSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`TileJSON HTTP ${res.status}`);
        return res.json();
      })
      .then((tileJson: any) => {
        if (cancelled || !containerRef.current) return;
        const tiles: string[] = Array.isArray(tileJson?.tiles) ? tileJson.tiles : [];
        if (tiles.length === 0) throw new Error('TileJSON response has no tiles[] entries');

        const tileSource: ResolvedTileSource = {
          tiles,
          minzoom: typeof tileJson.minzoom === 'number' ? tileJson.minzoom : undefined,
          maxzoom: typeof tileJson.maxzoom === 'number' ? tileJson.maxzoom : undefined,
          bounds: Array.isArray(tileJson.bounds) ? tileJson.bounds : undefined,
        };
        tileSourceRef.current = tileSource;

        map = new MapLibreMap({
          container: containerRef.current,
          style: buildRyvoMapStyle(isDark ? 'dark' : 'light', {
            tileSource,
            spriteUrl: OPENMAPTILES_SPRITE_URL,
            glyphsUrl: OPENMAPTILES_GLYPHS_URL,
          }),
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          // Bounds how many off-screen vector tiles MapLibre keeps decoded in memory (Android
          // memory conservation).
          maxTileCacheSize: 50,
        });
        map.addControl(
          new AttributionControl({
            compact: true,
            // Exact format OpenFreeMap's operator requests (openfreemap.org).
            customAttribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
          })
        );
        mapRef.current = map;
        map.on('error', (e) => console.error(`[SocialMapScreen] MapLibre error: ${e?.error?.message || e}`));

        const restoreRoomLayers = () => installRoomMapLayers(map!, roomDataRef.current, true);
        map.on('style.load', restoreRoomLayers);
        map.on('click', ROOM_CLUSTER_LAYER_ID, async (event) => {
          const feature = map!.queryRenderedFeatures(event.point, { layers: [ROOM_CLUSTER_LAYER_ID] })[0];
          const clusterId = Number(feature?.properties?.cluster_id);
          const coordinates = (feature?.geometry as { coordinates?: [number, number] })?.coordinates;
          const source = map!.getSource(ROOM_SOURCE_ID) as import('maplibre-gl').GeoJSONSource | undefined;
          if (!source || !Number.isFinite(clusterId) || !coordinates) return;
          nativeHaptics.impact();
          // Room coordinates are city centroids, so a cluster of rooms from a single city can
          // never be split by zooming. Send those straight to the city's room list.
          const leaves = await source.getClusterLeaves(clusterId, CLUSTER_LEAF_PROBE_LIMIT, 0);
          const clustered = leaves
            .map((leaf) => roomsByIdRef.current.get(String((leaf.properties as { roomId?: string } | undefined)?.roomId || '')))
            .filter((room): room is CommunityRoom => Boolean(room));
          const cityIds = new Set(clustered.map((room) => room.cityId));
          if (clustered.length > 1 && cityIds.size === 1) {
            navigateRef.current(`/rooms/city/${clustered[0].cityId}`);
            return;
          }
          const expansionZoom = await source.getClusterExpansionZoom(clusterId);
          map!.easeTo({ center: coordinates, zoom: Math.min(expansionZoom, MAX_ZOOM), duration: CLUSTER_EXPANSION_DURATION_MS });
        });
        map.on('click', ROOM_UNCLUSTERED_LAYER_ID, (event) => {
          const feature = map!.queryRenderedFeatures(event.point, { layers: [ROOM_UNCLUSTERED_LAYER_ID] })[0];
          const room = roomsByIdRef.current.get(String(feature?.properties?.roomId || ''));
          if (!room) return;
          nativeHaptics.impact();
          setSelectedRoom(room);
        });

        const updateBbox = () => {
          const b = map!.getBounds();
          const snapped = quantizeBbox({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
          // Same object identity for an unchanged box, so a pan inside the current snap cell
          // doesn't refetch.
          setBbox((current) => (
            current
              && current.north === snapped.north && current.south === snapped.south
              && current.east === snapped.east && current.west === snapped.west
              ? current
              : snapped
          ));
        };
        map.on('moveend', () => {
          if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
          moveTimerRef.current = setTimeout(updateBbox, MOVE_DEBOUNCE_MS);
        });

        // Guards against measuring a not-yet-laid-out container on route mount. The
        // ResizeObserver is a defensive backstop for later container resizes (keyboard,
        // orientation); see SocialMapScreen.css for the actual blank-map root cause.
        raf = requestAnimationFrame(() => map?.resize());
        const resizeObserver = new ResizeObserver(() => map?.resize());
        resizeObserver.observe(container);
        resizeObserverRef.current = resizeObserver;

        map.once('load', () => {
          updateBbox();
          restoreRoomLayers();
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`[SocialMapScreen] Failed to resolve OpenMapTiles TileJSON: ${err?.message || err}`);
      });

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (!map) return;
      cancelAnimationFrame(raf);
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      // Detach image sources before destroying the map. Chromium otherwise keeps decoded image
      // surfaces alive until a later major GC (seen as Graphics PSS growth on the Galaxy A50).
      container?.querySelectorAll('img').forEach((image) => {
        image.removeAttribute('src');
        image.removeAttribute('srcset');
      });
      selfMarkerRef.current?.remove();
      map.remove();
      container?.replaceChildren();
      mapRef.current = null;
      selfMarkerRef.current = null;
      tileSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the vector style with the app theme. setStyle keeps the camera; the room layers are
  // re-installed by the 'style.load' handler above.
  useEffect(() => {
    const map = mapRef.current;
    const tileSource = tileSourceRef.current;
    if (!map || !tileSource) return;
    map.setStyle(
      buildRyvoMapStyle(isDark ? 'dark' : 'light', {
        tileSource,
        spriteUrl: OPENMAPTILES_SPRITE_URL,
        glyphsUrl: OPENMAPTILES_GLYPHS_URL,
      })
    );
  }, [isDark]);

  // Purely local: reads the device's own GPS fix to centre the map and draw the "you are here"
  // dot. Never sent to the backend. Runs only when the user taps recentre, so opening the map
  // never fires an OS location prompt on its own.
  const acquireLocalLocation = useCallback((recenter: boolean): Promise<void> => {
    setLocationStatus((s) => (s === 'granted' ? s : 'pending'));
    return nativeLocation
      .getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 })
      .then((pos: any) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setLocationStatus('granted');
        if (recenter) mapRef.current?.flyTo({ center: [longitude, latitude], zoom: LOCATE_ZOOM, duration: FLY_DURATION_MS });
      })
      .catch((err: any) => {
        const isDenied = err?.code === 'PERMISSION_DENIED' || err?.code === 1;
        setLocationStatus(isDenied ? 'denied' : 'error');
        throw err;
      });
  }, []);

  // Self location marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;
    if (selfMarkerRef.current) {
      selfMarkerRef.current.setLngLat([coords.lng, coords.lat]);
    } else {
      const el = htmlToElement(selfLocationHtml());
      selfMarkerRef.current = new MapLibreMarker({ element: el }).setLngLat([coords.lng, coords.lat]).addTo(map);
    }
  }, [coords]);

  const renderRoomMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded())) return;
    installRoomMapLayers(map, roomDataRef.current, true);
  }, []);

  // Rebuild the room feature collection whenever the visible room set or selection changes.
  useEffect(() => {
    roomsByIdRef.current = new Map(rooms.map((room) => [room.id, room]));
    roomDataRef.current = buildRoomFeatureCollection(rooms, selectedRoom?.id);
    renderRoomMarkers();
  }, [rooms, selectedRoom?.id, renderRoomMarkers]);

  const joinSelectedRoom = async () => {
    if (!selectedRoom) return;
    setJoiningRoom(true);
    try {
      const joined = await communityRoomsService.join(selectedRoom.id);
      setSelectedRoom(null);
      navigate(`/rooms/${joined.id}`);
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleRecenter = async () => {
    nativeHaptics.impact();
    try {
      await acquireLocalLocation(true);
    } catch (err: any) {
      if ((err?.code === 'PERMISSION_DENIED' || err?.code === 1) && err?.isPermanent) {
        nativeAppSettings.openLocationServices().catch(() => {});
      }
    }
  };

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearchingCities(true);
    setCitySearchError(false);
    try {
      const results = await searchCities(searchQuery);
      setCityResults(results);
    } catch {
      setCityResults([]);
      setCitySearchError(true);
    } finally {
      setIsSearchingCities(false);
    }
  };

  const selectCity = (city: GeoCityResult) => {
    setSearchQuery(city.city || city.name || '');
    setCityResults([]);
    setCitySearchError(false);
    navigateMapToGeography(mapRef.current, city);
  };

  const isEmptyViewport = roomsLoaded && !roomsLoading && rooms.length === 0;

  return (
    <div className="relative h-full w-full bg-app text-app overflow-hidden select-none">
      <div ref={containerRef} className={`ryvo-map-root absolute inset-0 z-0 ${isDark ? 'ryvo-map-dark' : 'ryvo-map-light'}`} />

      {!isRyvoMapConfigured() && (
        <div className="absolute inset-0 z-content flex items-center justify-center p-8 text-center bg-app">
          <p className="text-body font-semibold text-app-muted">{t('mapUnavailableMessage')}</p>
        </div>
      )}

      {/* Floating search bar */}
      <div className="absolute top-0 inset-x-0 z-sticky pt-safe px-4 pointer-events-none">
        <div className="flex items-center gap-2 w-full max-w-md mx-auto mt-3">
          <div className="pointer-events-auto shrink-0 w-11 h-11 rounded-full bg-surface-90 backdrop-blur-xl border border-app shadow-elevated flex items-center justify-center">
            <AppLogo variant="icon" size="sm" />
          </div>
          <form onSubmit={handleCitySearch} className="relative flex-1 pointer-events-auto">
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-3.5 z-10 w-5 h-5 text-app-muted" />
            <input
              type="text"
              placeholder={t('mapSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-90 backdrop-blur-xl border border-app rounded-full pl-12 pr-4 py-3 text-body font-semibold text-app placeholder:text-app-muted shadow-elevated focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
            />
          </form>
        </div>

        <div className="pointer-events-auto mt-2 mx-auto flex w-fit max-w-md items-center gap-1.5 rounded-full border border-app bg-surface-95 px-3 py-1.5 text-[11px] font-bold text-app-muted shadow-soft backdrop-blur-xl">
          <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-[#25D9D0]" aria-hidden="true" />
          <span>{st('mapRoomsHint')}</span>
        </div>

        <div className="pointer-events-auto mt-2 flex max-w-md gap-1.5 overflow-x-auto no-scrollbar mx-auto px-0.5">
          {ROOM_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setRoomFilter(f)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition-colors ${roomFilter === f ? 'border-transparent bg-brand-gradient text-white' : 'border-app bg-surface-95 text-app-muted'}`}
            >
              {f === 'ALL' ? roomsText(locale, 'filterAll') : f === 'OFFICIAL' ? roomsText(locale, 'filterOfficial') : roomsText(locale, ROOM_CATEGORY_KEY[f])}
            </button>
          ))}
        </div>

        {isSearchingCities && (
          <div className="pointer-events-auto mt-2 w-full max-w-md mx-auto bg-surface border border-app rounded-2xl px-4 py-3 shadow-floating text-caption font-semibold text-app-muted">
            {t('mapSearchingLabel')}
          </div>
        )}
        {!isSearchingCities && citySearchError && (
          <div className="pointer-events-auto mt-2 w-full max-w-md mx-auto bg-surface border border-app rounded-2xl px-4 py-3 shadow-floating text-caption font-semibold text-app-muted">
            {t('mapSearchErrorLabel')}
          </div>
        )}
        {!isSearchingCities && !citySearchError && cityResults.length > 0 && (
          <div className="pointer-events-auto mt-2 w-full max-w-md mx-auto bg-surface border border-app rounded-2xl overflow-hidden shadow-floating">
            {cityResults.map((city, idx) => (
              <button
                key={idx}
                onPointerDown={(event) => { event.preventDefault(); selectCity(city); }}
                className="relative z-10 w-full touch-manipulation px-4 py-3 text-left border-b border-app last:border-b-0 text-body font-medium text-app hover:bg-surface-elevated flex items-center gap-2"
              >
                <span>{city.city}</span>
                {city.type === 'city' && <span className="text-caption text-app-muted">{city.country}</span>}
              </button>
            ))}
          </div>
        )}
        {/* Status pills sit in the header's own flow -- never a full-screen blocker. */}
        <div className="mt-2 flex justify-center px-2 pointer-events-none">
          {roomsLoading && (
            <div className="rounded-full border border-app bg-surface-95 px-4 py-2 text-caption font-bold text-app-muted shadow-soft backdrop-blur-md">•••</div>
          )}
          {!roomsLoading && isEmptyViewport && (
            <div className="px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md">
              {st('mapNoRoomsHere')}
            </div>
          )}
          {locationStatus === 'denied' && (
            <div className="pointer-events-auto px-4 py-2.5 rounded-2xl bg-surface-95 border border-app text-caption font-semibold text-app shadow-elevated backdrop-blur-md flex items-center gap-3">
              <span>{t('mapLocationDeniedMessage')}</span>
              <button
                onClick={() => {
                  acquireLocalLocation(true).catch((err: any) => {
                    if (err?.code === 'PERMISSION_DENIED' || err?.code === 1) {
                      nativeAppSettings.openLocationServices().catch(() => {});
                    }
                  });
                }}
                className="shrink-0 text-pink-500 font-bold"
              >
                {t('callOpenSettingsAction') || t('retryButton')}
              </button>
            </div>
          )}
          {locationStatus === 'error' && (
            <div className="pointer-events-auto px-4 py-2.5 rounded-2xl bg-surface-95 border border-app text-caption font-semibold text-app shadow-elevated backdrop-blur-md flex items-center gap-3">
              <span>{t('mapLocationErrorMessage')}</span>
              <button onClick={() => acquireLocalLocation(true).catch(() => {})} className="shrink-0 text-pink-500 font-bold">
                {t('retryButton')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-28 right-4 z-sticky flex flex-col items-end gap-2">
        <button onClick={() => navigate('/rooms/create')} className="h-12 rounded-full bg-brand-gradient px-4 text-caption font-extrabold text-white shadow-elevated active:scale-95">
          + {roomsText(locale, 'createRoom')}
        </button>
        <IconButton aria-label={t('mapRecenterAriaLabel')} variant="surface" size="lg" onClick={handleRecenter}>
          {locationStatus === 'granted' ? (
            <Compass className="w-6 h-6 text-[#25D9D0]" />
          ) : (
            <LocateFixed className="w-6 h-6 text-[#25D9D0]" />
          )}
        </IconButton>
      </div>

      <BottomSheet isOpen={!!selectedRoom} onClose={() => setSelectedRoom(null)}>
        {selectedRoom && (
          <div className="space-y-4 px-5 pb-6">
            <div className="flex items-start gap-3">
              <RoomAvatar coverUrl={selectedRoom.coverUrl} official={selectedRoom.isOfficial} className="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-heading text-app">{selectedRoom.title}</h2>
                  {selectedRoom.isOfficial && <ShieldCheck className="h-4 w-4 text-[#25D9D0]" />}
                </div>
                <p className="text-caption font-semibold text-app-muted">
                  {selectedRoom.city} · {APP_LOCALE_LABELS[selectedRoom.language as AppLocale] || selectedRoom.language} · {roomsText(locale, ROOM_CATEGORY_KEY[selectedRoom.category] || 'categoryGeneral')}
                </p>
              </div>
              <button onClick={() => navigate(`/rooms/${selectedRoom.id}/report`)} aria-label={roomsText(locale, 'report')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
            {selectedRoom.isDemo && <span className="inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-caption font-extrabold text-amber-500">{roomsText(locale, 'officialDemo')}</span>}
            <p className="text-body leading-relaxed text-app">{selectedRoom.topic}</p>
            <div className="flex items-center justify-between">
              <div className="flex -space-x-3">
                {selectedRoom.participants.slice(0, 6).map((p) => (
                  <Avatar key={p.id} src={normalizeMediaUrl(p.photoUrl || undefined)} name={p.name} size="sm" className="rounded-full border-2 border-surface" />
                ))}
              </div>
              <span className="text-caption font-bold text-app-muted">{selectedRoom.activeParticipantCount}/{selectedRoom.maxParticipants} {roomsText(locale, 'participants')}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <AppButton onClick={joinSelectedRoom} loading={joiningRoom} disabled={selectedRoom.activeParticipantCount >= selectedRoom.maxParticipants} fullWidth>
                {selectedRoom.activeParticipantCount >= selectedRoom.maxParticipants ? roomsText(locale, 'roomFull') : roomsText(locale, 'joinRoom')}
              </AppButton>
              <AppButton variant="secondary" onClick={() => navigate(`/rooms/city/${selectedRoom.cityId}`)} aria-label={roomsText(locale, 'cityRooms')}>
                <ChevronRight className="h-5 w-5" />
              </AppButton>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
};
