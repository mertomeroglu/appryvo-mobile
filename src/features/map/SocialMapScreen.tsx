import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Search, Compass, Heart, ShieldCheck, LocateFixed, X, Sparkles, Crown } from 'lucide-react';
import {
  useDiscoveryMapQuery,
  useDiscoveryUserQuery,
  useFramesQuery,
  useLikeMutation,
  usePassMutation,
  type MapBbox,
} from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { apiClient } from '../../services/api/apiClient';
import { nativeLocation } from '../../native/location';
import { nativeHaptics } from '../../native/haptics';
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
import { getRelationshipGoalLabels } from '../../lib/profileLabels';
import { SPRING } from '../../motion/tokens';

export interface MapUser {
  id: string;
  name: string;
  city?: string;
  verified?: boolean;
  displayLat: number;
  displayLng: number;
  distance?: string | null;
  photo?: string;
  photoThumbnailUrl?: string;
  activeFrameId?: string;
}

interface SelectedPin {
  users: MapUser[];
}

const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
const DEFAULT_CENTER: [number, number] = [39.0, 35.2]; // Türkiye — shown until location resolves
const DEFAULT_ZOOM = 5.2;
const LOCATE_ZOOM = 13;
const MOVE_DEBOUNCE_MS = 350;

function firstPhoto(u: MapUser): string | undefined {
  // Map markers are at most 48px. Always prefer the server-generated thumbnail and never
  // decode a full profile image for a tiny Leaflet marker.
  return u.photoThumbnailUrl || u.photo;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
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

export function avatarMarkerIcon(user: MapUser, selected: boolean, frames: ProfileFrameRecord[], zoom: number): L.DivIcon {
  const size = markerSizeForZoom(zoom, selected);
  const avatarSize = size - 8;
  const photo = firstPhoto(user);
  const initial = escapeHtml((user.name || '?').charAt(0).toUpperCase());
  const photoTag = photo
    ? `<img src="${escapeHtml(normalizeMediaUrl(photo) || '')}" alt="" class="w-full h-full object-cover" loading="lazy" decoding="async" draggable="false" />`
    : `<div class="w-full h-full flex items-center justify-center text-white font-bold bg-[#3a3a46]">${initial}</div>`;
  const frame = frames.find((item) => item.id === user.activeFrameId);
  const frameAsset = user.activeFrameId && user.activeFrameId !== 'standard' ? getProfileFramePreviewAsset(frame) : null;
  const placement = getProfileFramePlacement(user.activeFrameId);
  const frameTag = frameAsset
    ? `<img src="${escapeHtml(normalizeMediaUrl(frameAsset) || '')}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false" class="absolute z-20 max-w-none h-auto pointer-events-none" style="left:50%;top:50%;width:${placement.width};transform:${placement.transform};transform-origin:center" onerror="this.style.display='none'" />`
    : '';

  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div class="relative flex items-center justify-center" style="width:${size}px;height:${size}px">
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
    `,
  });
}

export function buildSocialClusterHtml(users: MapUser[], count: number): string {
  const faces = users.slice(0, 3).map((user, index) => {
    const photo = firstPhoto(user);
    const initial = escapeHtml((user.name || '?').charAt(0).toUpperCase());
    const content = photo
      ? `<img src="${escapeHtml(normalizeMediaUrl(photo) || '')}" alt="" loading="lazy" decoding="async" draggable="false" style="width:100%;height:100%;object-fit:cover" />`
      : `<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;background:#454554;color:white;font-size:11px;font-weight:800">${initial}</span>`;
    return `<span style="position:absolute;left:${index * 18}px;top:4px;width:30px;height:30px;overflow:hidden;border-radius:9999px;border:2px solid white;background:#454554;box-shadow:0 3px 9px rgba(0,0,0,.28);z-index:${3 - index}">${content}</span>`;
  }).join('');

  return `<div aria-label="${count} kişi bu bölgede" style="position:relative;width:68px;height:44px">
    ${faces}
    <span style="position:absolute;right:0;bottom:0;display:flex;min-width:27px;height:22px;align-items:center;justify-content:center;border-radius:9999px;border:2px solid white;background:linear-gradient(135deg,#ff4d8d,#7957ff);padding:0 6px;color:white;font-size:11px;font-weight:900;box-shadow:0 4px 12px rgba(75,42,130,.35);z-index:5">${count}</span>
  </div>`;
}

function socialClusterIcon(cluster: L.MarkerCluster, usersByMarker: WeakMap<L.Marker, MapUser>): L.DivIcon {
  const users = cluster.getAllChildMarkers()
    .map((marker) => usersByMarker.get(marker))
    .filter((user): user is MapUser => Boolean(user));
  const count = cluster.getChildCount();
  return L.divIcon({
    className: '',
    iconSize: [68, 44],
    iconAnchor: [34, 22],
    html: buildSocialClusterHtml(users, count),
  });
}

function selfLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `
      <div class="relative flex items-center justify-center w-[30px] h-[30px]">
        <div class="absolute w-[30px] h-[30px] rounded-full bg-[#536DFE]/25 animate-ping"></div>
        <div class="relative w-[14px] h-[14px] rounded-full bg-[#536DFE]" style="box-shadow:0 0 0 3px rgba(83,109,254,0.35),0 2px 6px rgba(0,0,0,0.35);border:2px solid white"></div>
      </div>
    `,
  });
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
  const navigate = useNavigate();
  const isDark = useIsDarkMode();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const selfMarkerRef = useRef<L.Marker | null>(null);
  const markersByIdRef = useRef<Map<string, L.Marker>>(new Map());
  const markerUserRef = useRef<WeakMap<L.Marker, MapUser>>(new WeakMap());
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'pending' | 'granted' | 'denied' | 'error'>('pending');
  const [bbox, setBbox] = useState<MapBbox | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [selectedPin, setSelectedPin] = useState<SelectedPin | null>(null);
  const [selectedUser, setSelectedUser] = useState<MapUser | null>(null);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [matchResult, setMatchResult] = useState<{ isOpen: boolean; matchUser?: any; matchId?: string }>({
    isOpen: false,
  });

  const { data: mapUsers, isFetching } = useDiscoveryMapQuery(bbox, 150);
  const { data: selectedUserDetail, isFetching: isDetailFetching } = useDiscoveryUserQuery(selectedUser?.id);
  const { data: framesData } = useFramesQuery();
  const frameCatalog = useMemo<ProfileFrameRecord[]>(
    () => Array.isArray(framesData?.frames) ? framesData.frames : [],
    [framesData?.frames]
  );
  const likeMutation = useLikeMutation();
  const passMutation = usePassMutation();

  const openPin = useCallback((users: MapUser[]) => {
    nativeHaptics.impact();
    setSelectedPin({ users });
    setSelectedUser(users.length === 1 ? users[0] : null);
  }, []);

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

  // Initialize the map exactly once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      // Required on the map instance itself, not just the tile layer: markerClusterGroup
      // calls map.getMaxZoom() as soon as it's added, before the tile layer effect (which
      // only knows its own maxZoom) has run — omitting this throws "Map has no maxZoom
      // specified" and crashes the screen on real devices.
      minZoom: 3,
      maxZoom: 20,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
    });
    mapRef.current = map;

    const cluster = L.markerClusterGroup({
      maxClusterRadius: (zoom) => Math.max(34, Math.min(58, 58 - Math.max(0, zoom - 8) * 3)),
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (c) => socialClusterIcon(c, markerUserRef.current),
    });
    cluster.on('clusterclick', (e: any) => {
      // Clusters behave spatially first: zoom/split while there is map detail left. Only a
      // still-dense max-zoom cluster becomes a people list.
      if (map.getZoom() < map.getMaxZoom()) return;
      const users = (e.layer.getAllChildMarkers() as L.Marker[])
        .map((m) => markerUserRef.current.get(m))
        .filter((u): u is MapUser => Boolean(u));
      if (users.length) openPin(users);
    });
    cluster.addTo(map);
    clusterGroupRef.current = cluster;

    const updateBbox = () => {
      const b = map.getBounds();
      setBbox({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
    };
    map.on('moveend', () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(updateBbox, MOVE_DEBOUNCE_MS);
    });
    map.on('zoomend', () => setZoomLevel(map.getZoom()));
    // Populate the initial viewport immediately rather than waiting on the first user pan.
    updateBbox();

    // Guards against Leaflet measuring a not-yet-laid-out container on route mount, which
    // otherwise renders as blank/grey tiles until the next manual interaction.
    const raf = requestAnimationFrame(() => map.invalidateSize());

    const markersById = markersByIdRef.current;
    return () => {
      cancelAnimationFrame(raf);
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      // Detach image sources before destroying Leaflet. Chromium otherwise keeps decoded tile
      // surfaces alive until a later major GC; repeated map/tab cycles pushed Graphics PSS up by
      // hundreds of MB on the Galaxy A50 even though the React route had already unmounted.
      container?.querySelectorAll('img').forEach((image) => {
        image.removeAttribute('src');
        image.removeAttribute('srcset');
      });
      cluster.clearLayers();
      tileLayerRef.current?.remove();
      map.off();
      map.remove();
      container?.replaceChildren();
      mapRef.current = null;
      clusterGroupRef.current = null;
      tileLayerRef.current = null;
      selfMarkerRef.current = null;
      markersById.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the tile layer with the app theme — same product, different tokens.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    const layer = L.tileLayer(isDark ? TILE_URLS.dark : TILE_URLS.light, {
      attribution: TILE_ATTRIBUTION,
      subdomains: 'abcd',
      maxZoom: 20,
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
    });
    layer.addTo(map);
    layer.bringToBack();
    tileLayerRef.current = layer;
  }, [isDark]);

  const reportLocation = (lat: number, lng: number) => {
    apiClient.post('/api/user/location', { lat, lng }).catch(() => {});
  };

  const acquireLocation = useCallback((recenter: boolean) => {
    setLocationStatus((s) => (s === 'granted' ? s : 'pending'));
    nativeLocation
      .getCurrentPosition()
      .then((pos: any) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        setLocationStatus('granted');
        reportLocation(latitude, longitude);
        if (recenter) mapRef.current?.flyTo([latitude, longitude], LOCATE_ZOOM, { duration: 1.1 });
      })
      .catch((err: any) => {
        setLocationStatus(err?.code === 1 ? 'denied' : 'error');
      });
  }, []);

  useEffect(() => {
    acquireLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Self location marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !coords) return;
    if (selfMarkerRef.current) {
      selfMarkerRef.current.setLatLng([coords.lat, coords.lng]);
    } else {
      selfMarkerRef.current = L.marker([coords.lat, coords.lng], {
        icon: selfLocationIcon(),
        zIndexOffset: 1000,
        interactive: false,
        keyboard: false,
      }).addTo(map);
    }
  }, [coords]);

  // Discovery user markers, re-diffed whenever the viewport query resolves.
  useEffect(() => {
    const cluster = clusterGroupRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    markersByIdRef.current.clear();
    if (!Array.isArray(mapUsers)) return;

    mapUsers.forEach((u: MapUser) => {
      if (typeof u.displayLat !== 'number' || typeof u.displayLng !== 'number') return;
      const marker = L.marker([u.displayLat, u.displayLng], {
        icon: avatarMarkerIcon(u, selectedUser?.id === u.id, frameCatalog, mapRef.current?.getZoom() ?? zoomLevel),
      });
      markerUserRef.current.set(marker, u);
      marker.on('click', () => openPin([u]));
      markersByIdRef.current.set(u.id, marker);
      cluster.addLayer(marker);
    });
    // selectedUser intentionally excluded — handled by the highlight effect below so a
    // selection change doesn't rebuild the whole marker set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCatalog, mapUsers, openPin]);

  // Re-skin only the affected markers when the selection changes.
  useEffect(() => {
    markersByIdRef.current.forEach((marker, id) => {
      const u = markerUserRef.current.get(marker);
      if (!u) return;
      marker.setIcon(avatarMarkerIcon(u, id === selectedUser?.id, frameCatalog, zoomLevel));
    });
  }, [frameCatalog, selectedUser, zoomLevel]);

  const handleRecenter = () => {
    nativeHaptics.impact();
    acquireLocation(true);
  };

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await apiClient.get(`/api/geo/search-cities?query=${encodeURIComponent(searchQuery)}`);
      setCityResults(res?.data || []);
    } catch {
      setCityResults([]);
    }
  };

  const selectCity = (city: any) => {
    setSearchQuery(city.city || city.name || '');
    setCityResults([]);
    if (typeof city.latitude === 'number' && typeof city.longitude === 'number') {
      mapRef.current?.flyTo([city.latitude, city.longitude], LOCATE_ZOOM, { duration: 1.1 });
    }
  };

  const isEmptyViewport = useMemo(
    () => !!bbox && !isFetching && Array.isArray(mapUsers) && mapUsers.length === 0,
    [bbox, isFetching, mapUsers]
  );

  return (
    <div className="relative h-full w-full bg-app text-app overflow-hidden select-none">
      <div ref={containerRef} className="absolute inset-0 z-0" />

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
              placeholder="Şehir veya lokasyon ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-90 backdrop-blur-xl border border-app rounded-full pl-12 pr-4 py-3 text-body font-semibold text-app placeholder:text-app-muted shadow-elevated focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40"
            />
          </form>
        </div>

        {cityResults.length > 0 && (
          <div className="pointer-events-auto mt-2 w-full max-w-md mx-auto bg-surface border border-app rounded-2xl overflow-hidden shadow-floating">
            {cityResults.map((city: any, idx: number) => (
              <button
                key={idx}
                onClick={() => selectCity(city)}
                className="w-full px-4 py-3 text-left border-b border-app last:border-b-0 text-body font-medium text-app hover:bg-surface-elevated flex items-center gap-2"
              >
                <span>{city.city || city.name}</span>
                <span className="text-caption text-app-muted">{city.country}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status pills — never a full-screen blocker, the map stays interactive underneath */}
      <div className="absolute inset-x-0 top-24 z-sticky flex justify-center pointer-events-none px-6">
        {locationStatus === 'pending' && (
          <div className="px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md">
            Konumun alınıyor...
          </div>
        )}
        {locationStatus === 'denied' && (
          <div className="pointer-events-auto px-4 py-2.5 rounded-2xl bg-surface-95 border border-app text-caption font-semibold text-app shadow-elevated backdrop-blur-md flex items-center gap-3">
            <span>Yakındaki kişileri görmek için konum izni gerekiyor.</span>
            <button
              onClick={() => acquireLocation(true)}
              className="shrink-0 text-pink-500 font-bold"
            >
              Tekrar Dene
            </button>
          </div>
        )}
        {locationStatus === 'error' && (
          <div className="pointer-events-auto px-4 py-2.5 rounded-2xl bg-surface-95 border border-app text-caption font-semibold text-app shadow-elevated backdrop-blur-md flex items-center gap-3">
            <span>Konum alınamadı.</span>
            <button onClick={() => acquireLocation(true)} className="shrink-0 text-pink-500 font-bold">
              Tekrar Dene
            </button>
          </div>
        )}
        {isFetching && bbox && locationStatus === 'granted' && (
          <div className="px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md">
            Yakındaki kişiler yükleniyor...
          </div>
        )}
        {isEmptyViewport && (
          <div className="px-4 py-2 rounded-full bg-surface-90 border border-app text-caption font-semibold text-app-muted shadow-soft backdrop-blur-md">
            Bu bölgede henüz kimse yok
          </div>
        )}
      </div>

      {/* Floating controls */}
      <div className="absolute bottom-28 right-4 z-sticky flex flex-col gap-2">
        <IconButton aria-label="Konumuma Dön" variant="surface" size="lg" onClick={handleRecenter}>
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
              <h4 className="text-heading text-app mb-3">{selectedPin.users.length} kişi bu bölgede</h4>
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
                    {selectedUserDetail?.age && (
                      <span className="text-body font-bold text-app-muted">{selectedUserDetail.age}</span>
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
                    {selectedUser.city || 'Yakınlarda'}
                    {selectedUser.distance ? ` • ${selectedUser.distance}` : ''}
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
                Profili Gör
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
