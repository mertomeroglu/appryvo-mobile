import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
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
import Supercluster, { type PointFeature } from 'supercluster';
import './SocialMapScreen.css';
import { Search, Compass, ShieldCheck, LocateFixed, Sparkles, Crown, MapPin, EyeOff, Users, MessageCircle, MoreHorizontal, ChevronRight } from 'lucide-react';
import {
  useDiscoveryMapQuery,
  useDiscoveryUserQuery,
  useFramesQuery,
  useLikeMutation,
  useMeQuery,
  usePassMutation,
  useUpdateProfileMutation,
  type MapBbox,
  type MapGenderFilter,
} from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { apiClient, ApiException } from '../../services/api/apiClient';
import { nativeLocation } from '../../native/location';
import { nativeHaptics } from '../../native/haptics';
import { nativeAppSettings } from '../../native/nativeSettings';
import { socketService } from '../../services/socket/socketService';
import { toast } from '../../stores/useToastStore';
import { searchCities, type GeoCityResult } from '../../services/geo/cityService';
import { acquireBestLocation } from '../../services/geo/locationQuality';
import { buildRyvoMapStyle, type ResolvedTileSource } from './ryvoMapStyle';
import {
  ROOM_CLUSTER_LAYER_ID,
  ROOM_SOURCE_ID,
  ROOM_UNCLUSTERED_LAYER_ID,
  buildRoomFeatureCollection,
  installRoomMapLayers,
  setRoomLayersVisible,
  type RoomFeatureCollection,
} from './roomMapLayers';
import { OPENMAPTILES_SPRITE_URL, OPENMAPTILES_GLYPHS_URL, OPENMAPTILES_TILEJSON_URL, isRyvoMapConfigured } from './ryvoMapConfig';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { RoomAvatar } from '../rooms/RoomAvatar';
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
import { APP_LOCALE_LABELS, useAppTranslation, translateSync, type AppLocale, type AppMessageKey } from '../../i18n/appLocale';
import { communityRoomsService, type CommunityRoom, type RoomCategory } from '../../services/rooms/communityRoomsService';
import { FollowButton } from '../../components/FollowButton';
import { ConnectButton } from '../connect/ConnectButton';

const ROOM_CATEGORY_KEY: Record<RoomCategory, Parameters<typeof roomsText>[1]> = {
  GENERAL: 'categoryGeneral', TRAVEL: 'categoryTravel', FOOD_CAFE: 'categoryFoodCafe', MUSIC: 'categoryMusic',
  MOVIES: 'categoryMovies', GAMING: 'categoryGaming', TECHNOLOGY: 'categoryTechnology', LOCAL: 'categoryLocal',
  LANGUAGE: 'categoryLanguage', OTHER: 'categoryOther',
};
import { roomsText } from '../rooms/roomsLocale';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { navigateMapToGeography } from './geoNavigation';

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
  countryCode?: string | null;
  online?: boolean;
  activeNow?: boolean;
}

interface SelectedPin {
  users: MapUser[];
}

// Same neighborhood/city-scale cap the old Leaflet setup used (see git history) -- keeps the map
// at a "who's near me" social/dating scale instead of full street-level detail, independent of
// the style's own layer minzoom/maxzoom choices (ryvoMapStyle.ts).
// MIN_ZOOM was 3, which caps the widest view at roughly 6,100 km -- enough for a continent, not
// for the whole world. The server applies no distance limit at all (the map query filters by
// viewport and nothing else), so that cap was the only thing making a far-away user unreachable:
// someone in Türkiye simply could not fit a user in India on screen at any zoom. 2 doubles the
// span so the map can actually reach everyone the API is willing to return.
const MIN_ZOOM = 2;
const MAX_ZOOM = 15;

// MapLibre reports viewport bounds as raw floats, so every pan produced a brand-new query key --
// a fresh request and a fresh cache entry for a viewport a few metres from the last one (a
// 12-user system had already issued over 7,000 map requests). Snapping to ~110 m collapses small
// drags onto one key. The snap is deliberately *outward* (floor the south/west edge, ceil the
// north/east) so the box we ask for always contains everything actually on screen -- this can
// never hide a marker to save a request.
// How often an already-visible user's own stored position is refreshed in the background, and
// where that last attempt is remembered. 15 minutes is short enough that a marker never sits days
// out of date, long enough that bouncing in and out of the map isn't a stream of GPS fixes.
const SELF_LOCATION_REFRESH_KEY = 'ryvo_map_self_location_refreshed_at';
const SELF_LOCATION_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const BBOX_SNAP_PER_DEGREE = 1000;
function quantizeBbox(bounds: MapBbox): MapBbox {
  return {
    south: Math.floor(bounds.south * BBOX_SNAP_PER_DEGREE) / BBOX_SNAP_PER_DEGREE,
    north: Math.ceil(bounds.north * BBOX_SNAP_PER_DEGREE) / BBOX_SNAP_PER_DEGREE,
    west: Math.floor(bounds.west * BBOX_SNAP_PER_DEGREE) / BBOX_SNAP_PER_DEGREE,
    east: Math.ceil(bounds.east * BBOX_SNAP_PER_DEGREE) / BBOX_SNAP_PER_DEGREE,
  };
}
// Mirrors MAP_GENDER_FILTERS in the API's discovery_engine.js. 'ALL' is "no filter"; 'OTHER' is
// the "Diğer" gender, not "no preference" -- the server's enum overloads that word, this does not.
const MAP_GENDER_FILTERS: MapGenderFilter[] = ['ALL', 'FEMALE', 'MALE', 'OTHER'];
const MAP_GENDER_FILTER_LABEL_KEY: Record<MapGenderFilter, AppMessageKey> = {
  ALL: 'interestedInOptionEveryone',
  FEMALE: 'interestedInOptionFemale',
  MALE: 'interestedInOptionMale',
  OTHER: 'mapFilterOther',
};
/** Mirrors resolveMapGenderFilter in the API's discovery_engine.js -- the same fallback, so the
 *  highlighted pill always matches what the server actually filtered by. */
function resolveGenderFilter(saved?: string | null, registrationChoice?: string | null): MapGenderFilter {
  if (saved && MAP_GENDER_FILTERS.includes(saved as MapGenderFilter)) return saved as MapGenderFilter;
  if (registrationChoice === 'FEMALE' || registrationChoice === 'MALE') return registrationChoice;
  return 'ALL';
}
// [lng, lat] -- MapLibre's coordinate order, the opposite of Leaflet's [lat, lng]. Türkiye, shown
// until the device's own location resolves.
const DEFAULT_CENTER: [number, number] = [35.2, 39.0];
const DEFAULT_ZOOM = 5.2;
const LOCATE_ZOOM = 13;
const MOVE_DEBOUNCE_MS = 350;
// MapLibre's flyTo/easeTo `duration` is milliseconds, unlike Leaflet's flyTo which took seconds.
const FLY_DURATION_MS = 1100;
const CLUSTER_EXPANSION_DURATION_MS = 400;
// Enough to identify the cities behind any realistic room cluster without walking a huge one.
const CLUSTER_LEAF_PROBE_LIMIT = 200;
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

// V3: room clusters -- every room in the same city shares that city's exact centroid
// coordinates (no precise room-owner GPS is ever stored), so without clustering every room in a
// city renders as fully-overlapping pins. Mirrors buildSocialClusterHtml's shape (a bubble +
// count badge) but visually distinct (message-bubble icon, teal instead of pink/violet) so a
// room cluster is never mistaken for a people cluster at a glance.
/* Legacy DOM room marker rendering was replaced by native MapLibre layers. */
function legacyBuildRoomClusterHtml(roomCount: number): string {
  return `<div style="position:relative;width:58px;height:58px;z-index:600;cursor:pointer">
    <div style="position:absolute;inset:0;border-radius:9999px;background:linear-gradient(135deg,#25D9D0,#7957ff);box-shadow:0 4px 14px rgba(37,217,208,.4);display:flex;align-items:center;justify-content:center;border:2.5px solid rgba(255,255,255,0.92)">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
    </div>
    <span style="position:absolute;right:-2px;bottom:-2px;display:flex;min-width:24px;height:22px;align-items:center;justify-content:center;border-radius:9999px;border:2px solid white;background:#ff4d8d;padding:0 5px;color:white;font-size:11px;font-weight:900;box-shadow:0 3px 9px rgba(0,0,0,.28)">${roomCount}</span>
  </div>`;
}

function legacyRoomMarkerHtml(room: CommunityRoom, selected: boolean): string {
  const typeIcon = room.type === 'VOICE'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8057ef" stroke-width="2.4"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>'
    : room.type === 'VIDEO'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8057ef" stroke-width="2.4"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8057ef" stroke-width="2.4"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>';
  const size = Math.min(78, 54 + Math.min(room.activeParticipantCount, 6) * 3 + (selected ? 8 : 0));
  const avatars = room.participants.slice(0, 2).map((participant) => participant.photoUrl
    ? `<img src="${escapeHtml(normalizeMediaUrl(participant.photoUrl))}" alt="" />`
    : `<span>${escapeHtml(participant.name.slice(0,1).toUpperCase())}</span>`).join('');
  return `<div class="ryvo-room-marker-root" style="width:${size}px;height:${size}px"><button class="ryvo-room-marker${selected?' is-selected':''}" style="width:${size}px;height:${size}px" aria-label="${escapeHtml(room.title)}">
    <span class="ryvo-room-marker-avatars">${avatars || `<span>${typeIcon}</span>`}</span>
    <span class="ryvo-room-marker-type">${typeIcon}</span>
    ${room.activeParticipantCount ? `<span class="ryvo-room-marker-count">${room.activeParticipantCount}</span>` : ''}
    ${room.isOfficial ? '<span class="ryvo-room-marker-official">✓</span>' : ''}
  </button></div>`;
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
  const { t, locale } = useAppTranslation();
  const navigate = useNavigate();
  // The map is initialised once, so its handlers read navigate through a ref rather than
  // closing over the first render's binding.
  const navigateRef = useRef(navigate);
  const isDark = useIsDarkMode();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selfMarkerRef = useRef<MapLibreMarker | null>(null);
  const onScreenMarkersRef = useRef<Map<string, MapLibreMarker>>(new Map());
  const roomDataRef = useRef<RoomFeatureCollection>(buildRoomFeatureCollection([]));
  const roomsByIdRef = useRef<Map<string, CommunityRoom>>(new Map());
  const roomModeRef = useRef(false);
  const clusterIndexRef = useRef<Supercluster<{ user: MapUser }> | null>(null);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Set once the init effect's own fetch() resolves the TileJSON (see below for why that's done
  // manually instead of via MapLibre's built-in url: auto-resolution) -- the theme-swap effect
  // reuses this instead of re-fetching, since it only needs to re-run buildRyvoMapStyle with new
  // theme tokens, not re-resolve tiles that already succeeded once.
  const tileSourceRef = useRef<ResolvedTileSource | null>(null);
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
  const [discoveryMode, setDiscoveryMode] = useState<'people'|'rooms'>('people');
  const [rooms, setRooms] = useState<CommunityRoom[]>([]);
  const [roomFilter, setRoomFilter] = useState<'ALL' | 'OFFICIAL' | RoomCategory>('ALL');
  // Saving is what makes the choice stick: the filter is a profile column shared with Discover
  // (users.gender_filter), not device state, so it survives an app restart and a reinstall and
  // both surfaces always agree. This is only the in-flight value while the write lands.
  const [savingGenderFilter, setSavingGenderFilter] = useState<MapGenderFilter | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<CommunityRoom|null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [matchResult, setMatchResult] = useState<{ isOpen: boolean; matchUser?: any; matchId?: string }>({
    isOpen: false,
  });

  const queryClient = useQueryClient();
  const { data: me } = useMeQuery();
  // What the map is actually filtered by right now. The saved profile column is the source of
  // truth; until the user has ever set one the server falls back to their registration answer,
  // so the same fallback is mirrored here rather than leaving every pill unlit.
  const genderFilter: MapGenderFilter = savingGenderFilter
    ?? resolveGenderFilter(me?.genderFilter, me?.targetGender);
  const { data: mapUsers, isLoading: isMapUsersLoading } = useDiscoveryMapQuery(bbox, 150, genderFilter);
  const { data: selectedUserDetail, isFetching: isDetailFetching } = useDiscoveryUserQuery(selectedUser?.id);
  const { data: framesData } = useFramesQuery();
  const frameCatalog = useMemo<ProfileFrameRecord[]>(
    () => Array.isArray(framesData?.frames) ? framesData.frames : [],
    [framesData?.frames]
  );
  const updateProfileMutation = useUpdateProfileMutation();

  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => { roomModeRef.current = discoveryMode === 'rooms'; }, [discoveryMode]);

  useEffect(() => {
    if (discoveryMode !== 'rooms' || !bbox) return;
    let cancelled=false; setRoomsLoading(true);
    const params: Record<string,string|number|undefined> = { ...bbox };
    if (roomFilter === 'OFFICIAL') params.official = 'true';
    else if (roomFilter !== 'ALL') params.category = roomFilter;
    communityRoomsService.list(params).then((items)=>{if(!cancelled)setRooms(items);}).catch(()=>{if(!cancelled)setRooms([]);}).finally(()=>{if(!cancelled)setRoomsLoading(false);});
    return()=>{cancelled=true;};
  },[bbox,discoveryMode,roomFilter]);

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

  // A new match used to be spliced straight out of the map cache here, mirroring a server rule
  // that removed matched users from GET /api/discovery/map. That rule is gone -- the people you
  // have connected with are exactly who you want to see around you -- so matching now only
  // refreshes the markers (the new match's badge/state may have changed) instead of deleting one.
  useEffect(() => socketService.on('match:new', () => {
    queryClient.invalidateQueries({ queryKey: ['discovery', 'map'] });
  }), [queryClient]);

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

  // V3: the map's user-preview sheet no longer offers Like/SuperLike/Pass (see the
  // FollowButton/ConnectButton block in the sheet JSX below) -- Discover's own swipe screen is
  // where that flow still lives, untouched.

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
    if (!map || !index || roomModeRef.current) return;

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

    let cancelled = false;
    let map: MapLibreMap | null = null;
    let raf = 0;

    // The vector source below is given a fully-resolved `tiles` array instead of MapLibre's own
    // `url: tileJsonUrl` auto-resolution -- confirmed on-device (RYVO PATCH V5 03) that MapLibre's
    // internal TileJSON fetch for this source silently never settles (neither the 'load' event nor
    // an 'error' event ever fires) in this Capacitor/Android WebView build, while a plain fetch()
    // to the exact same URL -- from the main thread, from a bare Worker, and with an AbortSignal --
    // reliably succeeds every time, as does fetching an actual .pbf tile directly. Whatever the
    // discrepancy is inside MapLibre's own request path, resolving the TileJSON ourselves with the
    // already-proven-reliable fetch() and only handing MapLibre the resulting tile URL template
    // sidesteps it entirely, while MapLibre's own (independently verified working) per-tile
    // fetching still handles every actual .pbf request from here on.
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
          // Bounds how many off-screen vector tiles MapLibre keeps decoded in memory -- the same
          // Android memory-conservation intent the old Leaflet raster setup's `keepBuffer: 1`
          // served, just MapLibre's own equivalent knob (no literal keepBuffer option here).
          maxTileCacheSize: 50,
        });
        map.addControl(
          new AttributionControl({
            compact: true,
            // Exact format OpenFreeMap's operator requests (openfreemap.org) -- the tile source
            // this build points at by default, see ryvoMapConfig.ts.
            customAttribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
          })
        );
        mapRef.current = map;
        map.on('error', (e) => console.error(`[SocialMapScreen] MapLibre error: ${e?.error?.message || e}`));

        const restoreRoomLayers = () => installRoomMapLayers(map!, roomDataRef.current, roomModeRef.current);
        map.on('style.load', restoreRoomLayers);
        map.on('click', ROOM_CLUSTER_LAYER_ID, async (event) => {
          if (!roomModeRef.current) return;
          const feature = map!.queryRenderedFeatures(event.point, { layers: [ROOM_CLUSTER_LAYER_ID] })[0];
          const clusterId = Number(feature?.properties?.cluster_id);
          const coordinates = (feature?.geometry as { coordinates?: [number, number] })?.coordinates;
          const source = map!.getSource(ROOM_SOURCE_ID) as import('maplibre-gl').GeoJSONSource | undefined;
          if (!source || !Number.isFinite(clusterId) || !coordinates) return;
          nativeHaptics.impact();
          // Room coordinates are city centroids, so a cluster of rooms from a single city can
          // never be split by zooming -- past clusterMaxZoom they just pile onto each other a
          // few pixels apart. Send those straight to the city's room list instead of making
          // people zoom to the bottom to find out there is nothing to separate.
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
          if (!roomModeRef.current) return;
          const feature = map!.queryRenderedFeatures(event.point, { layers: [ROOM_UNCLUSTERED_LAYER_ID] })[0];
          const room = roomsByIdRef.current.get(String(feature?.properties?.roomId || ''));
          if (!room) return;
          nativeHaptics.impact();
          setSelectedRoom(room);
        });

        const updateBbox = () => {
          const b = map!.getBounds();
          const snapped = quantizeBbox({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
          // Same object identity for an unchanged box, so a pan that lands inside the current
          // snap cell doesn't re-run the query's `enabled`/key machinery at all.
          setBbox((current) => (
            current
              && current.north === snapped.north && current.south === snapped.south
              && current.east === snapped.east && current.west === snapped.west
              ? current
              : snapped
          ));
          renderVisibleMarkers();
        };
        map.on('moveend', () => {
          if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
          moveTimerRef.current = setTimeout(updateBbox, MOVE_DEBOUNCE_MS);
        });
        map.on('zoomend', () => setZoomLevel(map!.getZoom()));

        // Guards against measuring a not-yet-laid-out container on route mount, which otherwise
        // renders as a blank canvas until the next manual interaction. The ResizeObserver is a
        // defensive backstop beyond that single frame (e.g. the container resizing later for any
        // other reason -- a keyboard opening/closing, an orientation change) -- it is NOT a fix
        // for the actual blank-map bug this screen had (see SocialMapScreen.css's own comment on
        // `.ryvo-map-root.maplibregl-map`): that turned out to be MapLibre's own stylesheet
        // silently overriding this container's `absolute` positioning with `relative`, collapsing
        // it to its own empty content height (0px) regardless of how many frames anyone waited.
        raf = requestAnimationFrame(() => map?.resize());
        const resizeObserver = new ResizeObserver(() => map?.resize());
        resizeObserver.observe(container);
        resizeObserverRef.current = resizeObserver;

        map.once('load', () => {
          // Populate the initial viewport once the style/source has actually resolved, rather
          // than waiting on the first user pan.
          updateBbox();
          restoreRoomLayers();
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(`[SocialMapScreen] Failed to resolve OpenMapTiles TileJSON: ${err?.message || err}`);
      });

    const markersOnScreen = onScreenMarkersRef.current;
    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (!map) return;
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
      tileSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the vector style with the app theme — same product, different tokens. MapLibre's
  // setStyle preserves the current camera (center/zoom) by default; markers are DOM elements
  // tracked outside the style/source, so they persist across the swap without needing to be
  // re-added.
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
      .getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
      .then((pos: any) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setLocationStatus('granted');
        if (recenter) mapRef.current?.flyTo({ center: [longitude, latitude], zoom: LOCATE_ZOOM, duration: FLY_DURATION_MS });
        return { latitude, longitude, accuracy: Number.isFinite(accuracy) ? accuracy : undefined };
      })
      .catch((err: any) => {
        const isDenied = err?.code === 'PERMISSION_DENIED' || err?.code === 1;
        setLocationStatus(isDenied ? 'denied' : 'error');
        throw err;
      });
  }, []);

  // Explicit "appear on map" check-in: the only action in this screen that shares the viewer's
  // position with the backend and turns on map_visible. Always uses a fresh GPS fix -- check-in
  // means "show my current spot," not "reuse whatever we last had."
  const checkInToMap = useCallback(async () => {
    setCheckingIn(true);
    try {
      const fix = await acquireBestLocation();
      const { latitude, longitude, accuracy } = fix.coords;
      const pos = { latitude, longitude, accuracy };
      setCoords({ lat: latitude, lng: longitude });
      setLocationStatus('granted');
      mapRef.current?.flyTo({ center: [longitude, latitude], zoom: LOCATE_ZOOM, duration: FLY_DURATION_MS });
      await apiClient.post('/api/user/location', {
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        observedAt: new Date(fix.timestamp).toISOString(),
        mapVisible: true,
      });
      // A check-in *is* a position refresh, so it starts the background refresh's throttle
      // window. Without this the refresh effect below -- which arms the moment checkedIn flips
      // true -- would immediately take a second high-accuracy fix for the position we just sent.
      try { localStorage.setItem(SELF_LOCATION_REFRESH_KEY, String(Date.now())); } catch { /* private mode */ }
      setCheckedIn(true);
      nativeHaptics.impact();
    } catch (err: any) {
      // This used to swallow every failure silently: the pill just stayed on "Haritada
      // görünmüyorsun" with no explanation, which is indistinguishable from a dead button. The
      // two common failures are both invisible without this -- a denied permission, and a fix
      // that never reaches the 200m/30s quality bar acquireBestLocation and the server
      // (LOCATION_QUALITY_LOW) both enforce, which is the normal indoor/Wi-Fi-only case.
      const isDenied = err?.code === 'PERMISSION_DENIED' || err?.code === 1;
      if (isDenied) {
        setLocationStatus('denied');
        toast.error(t('mapLocationDeniedMessage'));
      } else if (!(err instanceof ApiException) || err.code === 'LOCATION_QUALITY_LOW') {
        // Not an API error at all => acquireBestLocation gave up before we ever posted, which it
        // only does when no fix cleared the accuracy/age bar.
        toast.error(t('mapCheckInLowAccuracyError'));
      } else {
        toast.error(err?.message || t('mapCheckInFailedError'));
      }
    } finally {
      setCheckingIn(false);
    }
  }, [t]);

  // Explicit "stop appearing": no GPS fix required, so this always works even if location is
  // denied or stale. users.map_visible = FALSE alone is enough to drop the viewer out of every
  // other user's /api/discovery/map query.
  const hideFromMap = useCallback(() => {
    nativeHaptics.impact();
    updateProfileMutation.mutate({ mapVisible: false }, {
      onSuccess: () => setCheckedIn(false),
    });
  }, [updateProfileMutation]);

  // Keep an already-visible user's own pin current. Nothing else in the app ever refreshes a
  // stored location: there is no background location (by design, and no such Android permission
  // is requested), app resume reconciles matches/likes/notifications but not position, and the
  // only writers are an explicit check-in, Discover's distance sync, and a Passport change. A
  // user who checked in once and then travelled stayed pinned to the old city indefinitely --
  // production currently has a visible marker whose position is eleven days old.
  //
  // Deliberately scoped to `checkedIn === true`: touching GPS for someone who has not opted into
  // the map would break the same consent rule Discover follows (it never locates on mount). For
  // someone already choosing to appear, refreshing where they appear is the consent they gave.
  // Throttled per device so re-entering the map screen doesn't spin up a high-accuracy fix each
  // time, and silent -- this is upkeep, not an action the user asked for, so a failure just
  // leaves the previous position in place rather than interrupting them.
  useEffect(() => {
    if (checkedIn !== true) return;
    let cancelled = false;
    const now = Date.now();
    let last = 0;
    try { last = Number(localStorage.getItem(SELF_LOCATION_REFRESH_KEY)) || 0; } catch { last = 0; }
    if (now - last < SELF_LOCATION_REFRESH_INTERVAL_MS) return;

    void (async () => {
      try {
        const fix = await acquireBestLocation();
        if (cancelled) return;
        const { latitude, longitude, accuracy } = fix.coords;
        await apiClient.post('/api/user/location', {
          latitude,
          longitude,
          accuracy,
          observedAt: new Date(fix.timestamp).toISOString(),
          mapVisible: true,
        });
        if (cancelled) return;
        setCoords({ lat: latitude, lng: longitude });
        try { localStorage.setItem(SELF_LOCATION_REFRESH_KEY, String(Date.now())); } catch { /* private mode */ }
      } catch {
        // Stale-but-present beats absent: keep whatever the server already has.
      }
    })();

    return () => { cancelled = true; };
  }, [checkedIn]);

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

  // Rebuild the room spatial index whenever the visible room set changes -- same rebuild-on-
  // content-change idiom as the people index above (see its own comment for why: cheap to skip
  // when nothing actually moved, and the moveend/zoomend-driven render below still re-renders on
  // every pan/zoom independent of this).
  useEffect(() => {
    roomsByIdRef.current = new Map(rooms.map((room) => [room.id, room]));
    roomDataRef.current = buildRoomFeatureCollection(rooms, selectedRoom?.id);
  }, [rooms, selectedRoom?.id]);

  const renderRoomMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded())) return;
    installRoomMapLayers(map, roomDataRef.current, roomModeRef.current);
  }, []);

  useEffect(() => {
    const map=mapRef.current;
    onScreenMarkersRef.current.forEach((marker)=>marker.remove()); onScreenMarkersRef.current.clear();
    if (!map) return;
    setRoomLayersVisible(map, discoveryMode === 'rooms');
    if (discoveryMode === 'people') { renderVisibleMarkers(); return; }
    renderRoomMarkers();
  },[discoveryMode,renderVisibleMarkers,renderRoomMarkers,rooms]);

  // Rooms are also re-rendered on every pan/zoom (mirrors the people-marker moveend/zoomend
  // wiring in the map-init effect), so panning into a new area or zooming into/out of a cluster
  // reflects immediately rather than only on the next `rooms` data change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || discoveryMode !== 'rooms') return;
    const handler = () => renderRoomMarkers();
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => { map.off('moveend', handler); map.off('zoomend', handler); };
  }, [discoveryMode, renderRoomMarkers]);

  const joinSelectedRoom=async()=>{
    if(!selectedRoom)return; setJoiningRoom(true);
    try{const joined=await communityRoomsService.join(selectedRoom.id);setSelectedRoom(null);navigate(`/rooms/${joined.id}`);}finally{setJoiningRoom(false);}
  };

  // Re-skin markers currently on screen when the selection or zoom-driven marker size changes.
  // Cheaper than the full index rebuild above (bounded by "however many markers are visible right
  // now"), but not as targeted as the old per-marker Leaflet re-skin -- see renderVisibleMarkers's
  // own comment for why "clear + rebuild the visible set" was chosen here.
  useEffect(() => {
    if (!mapRef.current || !clusterIndexRef.current) return;
    renderVisibleMarkers();
  }, [selectedUser, frameCatalog, zoomLevel, renderVisibleMarkers]);

  const handleRecenter = async () => {
    nativeHaptics.impact();
    // While Passport is on, the chosen city IS this user's location -- recentring on the device's
    // real GPS would drop them somewhere the rest of the app no longer considers them to be, and
    // would ask for a location permission the feature does not need.
    const passportLat = me?.passportLatitude;
    const passportLng = me?.passportLongitude;
    if (me?.locationMode === 'PASSPORT' && typeof passportLat === 'number' && typeof passportLng === 'number') {
      mapRef.current?.flyTo({ center: [passportLng, passportLat], zoom: LOCATE_ZOOM, duration: FLY_DURATION_MS });
      return;
    }
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

        <div className="pointer-events-auto mt-2 mx-auto flex w-fit items-center rounded-full border border-app bg-surface-95 p-1 shadow-elevated backdrop-blur-xl">
          {(['rooms','people'] as const).map((mode)=><button key={mode} onClick={()=>{setDiscoveryMode(mode);setSelectedRoom(null);closeSheet();}} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-caption font-extrabold transition-colors ${discoveryMode===mode?'bg-brand-gradient text-white shadow-soft':'text-app-muted'}`}>
            {mode==='rooms'?<MessageCircle className="h-4 w-4"/>:<Users className="h-4 w-4"/>}{roomsText(locale,mode)}
          </button>)}
        </div>

        {discoveryMode === 'people' && (
          <div className="pointer-events-auto mt-2 flex max-w-md gap-1.5 overflow-x-auto no-scrollbar mx-auto px-0.5">
            {MAP_GENDER_FILTERS.map((f) => (
              <button
                key={f}
                disabled={updateProfileMutation.isPending}
                onClick={() => {
                  if (f === genderFilter) return;
                  setSavingGenderFilter(f);
                  setSelectedUser(null);
                  updateProfileMutation.mutate(
                    { genderFilter: f },
                    { onSettled: () => setSavingGenderFilter(null) }
                  );
                }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition-colors disabled:opacity-60 ${genderFilter===f?'border-transparent bg-brand-gradient text-white':'border-app bg-surface-95 text-app-muted'}`}
              >
                {t(MAP_GENDER_FILTER_LABEL_KEY[f])}
              </button>
            ))}
          </div>
        )}

        {discoveryMode === 'rooms' && (
          <div className="pointer-events-auto mt-2 flex max-w-md gap-1.5 overflow-x-auto no-scrollbar mx-auto px-0.5">
            {(['ALL','OFFICIAL','TRAVEL','LOCAL','LANGUAGE'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setRoomFilter(f)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-extrabold transition-colors ${roomFilter===f?'border-transparent bg-brand-gradient text-white':'border-app bg-surface-95 text-app-muted'}`}
              >
                {f==='ALL'?roomsText(locale,'filterAll'):f==='OFFICIAL'?roomsText(locale,'filterOfficial'):roomsText(locale,ROOM_CATEGORY_KEY[f as RoomCategory])}
              </button>
            ))}
          </div>
        )}

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
        {/* Status pills — never a full-screen blocker, the map stays interactive underneath.
            These sit in the header's own flow, after the search bar, the rooms/people switch
            and the rooms filter row, instead of at a hand-computed offset. The previous
            top-[calc(var(--safe-top)+4.5rem)] was measured against the search bar alone, so it
            landed directly on top of the rooms/people switch — and any new header row would
            have broken it again. */}
        <div className="mt-2 flex justify-center px-2 pointer-events-none">
          {discoveryMode === 'rooms' && roomsLoading && (
            <div className="rounded-full border border-app bg-surface-95 px-4 py-2 text-caption font-bold text-app-muted shadow-soft backdrop-blur-md">•••</div>
          )}
          {discoveryMode === 'people' && locationStatus === 'pending' && (
            <div className="px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md">
              {t('mapLocatingLabel')}
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
          {isMapUsersLoading && bbox && (
            <div className={`${discoveryMode === 'people' ? '' : 'hidden'} px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md`}>
              {t('mapNearbyLoadingLabel')}
            </div>
          )}
          {/* An empty map has two very different causes and used to give one answer for both.
              With a gender filter on, "nobody here" is usually "nobody here *matching your
              filter*" -- the filter is inherited from the Discover preference, so a user can hit
              an empty map having never knowingly set one, and reads it as the map being broken.
              Naming the filter and offering the widening in the same pill turns a dead end into
              one tap. Same pill geometry and the same text + action shape as the location pills
              above, so the header keeps one vocabulary. */}
          {isEmptyViewport && genderFilter === 'ALL' && (
            <div className={`${discoveryMode === 'people' ? '' : 'hidden'} px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md`}>
              {t('mapNoOneNearbyLabel')}
            </div>
          )}
          {isEmptyViewport && genderFilter !== 'ALL' && (
            <div className={`${discoveryMode === 'people' ? '' : 'hidden'} pointer-events-auto px-4 py-2.5 rounded-2xl bg-surface-95 border border-app text-caption font-semibold text-app shadow-elevated backdrop-blur-md flex items-center gap-3`}>
              <span>{t('mapNoOneMatchesFilterLabel')}</span>
              <button
                disabled={updateProfileMutation.isPending}
                onClick={() => {
                  setSavingGenderFilter('ALL');
                  setSelectedUser(null);
                  updateProfileMutation.mutate(
                    { genderFilter: 'ALL' },
                    { onSettled: () => setSavingGenderFilter(null) }
                  );
                }}
                className="shrink-0 text-pink-500 font-bold disabled:opacity-60"
              >
                {t('mapShowEveryoneAction')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Map visibility — one compact pill that both reports the current state and toggles it.
          Appearing on the map for others is still an explicit, reversible action; it just no
          longer needs a full banner (icon + two text lines + its own button) to say so, which
          also keeps the bottom-right map controls off a tall banner. */}
      {discoveryMode === 'people' && checkedIn !== null && (
        <div className="absolute bottom-28 left-4 z-sticky pointer-events-auto flex flex-col items-start gap-1.5">
          {/* Appearing on the map is opt-in (Apple 5.1.2(i)), so a registration alone never puts
              anyone on it -- which means this control is the entire path onto the map and has to
              read as an offer, not as a status line. Styled as a neutral status pill it was
              routinely missed: users granted location, saw nobody, and assumed the map was
              broken. While hidden it now carries the explanation and the brand gradient every
              other primary action uses; once visible it drops back to a quiet status pill. */}
          {!checkedIn && (
            <span className="max-w-[15rem] rounded-2xl bg-surface-95 border border-app px-3 py-2 text-[11px] font-semibold leading-snug text-app-muted shadow-soft backdrop-blur-md">
              {t('mapNotVisibleSubtitle')}
            </span>
          )}
          <button
            onClick={checkedIn ? hideFromMap : checkInToMap}
            disabled={checkingIn}
            aria-pressed={checkedIn}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-full shadow-elevated backdrop-blur-md text-caption font-bold active:scale-95 transition-transform disabled:opacity-60 ${
              checkedIn
                ? 'bg-surface-95 border border-app text-app'
                : 'bg-brand-gradient border border-transparent text-white'
            }`}
          >
            {/* `bg-app-muted` is not a generated utility (see globals.css) -- use the token. */}
            {checkedIn && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#25D9D0' }} />}
            {checkingIn ? '...' : checkedIn ? t('mapVisibleLabel') : t('mapCheckInButtonLabel')}
            {checkedIn ? <EyeOff className="w-3.5 h-3.5 text-app-muted" /> : <MapPin className="w-3.5 h-3.5 text-white" />}
          </button>
        </div>
      )}

      {/* Floating controls — same baseline as the visibility pill on the opposite side. The old
          bottom-52 was measured to clear the tall "Haritada görünmüyorsun" banner that used to
          live here; that banner is now a pill, so the controls no longer need to float far up
          the map away from the thumb. */}
      <div className="absolute bottom-28 right-4 z-sticky flex flex-col items-end gap-2">
        {discoveryMode === 'rooms' && (
          <button onClick={()=>navigate('/rooms/create')} className="h-12 rounded-full bg-brand-gradient px-4 text-caption font-extrabold text-white shadow-elevated active:scale-95">
            + {roomsText(locale,'createRoom')}
          </button>
        )}
        <IconButton aria-label={t('mapRecenterAriaLabel')} variant="surface" size="lg" onClick={handleRecenter}>
          {locationStatus === 'granted' ? (
            <Compass className="w-6 h-6 text-[#25D9D0]" />
          ) : (
            <LocateFixed className="w-6 h-6 text-[#25D9D0]" />
          )}
        </IconButton>
      </div>


      <BottomSheet isOpen={!!selectedRoom} onClose={()=>setSelectedRoom(null)}>
        {selectedRoom && <div className="space-y-4 px-5 pb-6">
          <div className="flex items-start gap-3">
            <RoomAvatar coverUrl={selectedRoom.coverUrl} official={selectedRoom.isOfficial} className="h-14 w-14" />
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-heading text-app">{selectedRoom.title}</h2>{selectedRoom.isOfficial&&<ShieldCheck className="h-4 w-4 text-[#25D9D0]"/>}</div>
              <p className="text-caption font-semibold text-app-muted">{selectedRoom.city} · {APP_LOCALE_LABELS[selectedRoom.language as AppLocale] || selectedRoom.language} · {roomsText(locale,ROOM_CATEGORY_KEY[selectedRoom.category]||'categoryGeneral')}{selectedRoom.type!=='TEXT'?` · ${selectedRoom.type}`:''}</p></div>
            <button onClick={()=>navigate(`/rooms/${selectedRoom.id}/report`)} aria-label={roomsText(locale,'report')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-app-muted"><MoreHorizontal className="h-5 w-5"/></button>
          </div>
          {selectedRoom.isDemo&&<span className="inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-caption font-extrabold text-amber-500">{roomsText(locale,'officialDemo')}</span>}
          <p className="text-body leading-relaxed text-app">{selectedRoom.topic}</p>
          <div className="flex items-center justify-between"><div className="flex -space-x-3">{selectedRoom.participants.slice(0,6).map((p)=><Avatar key={p.id} src={normalizeMediaUrl(p.photoUrl||undefined)} name={p.name} size="sm" className="rounded-full border-2 border-surface"/>)}</div>
            <span className="text-caption font-bold text-app-muted">{selectedRoom.activeParticipantCount}/{selectedRoom.maxParticipants} {roomsText(locale,'participants')}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-2"><AppButton onClick={joinSelectedRoom} loading={joiningRoom} disabled={selectedRoom.activeParticipantCount>=selectedRoom.maxParticipants} fullWidth>{selectedRoom.activeParticipantCount>=selectedRoom.maxParticipants?roomsText(locale,'roomFull'):roomsText(locale,'joinRoom')}</AppButton>
            <AppButton variant="secondary" onClick={()=>navigate(`/rooms/city/${selectedRoom.cityId}`)} aria-label={roomsText(locale,'cityRooms')}><ChevronRight className="h-5 w-5"/></AppButton></div>
        </div>}
      </BottomSheet>

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

                  {getRelationshipGoalLabels(selectedUserDetail?.relationshipGoals || selectedUserDetail?.relationshipGoal, locale).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {getRelationshipGoalLabels(selectedUserDetail?.relationshipGoals || selectedUserDetail?.relationshipGoal, locale).map((label) => (
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

              {/* V3: the map's direct-contact sheet no longer offers Like/SuperLike as the main
                  action -- Discover's own swipe screen keeps that flow untouched. Here it's
                  View Profile / Follow / Connect (40-coin paid intro), matching the room
                  member-preview sheet exactly (see RoomScreen.tsx's MemberProfileSheet). */}
              <div className="space-y-2 pt-1">
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
                <FollowButton userId={selectedUser.id} className="w-full" />
                <ConnectButton userId={selectedUser.id} locale={locale} sourceType="MAP" />
              </div>
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
