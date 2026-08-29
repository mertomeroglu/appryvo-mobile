import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Map as MapLibreMap, Marker as MapLibreMarker, AttributionControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Supercluster, { type PointFeature } from 'supercluster';
import './SocialMapScreen.css';
import { Search, Compass, Heart, ShieldCheck, LocateFixed, X, Sparkles, Crown, MapPin, EyeOff } from 'lucide-react';
import {
  useDiscoveryMapQuery,
  useDiscoveryUserQuery,
  useFramesQuery,
  useLikeMutation,
  useMeQuery,
  usePassMutation,
  useUpdateProfileMutation,
  type MapBbox,
} from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { apiClient } from '../../services/api/apiClient';
import { nativeLocation } from '../../native/location';
import { nativeHaptics } from '../../native/haptics';
import { socketService } from '../../services/socket/socketService';
import { searchCities, type GeoCityResult } from '../../services/geo/cityService';
import { buildRyvoMapStyle } from './ryvoMapStyle';
import { OPENMAPTILES_SPRITE_URL, OPENMAPTILES_GLYPHS_URL, OPENMAPTILES_TILEJSON_URL, isRyvoMapConfigured } from './ryvoMapConfig';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { IconButton } from '../../components/ui/IconButton';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { CountryFlagBadge } from '../../components/ui/CountryFlagBadge';
import {
  getProfileFramePreviewAsset,
  getProfileFramePlacement,
  type ProfileFrameRecord,
} from '../../components/ui/profileFrameGeometry';
import { MatchModal } from '../../components/MatchModal';
import { AppLogo } from '../../components/ui/AppLogo';
import { getRelationshipGoalLabels, formatDisplayAge } from '../../lib/profileLabels';
import { SPRING } from '../../motion/tokens';
import { useAppTranslation, translateSync } from '../../i18n/appLocale';

export interface MapUser {
  id: string;
  name: string;
  city?: string;
  verified?: boolean;
  displayLat: number;
  displayLng: number;
  // Server sends a privacy-safe distance bucket object (see formatDistanceBucket in
  // location_utils.js), never a plain string or exact figure.
  distance?: { bucket: string; label: string; minKm: number; maxKm: number } | null;
  photo?: string;
  photoThumbnailUrl?: string;
  activeFrameId?: string;
}

interface SelectedPin {
  users: MapUser[];
}

// Same neighborhood/city-scale cap the old Leaflet setup used (see git history) -- keeps the map
// at a "who's near me" social/dating scale instead of full street-level detail, independent of
// the style's own layer minzoom/maxzoom choices (ryvoMapStyle.ts).
const MIN_ZOOM = 3;
const MAX_ZOOM = 15;
// [lng, lat] -- MapLibre's coordinate order, the opposite of Leaflet's [lat, lng]. Türkiye, shown
// until the device's own location resolves.
const DEFAULT_CENTER: [number, number] = [35.2, 39.0];
const DEFAULT_ZOOM = 5.2;
const LOCATE_ZOOM = 13;
const MOVE_DEBOUNCE_MS = 350;
// MapLibre's flyTo/easeTo `duration` is milliseconds, unlike Leaflet's flyTo which took seconds.
const FLY_DURATION_MS = 1100;
const CLUSTER_EXPANSION_DURATION_MS = 400;
// Two points within this many pixels of each other cluster together -- mirrors the old
// leaflet.markercluster maxClusterRadius range (34-58px, denser near the default zoom).
const CLUSTER_RADIUS_PX = 56;

function firstPhoto(u: MapUser): string | undefined {
  // Map markers are at most 48px. Always prefer the server-generated thumbnail and never
  // decode a full profile image for a tiny map marker.
  return u.photoThumbnailUrl || u.photo;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

function htmlToElement(html: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const el = template.content.firstElementChild as HTMLElement | null;
  // Should be unreachable (every caller below passes a single well-formed root element), but a
  // marker constructor requires a real element, so fail loudly instead of handing MapLibre null.
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

export function markerSizeForZoom(zoom: number, selected = false): number {
  const base = Math.max(40, Math.min(48, 40 + Math.round((zoom - 8) * 0.8)));
  return Math.min(58, base + (selected ? 10 : 0));
}

export function avatarMarkerHtml(user: MapUser, selected: boolean, frames: ProfileFrameRecord[], zoom: number): string {
  const size = markerSizeForZoom(zoom, selected);
  const avatarSize = size - 8;
  const photo = firstPhoto(user);
  const initial = escapeHtml((user.name || '?').charAt(0).toUpperCase());
  // Initials always render underneath -- a failed decode (e.g. a malformed WEBP) hides the <img>
  // once via onerror (no retry loop) and reveals this fallback instead of a broken-image glyph.
  const initialsTag = `<div class="absolute inset-0 flex items-center justify-center text-white font-bold bg-[#3a3a46]">${initial}</div>`;
  const photoTag = photo
    ? `<img src="${escapeHtml(normalizeMediaUrl(photo) || '')}" alt="" class="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" draggable="false" onerror="this.style.display='none'" />`
    : '';
  const frame = frames.find((item) => item.id === user.activeFrameId);
  const frameAsset = user.activeFrameId && user.activeFrameId !== 'standard' ? getProfileFramePreviewAsset(frame) : null;
  const placement = getProfileFramePlacement(user.activeFrameId);
  const frameTag = frameAsset
    ? `<img src="${escapeHtml(normalizeMediaUrl(frameAsset) || '')}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false" class="absolute z-20 max-w-none h-auto pointer-events-none" style="left:50%;top:50%;width:${placement.width};transform:${placement.transform};transform-origin:center" onerror="this.style.display='none'" />`
    : '';

  return `
    <div class="relative flex items-center justify-center" style="width:${size}px;height:${size}px;z-index:600;cursor:pointer">
      ${
        selected
          ? `<div class="absolute inset-0 rounded-full animate-pulse" style="box-shadow:0 0 0 4px rgba(255,77,141,0.55),0 0 24px 6px rgba(255,77,141,0.4)"></div>`
          : ''
      }
      <div class="relative overflow-visible" style="width:${avatarSize}px;height:${avatarSize}px">
        <div class="absolute -inset-[3px] rounded-full bg-brand-gradient"></div>
        <div class="absolute inset-0 z-10 rounded-full overflow-hidden shadow-[0_6px_18px_rgba(0,0,0,0.4)]" style="border:2.5px solid ${
    selected ? '#FF4D8D' : 'rgba(255,255,255,0.92)'
  }">
          ${initialsTag}
          ${photoTag}
        </div>
        ${frameTag}
      </div>
      ${
        user.verified
          ? `<div class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#25D9D0] border-2 border-white"></div>`
          : ''
      }
    </div>
  `;
}

export function buildSocialClusterHtml(users: MapUser[], count: number): string {
  const faces = users.slice(0, 3).map((user, index) => {
    const photo = firstPhoto(user);
    const initial = escapeHtml((user.name || '?').charAt(0).toUpperCase());
    // Initials render underneath; a failed decode (e.g. malformed WEBP) hides the <img> once via
    // onerror (no retry loop), revealing the initials fallback instead of a broken-image glyph.
    const initialsTag = `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#454554;color:white;font-size:11px;font-weight:800">${initial}</span>`;
    const photoTag = photo
      ? `<img src="${escapeHtml(normalizeMediaUrl(photo) || '')}" alt="" loading="lazy" decoding="async" draggable="false" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />`
      : '';
    return `<span style="position:absolute;left:${index * 18}px;top:4px;width:30px;height:30px;overflow:hidden;border-radius:9999px;border:2px solid white;background:#454554;box-shadow:0 3px 9px rgba(0,0,0,.28);z-index:${3 - index}">${initialsTag}${photoTag}</span>`;
  }).join('');

  return `<div aria-label="${translateSync('mapClusterCountTemplate').replace('{count}', String(count))}" style="position:relative;width:68px;height:44px;z-index:600;cursor:pointer">
    ${faces}
    <span style="position:absolute;right:0;bottom:0;display:flex;min-width:27px;height:22px;align-items:center;justify-content:center;border-radius:9999px;border:2px solid white;background:linear-gradient(135deg,#ff4d8d,#7957ff);padding:0 6px;color:white;font-size:11px;font-weight:900;box-shadow:0 4px 12px rgba(75,42,130,.35);z-index:5">${count}</span>
  </div>`;
}

function selfLocationHtml(): string {
  return `
    <div class="relative flex items-center justify-center w-[30px] h-[30px]" style="z-index:500;pointer-events:none">
      <div class="absolute w-[30px] h-[30px] rounded-full bg-[#536DFE]/25 animate-ping"></div>
      <div class="relative w-[14px] h-[14px] rounded-full bg-[#536DFE]" style="box-shadow:0 0 0 3px rgba(83,109,254,0.35),0 2px 6px rgba(0,0,0,0.35);border:2px solid white"></div>
    </div>
  `;
}

// Subtle "alive" interest chip for the map profile-preview sheet only — one-time stagger-in
// plus a static soft glow, never a continuously blinking loop (see appryvo-mobile-ui-motion
// skill: glow/shimmer must explain "this is a highlighted interest", not decorate forever).
const InterestChip: React.FC<{ label: string; index: number }> = ({ label, index }) => (
  <motion.span
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ ...SPRING.snappy, delay: index * 0.05 }}
    className="text-caption font-semibold px-3 py-1.5 rounded-full text-app border border-pink-500/25 bg-gradient-to-br from-pink-500/10 to-purple-500/10 shadow-[0_0_14px_rgba(255,77,141,0.18)]"
  >
    {label}
  </motion.span>
);

export const SocialMapScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const isDark = useIsDarkMode();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selfMarkerRef = useRef<MapLibreMarker | null>(null);
  const onScreenMarkersRef = useRef<Map<string, MapLibreMarker>>(new Map());
  const clusterIndexRef = useRef<Supercluster<{ user: MapUser }> | null>(null);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapUsersSignatureRef = useRef<string>('');
  const lastFrameCatalogRef = useRef<ProfileFrameRecord[] | null>(null);
  // Imperative map event handlers (registered once at map init) close over stale React state --
  // these refs give renderVisibleMarkers() the current selection/frame-catalog/zoom without
  // needing to re-register listeners on every render.
  const selectedUserIdRef = useRef<string | null>(null);
  const frameCatalogRef = useRef<ProfileFrameRecord[]>([]);
  const openPinRef = useRef<(users: MapUser[]) => void>(() => {});

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'pending' | 'granted' | 'denied' | 'error'>('idle');
  // Whether the viewer has explicitly opted in to appear on the map for others. null while we
  // haven't yet learned their current state from the server (see the sync effect below) --
  // deliberately never defaults to true, since map presence is opt-in, not opt-out (Apple 5.1.2(i)).
  const [checkedIn, setCheckedIn] = useState<boolean | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [bbox, setBbox] = useState<MapBbox | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityResults, setCityResults] = useState<GeoCityResult[]>([]);
  const [isSearchingCities, setIsSearchingCities] = useState(false);
  const [citySearchError, setCitySearchError] = useState(false);
  const [selectedPin, setSelectedPin] = useState<SelectedPin | null>(null);
  const [selectedUser, setSelectedUser] = useState<MapUser | null>(null);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [matchResult, setMatchResult] = useState<{ isOpen: boolean; matchUser?: any; matchId?: string }>({
    isOpen: false,
  });

  const queryClient = useQueryClient();
  const { data: mapUsers, isLoading: isMapUsersLoading } = useDiscoveryMapQuery(bbox, 150);
  const { data: selectedUserDetail, isFetching: isDetailFetching } = useDiscoveryUserQuery(selectedUser?.id);
  const { data: framesData } = useFramesQuery();
  const { data: me } = useMeQuery();
  const frameCatalog = useMemo<ProfileFrameRecord[]>(
    () => Array.isArray(framesData?.frames) ? framesData.frames : [],
    [framesData?.frames]
  );
  const likeMutation = useLikeMutation();
  const passMutation = usePassMutation();
  const updateProfileMutation = useUpdateProfileMutation();

  useEffect(() => {
    selectedUserIdRef.current = selectedUser?.id ?? null;
  }, [selectedUser]);
  useEffect(() => {
    frameCatalogRef.current = frameCatalog;
  }, [frameCatalog]);

  // Learn the viewer's current map-visibility state from their profile exactly once per screen
  // visit (not on every refetch) -- once we've set a local value, an explicit check-in/hide
  // action here is what should own it, not a background me-query refresh racing the tap.
  useEffect(() => {
    if (checkedIn === null && me && typeof me.mapVisible === 'boolean') {
      setCheckedIn(me.mapVisible);
    }
  }, [me, checkedIn]);

  // Realtime primary path for other viewers' "Görün"/"Gizlen" toggles (see socket_server.js's
  // emitMapVisibilityChanged) -- the 15s refetchInterval on useDiscoveryMapQuery remains as the
  // fallback if this is ever missed. The event carries no lat/lng by design, so on either
  // visible:true or visible:false we only ever invalidate and let GET /api/discovery/map (which
  // re-checks map_visible + blocks + everything else) be the actual source of truth -- this
  // never grants or reveals anything the next poll wouldn't already have shown.
  useEffect(() => {
    socketService.emit('map:subscribe');
    const off = socketService.on('map:visibility-changed', (payload: { userId?: string; visible?: boolean }) => {
      if (!payload?.userId) return;
      queryClient.invalidateQueries({ queryKey: ['discovery', 'map'] });
    });
    return () => {
      off();
      socketService.emit('map:unsubscribe');
    };
  }, [queryClient]);

  const openPin = useCallback((users: MapUser[]) => {
    nativeHaptics.impact();
    setSelectedPin({ users });
    setSelectedUser(users.length === 1 ? users[0] : null);
  }, []);
  useEffect(() => {
    openPinRef.current = openPin;
  }, [openPin]);

  const closeSheet = () => {
    setSelectedPin(null);
    setSelectedUser(null);
  };

  const handleSheetLike = async (isSuperLike: boolean) => {
    if (!selectedUser) return;
    nativeHaptics.impact();
    const targetId = selectedUser.id;
    const targetProfile = selectedUserDetail || selectedUser;
    try {
      const res: any = await likeMutation.mutateAsync({ targetUserId: targetId, isSuperLike });
      closeSheet();
      if (res?.isMatch) {
        setMatchResult({ isOpen: true, matchUser: targetProfile, matchId: res.matchId });
      }
    } catch (err) {
      console.error('[MAP LIKE ERROR]', err);
    }
  };

  const handleSheetPass = async () => {
    if (!selectedUser) return;
    nativeHaptics.impact();
    const targetId = selectedUser.id;
    closeSheet();
    try {
      await passMutation.mutateAsync(targetId);
    } catch (err) {
      console.error('[MAP PASS ERROR]', err);
    }
  };

  // Re-derives on-screen markers (individual avatars + clusters) from the supercluster index for
  // whatever the map's current viewport/zoom is. Deliberately clears and rebuilds every on-screen
  // marker each call rather than diffing marker-by-marker -- same granularity the old
  // leaflet.markercluster setup used (its own cluster.clearLayers() + re-add), bounded by "however
  // many users are visible in one mobile viewport," and callers below already gate *when* this
  // runs (data-signature change, debounced moveend/zoomend, selection/frame-catalog change) so it
  // never fires on every render or every background poll tick.
  const renderVisibleMarkers = useCallback(() => {
    const map = mapRef.current;
    const index = clusterIndexRef.current;
    if (!map || !index) return;

    onScreenMarkersRef.current.forEach((marker) => marker.remove());
    onScreenMarkersRef.current.clear();

    const zoom = Math.round(map.getZoom());
    const b = map.getBounds();
    const bboxArr: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const clusters = index.getClusters(bboxArr, zoom);

    clusters.forEach((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties as any;

      if (props.cluster) {
        const clusterId = props.cluster_id as number;
        const leaves = index.getLeaves(clusterId, Infinity) as PointFeature<{ user: MapUser }>[];
        const users = leaves.map((leaf) => leaf.properties.user);
        const el = htmlToElement(buildSocialClusterHtml(users, props.point_count));
        el.addEventListener('click', () => {
          const map2 = mapRef.current;
          if (!map2) return;
          // Clusters behave spatially first: zoom/split while there is map detail left. Only a
          // still-dense max-zoom cluster becomes a people list.
          if (map2.getZoom() < MAX_ZOOM) {
            const expansionZoom = Math.min(index.getClusterExpansionZoom(clusterId), MAX_ZOOM);
            map2.easeTo({ center: [lng, lat], zoom: expansionZoom, duration: CLUSTER_EXPANSION_DURATION_MS });
          } else {
            openPinRef.current(users);
          }
        });
        const marker = new MapLibreMarker({ element: el }).setLngLat([lng, lat]).addTo(map);
        onScreenMarkersRef.current.set(`c:${clusterId}`, marker);
      } else {
        const user = (props as { user: MapUser }).user;
        const el = htmlToElement(avatarMarkerHtml(user, selectedUserIdRef.current === user.id, frameCatalogRef.current, zoom));
        el.addEventListener('click', () => openPinRef.current([user]));
        const marker = new MapLibreMarker({ element: el }).setLngLat([lng, lat]).addTo(map);
        onScreenMarkersRef.current.set(`u:${user.id}`, marker);
      }
    });
  }, []);

  // Initialize the map exactly once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    if (!isRyvoMapConfigured()) {
      // Production build with VITE_OPENMAPTILES_TILEJSON_URL never set -- fail loudly in the
      // console rather than silently rendering a blank gray screen with no explanation. The
      // "map unavailable" state in the JSX below covers the user-facing side of this.
      console.error('[SocialMapScreen] OPENMAPTILES_TILEJSON_URL is not configured; map cannot initialize.');
      return;
    }

    const map = new MapLibreMap({
      container,
      style: buildRyvoMapStyle(isDark ? 'dark' : 'light', {
        tileJsonUrl: OPENMAPTILES_TILEJSON_URL,
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
      // Bounds how many off-screen vector tiles MapLibre keeps decoded in memory -- the same
      // Android memory-conservation intent the old Leaflet raster setup's `keepBuffer: 1` served,
      // just MapLibre's own equivalent knob (there is no literal keepBuffer option here).
      maxTileCacheSize: 50,
    });
    map.addControl(
      new AttributionControl({
        compact: true,
        // Exact format OpenFreeMap's operator requests (openfreemap.org) -- the tile source this
        // build points at by default, see ryvoMapConfig.ts.
        customAttribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
      })
    );
    mapRef.current = map;

    const updateBbox = () => {
      const b = map.getBounds();
      setBbox({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
      renderVisibleMarkers();
    };
    map.on('moveend', () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(updateBbox, MOVE_DEBOUNCE_MS);
    });
    map.on('zoomend', () => setZoomLevel(map.getZoom()));

    // Guards against measuring a not-yet-laid-out container on route mount, which otherwise
    // renders as a blank canvas until the next manual interaction.
    const raf = requestAnimationFrame(() => map.resize());

    map.once('load', () => {
      // Populate the initial viewport once the style/source has actually resolved, rather than
      // waiting on the first user pan.
      updateBbox();
    });

    const markersOnScreen = onScreenMarkersRef.current;
    return () => {
      cancelAnimationFrame(raf);
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      // Detach image sources before destroying the map/markers. Chromium otherwise keeps decoded
      // image surfaces alive until a later major GC; repeated map/tab cycles pushed Graphics PSS
      // up by hundreds of MB on the Galaxy A50 even though the React route had already unmounted
      // (same issue previously seen with the Leaflet tile pane's own <img> elements).
      container?.querySelectorAll('img').forEach((image) => {
        image.removeAttribute('src');
        image.removeAttribute('srcset');
      });
      markersOnScreen.forEach((marker) => marker.remove());
      markersOnScreen.clear();
      selfMarkerRef.current?.remove();
      map.remove();
      container?.replaceChildren();
      mapRef.current = null;
      selfMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the vector style with the app theme — same product, different tokens. MapLibre's
  // setStyle preserves the current camera (center/zoom) by default; markers are DOM elements
  // tracked outside the style/source, so they persist across the swap without needing to be
  // re-added.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(
      buildRyvoMapStyle(isDark ? 'dark' : 'light', {
        tileJsonUrl: OPENMAPTILES_TILEJSON_URL,
        spriteUrl: OPENMAPTILES_SPRITE_URL,
        glyphsUrl: OPENMAPTILES_GLYPHS_URL,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  // Purely local: reads the device's own GPS fix to center the map and draw the "you are here"
  // dot. Never sent to the backend and never implies visibility to other users -- appearing on
  // the map for others is the separate, explicit checkInToMap() action below. This is what the
  // map screen itself and the recenter button trigger; it deliberately does NOT run on mount, so
  // opening the map never fires an OS location prompt or shares anything on its own.
  const acquireLocalLocation = useCallback((recenter: boolean): Promise<{ latitude: number; longitude: number; accuracy?: number }> => {
    setLocationStatus((s) => (s === 'granted' ? s : 'pending'));
    return nativeLocation
      .getCurrentPosition()
      .then((pos: any) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setLocationStatus('granted');
        if (recenter) mapRef.current?.flyTo({ center: [longitude, latitude], zoom: LOCATE_ZOOM, duration: FLY_DURATION_MS });
        return { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : undefined };
      })
      .catch((err: any) => {
        setLocationStatus(err?.code === 1 ? 'denied' : 'error');
        throw err;
      });
  }, []);

  // Explicit "appear on map" check-in: the only action in this screen that shares the viewer's
  // position with the backend and turns on map_visible. Always uses a fresh GPS fix -- check-in
  // means "show my current spot," not "reuse whatever we last had."
  const checkInToMap = useCallback(async () => {
    setCheckingIn(true);
    try {
      const pos = await acquireLocalLocation(true);
      await apiClient.post('/api/user/location', {
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        mapVisible: true,
      });
      setCheckedIn(true);
      nativeHaptics.impact();
    } catch {
      // acquireLocalLocation already reflected a permission/GPS failure via locationStatus;
      // a POST failure just leaves checkedIn at its previous value.
    } finally {
      setCheckingIn(false);
    }
  }, [acquireLocalLocation]);

  // Explicit "stop appearing": no GPS fix required, so this always works even if location is
  // denied or stale. users.map_visible = FALSE alone is enough to drop the viewer out of every
  // other user's /api/discovery/map query.
  const hideFromMap = useCallback(() => {
    nativeHaptics.impact();
    updateProfileMutation.mutate({ mapVisible: false }, {
      onSuccess: () => setCheckedIn(false),
    });
  }, [updateProfileMutation]);

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

  // Rebuild the spatial (supercluster) index whenever the discovery user set actually changes.
  // The map polls every 15s (see useDiscoveryMapQuery), and most polls return a byte-identical
  // user set with a new array reference -- rebuilding on every poll made the whole map visibly
  // blink every 15s. Skip the rebuild (and the marker re-render it triggers) when the actual
  // id/position content hasn't changed; a genuine viewport pan/zoom still re-renders markers via
  // the moveend/zoomend handler in the init effect above, independent of this gate.
  useEffect(() => {
    if (!Array.isArray(mapUsers)) return;

    const signature = mapUsers.map((u) => `${u.id}:${u.displayLat}:${u.displayLng}`).join('|');
    if (signature === mapUsersSignatureRef.current && frameCatalog === lastFrameCatalogRef.current) {
      return;
    }
    mapUsersSignatureRef.current = signature;
    lastFrameCatalogRef.current = frameCatalog;

    const points: PointFeature<{ user: MapUser }>[] = mapUsers
      .filter((u) => typeof u.displayLat === 'number' && typeof u.displayLng === 'number')
      .map((u) => ({
        type: 'Feature',
        properties: { user: u },
        geometry: { type: 'Point', coordinates: [u.displayLng, u.displayLat] },
      }));

    const index = new Supercluster<{ user: MapUser }>({
      radius: CLUSTER_RADIUS_PX,
      maxZoom: MAX_ZOOM,
    });
    index.load(points);
    clusterIndexRef.current = index;
    renderVisibleMarkers();
  }, [frameCatalog, mapUsers, renderVisibleMarkers]);

  // Re-skin markers currently on screen when the selection or zoom-driven marker size changes.
  // Cheaper than the full index rebuild above (bounded by "however many markers are visible right
  // now"), but not as targeted as the old per-marker Leaflet re-skin -- see renderVisibleMarkers's
  // own comment for why "clear + rebuild the visible set" was chosen here.
  useEffect(() => {
    if (!mapRef.current || !clusterIndexRef.current) return;
    renderVisibleMarkers();
  }, [selectedUser, frameCatalog, zoomLevel, renderVisibleMarkers]);

  const handleRecenter = () => {
    nativeHaptics.impact();
    acquireLocalLocation(true).catch(() => {});
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
    setSearchQuery(city.city || '');
    setCityResults([]);
    setCitySearchError(false);
    if (typeof city.latitude === 'number' && typeof city.longitude === 'number') {
      mapRef.current?.flyTo({ center: [city.longitude, city.latitude], zoom: LOCATE_ZOOM, duration: FLY_DURATION_MS });
    }
  };

  // Gated on isLoading (true only until the first page of results for this bbox has ever
  // arrived), not isFetching (true on every background refetchInterval tick too) -- with
  // placeholderData: keepPreviousData, mapUsers never actually goes away during a background
  // poll, so re-deriving this from isFetching made the "no one nearby" pill blink off and back
  // on every 15s poll even though nothing had changed.
  const isEmptyViewport = useMemo(
    () => !!bbox && !isMapUsersLoading && Array.isArray(mapUsers) && mapUsers.length === 0,
    [bbox, isMapUsersLoading, mapUsers]
  );

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
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-app-muted" />
            <input
              type="text"
              placeholder={t('mapSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-90 backdrop-blur-xl border border-app rounded-full pl-12 pr-4 py-3 text-body font-semibold text-app placeholder:text-app-muted shadow-elevated focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
            />
          </form>
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
                onClick={() => selectCity(city)}
                className="w-full px-4 py-3 text-left border-b border-app last:border-b-0 text-body font-medium text-app hover:bg-surface-elevated flex items-center gap-2"
              >
                <span>{city.city}</span>
                <span className="text-caption text-app-muted">{city.country}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status pills — never a full-screen blocker, the map stays interactive underneath.
          Positioned relative to the search bar above (safe-top + its own ~56px height + a
          breathing gap) rather than a bare fixed top-24: that fixed value ignored
          env(safe-area-inset-top) entirely, so on a taller notch/dynamic-island inset the
          search bar (itself correctly safe-area-aware via pt-safe) could sit low enough for
          these two blocks to crowd or overlap. */}
      <div className="absolute inset-x-0 top-[calc(var(--safe-top)+4.5rem)] z-sticky flex justify-center pointer-events-none px-6">
        {locationStatus === 'pending' && (
          <div className="px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md">
            {t('mapLocatingLabel')}
          </div>
        )}
        {locationStatus === 'denied' && (
          <div className="pointer-events-auto px-4 py-2.5 rounded-2xl bg-surface-95 border border-app text-caption font-semibold text-app shadow-elevated backdrop-blur-md flex items-center gap-3">
            <span>{t('mapLocationDeniedMessage')}</span>
            <button
              onClick={() => acquireLocalLocation(true).catch(() => {})}
              className="shrink-0 text-pink-500 font-bold"
            >
              {t('retryButton')}
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
        {isMapUsersLoading && bbox && (
          <div className="px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md">
            {t('mapNearbyLoadingLabel')}
          </div>
        )}
        {isEmptyViewport && (
          <div className="px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md">
            {t('mapNoOneNearbyLabel')}
          </div>
        )}
      </div>

      {/* Map visibility consent — appearing on the map for others is always a separate, explicit,
          reversible action from simply browsing it or recentering on your own device location. */}
      {checkedIn === false && (
        <div className="absolute bottom-28 inset-x-4 z-sticky pointer-events-auto">
          <div className="max-w-md mx-auto px-4 py-3 rounded-2xl bg-surface-95 border border-app shadow-elevated backdrop-blur-md flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-gradient flex items-center justify-center shrink-0">
              <MapPin className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-caption font-bold text-app">{t('mapNotVisibleTitle')}</p>
              <p className="text-caption text-app-muted leading-tight">{t('mapNotVisibleSubtitle')}</p>
            </div>
            <button
              onClick={checkInToMap}
              disabled={checkingIn}
              className="shrink-0 px-3.5 py-2 rounded-full bg-brand-gradient text-white text-caption font-extrabold shadow-soft active:scale-95 transition-transform disabled:opacity-60"
            >
              {checkingIn ? '...' : t('mapCheckInButtonLabel')}
            </button>
          </div>
        </div>
      )}
      {checkedIn === true && (
        <div className="absolute bottom-28 left-4 z-sticky pointer-events-auto">
          <button
            onClick={hideFromMap}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface-95 border border-app shadow-elevated backdrop-blur-md text-caption font-bold text-app active:scale-95 transition-transform"
          >
            <span className="w-2 h-2 rounded-full bg-[#25D9D0]" />
            {t('mapVisibleLabel')}
            <EyeOff className="w-3.5 h-3.5 text-app-muted" />
          </button>
        </div>
      )}

      {/* Floating controls — parked above the visibility banner/pill row. bottom-44 previously
          left only a few px above the taller "Haritada görünmüyorsun" banner variant (icon +
          two text lines + button, ~64px tall on top of its own bottom-28 offset reaches nearly
          this button's own bottom edge) -- bumped to bottom-52 for real breathing room instead
          of the two nearly touching. */}
      <div className="absolute bottom-52 right-4 z-sticky flex flex-col gap-2">
        <IconButton aria-label={t('mapRecenterAriaLabel')} variant="surface" size="lg" onClick={handleRecenter}>
          {locationStatus === 'granted' ? (
            <Compass className="w-6 h-6 text-[#25D9D0]" />
          ) : (
            <LocateFixed className="w-6 h-6 text-[#25D9D0]" />
          )}
        </IconButton>
      </div>

      {/* Selected pin / profile preview sheet */}
      <BottomSheet isOpen={!!selectedPin} onClose={closeSheet}>
        <div className="px-5 pb-6">
          {!selectedUser && selectedPin && selectedPin.users.length > 1 ? (
            <>
              <h4 className="text-heading text-app mb-3">{t('mapClusterCountTemplate').replace('{count}', String(selectedPin.users.length))}</h4>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {selectedPin.users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className="flex flex-col items-center gap-1.5 flex-shrink-0"
                  >
                    <ProfileAvatarFrame photoUrl={firstPhoto(u)} name={u.name} activeFrameId={u.activeFrameId} size="lg" />
                    <span className="text-caption font-bold text-app truncate max-w-[64px]">{u.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : selectedUser ? (
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-28 h-36 rounded-2xl overflow-hidden bg-app-secondary shrink-0 shadow-elevated">
                  {firstPhoto(selectedUser) ? (
                    <img
                      src={normalizeMediaUrl(firstPhoto(selectedUser))}
                      alt={selectedUser.name}
                      className="w-full h-full object-cover"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ProfileAvatarFrame
                        name={selectedUser.name}
                        activeFrameId={selectedUserDetail?.activeFrameId || selectedUser.activeFrameId}
                        size="xl"
                      />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <h4 className="text-heading text-app truncate">{selectedUser.name}</h4>
                    {formatDisplayAge(selectedUserDetail?.age) !== undefined && (
                      <span className="text-body font-bold text-app-muted">{formatDisplayAge(selectedUserDetail?.age)}</span>
                    )}
                    {selectedUser.verified && <ShieldCheck className="w-4.5 h-4.5 text-[#32D583] shrink-0" />}
                    {selectedUserDetail?.isPremium && (
                      <Crown className="w-4 h-4 text-[#F5B942] fill-current shrink-0" />
                    )}
                    {selectedUserDetail?.countryCode && (
                      <CountryFlagBadge countryCode={selectedUserDetail.countryCode} size="xs" />
                    )}
                  </div>
                  <p className="text-caption text-app-muted mt-0.5">
                    {selectedUser.city || t('mapNearbyFallbackLabel')}
                    {selectedUser.distance?.label ? ` • ${selectedUser.distance.label}` : ''}
                  </p>

                  {getRelationshipGoalLabels(selectedUserDetail?.relationshipGoals || selectedUserDetail?.relationshipGoal).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {getRelationshipGoalLabels(selectedUserDetail?.relationshipGoals || selectedUserDetail?.relationshipGoal).map((label) => (
                        <span key={label} className="text-caption font-semibold px-3 py-1 rounded-full bg-surface-elevated border border-app text-app">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {isDetailFetching && !selectedUserDetail && (
                <div className="h-4 w-2/3 rounded-full bg-app-secondary animate-pulse" />
              )}

              {selectedUserDetail?.bio && (
                <p className="text-caption text-app leading-relaxed">{selectedUserDetail.bio}</p>
              )}

              {Array.isArray(selectedUserDetail?.interests) && selectedUserDetail.interests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUserDetail.interests.slice(0, 5).map((interest: string, idx: number) => (
                    <InterestChip key={interest} label={interest} index={idx} />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-center gap-4 pt-1">
                <button
                  onClick={handleSheetPass}
                  className="w-14 h-14 rounded-full bg-surface border border-app text-[#FF4B55] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
                >
                  <X className="w-6 h-6 stroke-[2.5]" />
                </button>
                <button
                  onClick={() => handleSheetLike(false)}
                  className="w-16 h-16 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-xl shadow-pink-500/30 active:scale-90 transition-transform"
                >
                  <Heart className="w-7 h-7 fill-current" />
                </button>
              </div>
              <button
                onClick={() => {
                  closeSheet();
                  navigate(`/discover/${selectedUser.id}`);
                }}
                className="w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl bg-surface border border-app text-caption font-extrabold text-app active:scale-[0.98] transition-transform"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                {t('mapViewProfileAction')}
              </button>
            </div>
          ) : null}
        </div>
      </BottomSheet>

      <MatchModal
        isOpen={matchResult.isOpen}
        onClose={() => setMatchResult({ isOpen: false })}
        matchedUser={matchResult.matchUser}
        matchId={matchResult.matchId}
      />
    </div>
  );
};
