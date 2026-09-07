import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { CommunityRoom, RoomType } from '../../services/rooms/communityRoomsService';

export const ROOM_SOURCE_ID = 'ryvo-rooms';
export const ROOM_CLUSTER_LAYER_ID = 'room-clusters';
export const ROOM_CLUSTER_COUNT_LAYER_ID = 'room-cluster-count';
export const ROOM_UNCLUSTERED_LAYER_ID = 'room-unclustered';
export const ROOM_UNCLUSTERED_ICON_LAYER_ID = 'room-unclustered-icon';
export const ROOM_PARTICIPANT_COUNT_LAYER_ID = 'room-participant-count';
// Rooms are anchored to city centroids, so every room in a city sits on the exact same point.
// That makes the useful grouping "per city", not "whatever happens to be within N pixels": a
// radius wide enough to merge neighbouring cities drew the marker at the cluster's centroid --
// a spot that belongs to no city and, for Antalya+Fethiye+Marmaris, landed in the sea. It also
// moved as soon as the visible set changed, which is what looked like drifting pins.
//
// A tiny radius still groups co-located rooms (identical points are 0px apart, so any radius
// catches them) while leaving separate cities separate at every usable zoom.
export const ROOM_CLUSTER_RADIUS = 2;
// Past this zoom a group would split back into a stack of pins on one coordinate, which is worth
// nothing to look at and nothing to tap. Keeping it above the map's own max zoom means a city's
// rooms stay one marker, and tapping it opens that city's room list.
export const ROOM_CLUSTER_MAX_ZOOM = 16;

export interface RoomPointProperties {
  roomId: string;
  roomType: RoomType;
  participantCount: number;
  official: boolean;
  selected: boolean;
}

export interface RoomFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: RoomPointProperties;
    geometry: { type: 'Point'; coordinates: [number, number] };
  }>;
}

export function buildRoomFeatureCollection(rooms: CommunityRoom[], selectedRoomId?: string): RoomFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rooms
      .filter((room) => Number.isFinite(room.latitude) && Number.isFinite(room.longitude))
      .map((room) => {
        return {
          type: 'Feature' as const,
          properties: {
            roomId: room.id,
            roomType: room.type,
            participantCount: room.activeParticipantCount || 0,
            official: Boolean(room.isOfficial),
            selected: room.id === selectedRoomId,
          },
          geometry: { type: 'Point' as const, coordinates: [room.longitude, room.latitude] as [number, number] },
        };
      }),
  };
}

// Official rooms carry the app icon rather than a generic chat glyph, with the verified tick in
// the corner -- the same pairing the room list and the room sheet use, so a pin on the map and a
// row in a list are recognisably the same thing.
export const ROOM_BRAND_ICON_URL = '/assets/brand/ana_simge.png';
const ICON_PX = 40;
let brandIconPromise: Promise<ImageData | null> | null = null;

function drawOfficialTick(ctx: CanvasRenderingContext2D): void {
  const cx = ICON_PX - 10;
  const cy = ICON_PX - 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = '#25D9D0';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(cx - 3.6, cy + 0.2);
  ctx.lineTo(cx - 1.1, cy + 2.8);
  ctx.lineTo(cx + 3.8, cy - 3.1);
  ctx.stroke();
}

// Resolves to null (rather than rejecting) when the asset cannot be read -- callers keep the
// glyph they already registered instead of the pin losing its icon entirely.
function loadBrandIcon(): Promise<ImageData | null> {
  if (brandIconPromise) return brandIconPromise;
  brandIconPromise = new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(null); return; }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = ICON_PX;
      canvas.height = ICON_PX;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 1, 1, ICON_PX - 12, ICON_PX - 12);
      drawOfficialTick(ctx);
      resolve(ctx.getImageData(0, 0, ICON_PX, ICON_PX));
    };
    img.onerror = () => resolve(null);
    img.src = ROOM_BRAND_ICON_URL;
  });
  return brandIconPromise;
}

function makeIcon(type: RoomType): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new ImageData(40, 40);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (type === 'VOICE') {
    ctx.strokeRect(16, 8, 8, 16);
    ctx.beginPath(); ctx.arc(20, 20, 11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, 31); ctx.lineTo(20, 35); ctx.stroke();
  } else if (type === 'VIDEO') {
    ctx.strokeRect(7, 11, 19, 18);
    ctx.beginPath(); ctx.moveTo(26, 17); ctx.lineTo(34, 13); ctx.lineTo(34, 27); ctx.lineTo(26, 23); ctx.closePath(); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.roundRect(6, 8, 28, 22, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, 30); ctx.lineTo(9, 35); ctx.lineTo(20, 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, 18); ctx.lineTo(27, 18); ctx.moveTo(13, 23); ctx.lineTo(23, 23); ctx.stroke();
  }
  return ctx.getImageData(0, 0, 40, 40);
}

// MapLibre re-clusters a GeoJSON source from scratch on every setData, and a cluster is drawn at
// the centroid of its members -- so calling setData with identical data still makes every cluster
// bubble recompute and visibly shift. installRoomMapLayers runs on each map idle, so without this
// guard the room pins drifted around on every pan even though nothing about the rooms changed.
const lastDataSignature = new WeakMap<MapLibreMap, string>();

function dataSignature(data: RoomFeatureCollection): string {
  return data.features
    .map((f) => `${f.properties.roomId}:${f.properties.participantCount}:${f.properties.selected ? 1 : 0}`)
    .join('|');
}

export function installRoomMapLayers(map: MapLibreMap, data: RoomFeatureCollection, visible: boolean): void {
  if (typeof map.getSource !== 'function' || typeof map.addLayer !== 'function') return;
  if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
  const iconIds = (['TEXT', 'VOICE', 'VIDEO'] as RoomType[]).map((type) => {
    const id = `room-${type.toLowerCase()}-icon`;
    if (!map.hasImage(id)) map.addImage(id, makeIcon(type), { pixelRatio: 2 });
    return id;
  });
  // Registered synchronously above so the layer never references a missing image, then swapped
  // for the branded one the moment the asset decodes.
  void loadBrandIcon().then((branded) => {
    if (!branded || typeof map.updateImage !== 'function') return;
    iconIds.forEach((id) => { if (map.hasImage(id)) map.updateImage(id, branded); });
  });
  if (!map.getSource(ROOM_SOURCE_ID)) {
    map.addSource(ROOM_SOURCE_ID, {
      type: 'geojson',
      data: data as any,
      cluster: true,
      clusterRadius: ROOM_CLUSTER_RADIUS,
      clusterMaxZoom: ROOM_CLUSTER_MAX_ZOOM,
    });
    lastDataSignature.set(map, dataSignature(data));
  } else {
    const signature = dataSignature(data);
    if (lastDataSignature.get(map) !== signature) {
      (map.getSource(ROOM_SOURCE_ID) as GeoJSONSource).setData(data as any);
      lastDataSignature.set(map, signature);
    }
  }
  if (!map.getLayer(ROOM_CLUSTER_LAYER_ID)) map.addLayer({
    id: ROOM_CLUSTER_LAYER_ID, type: 'circle', source: ROOM_SOURCE_ID, filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#24cfc8', 10, '#6f5bea', 30, '#ff4d8d'],
      'circle-radius': ['step', ['get', 'point_count'], 21, 10, 26, 30, 31],
      'circle-stroke-width': 3, 'circle-stroke-color': 'rgba(255,255,255,.94)',
      'circle-blur': 0.04,
    },
  });
  if (!map.getLayer(ROOM_CLUSTER_COUNT_LAYER_ID)) map.addLayer({
    id: ROOM_CLUSTER_COUNT_LAYER_ID, type: 'symbol', source: ROOM_SOURCE_ID, filter: ['has', 'point_count'],
    layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 13, 'text-font': ['Noto Sans Bold'] },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.18)', 'text-halo-width': 1 },
  });
  if (!map.getLayer(ROOM_UNCLUSTERED_LAYER_ID)) map.addLayer({
    id: ROOM_UNCLUSTERED_LAYER_ID, type: 'circle', source: ROOM_SOURCE_ID, filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': ['match', ['get', 'roomType'], 'VOICE', '#7857e8', 'VIDEO', '#ff4d8d', '#22bdb7'],
      'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 24, 19],
      'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 5, ['boolean', ['get', 'official'], false], 3, 2],
      'circle-stroke-color': ['case', ['boolean', ['get', 'selected'], false], '#ffd75e', '#ffffff'],
    },
  });
  if (!map.getLayer(ROOM_UNCLUSTERED_ICON_LAYER_ID)) map.addLayer({
    id: ROOM_UNCLUSTERED_ICON_LAYER_ID, type: 'symbol', source: ROOM_SOURCE_ID, filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['match', ['get', 'roomType'], 'VOICE', 'room-voice-icon', 'VIDEO', 'room-video-icon', 'room-text-icon'],
      'icon-size': 0.72, 'icon-allow-overlap': true,
    },
  });
  if (!map.getLayer(ROOM_PARTICIPANT_COUNT_LAYER_ID)) map.addLayer({
    id: ROOM_PARTICIPANT_COUNT_LAYER_ID, type: 'symbol', source: ROOM_SOURCE_ID,
    filter: ['all', ['!', ['has', 'point_count']], ['>', ['get', 'participantCount'], 0]],
    layout: { 'text-field': ['to-string', ['get', 'participantCount']], 'text-size': 10, 'text-offset': [1.45, 1.2], 'text-allow-overlap': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#171723', 'text-halo-width': 2 },
  });
  setRoomLayersVisible(map, visible);
}

export function setRoomLayersVisible(map: MapLibreMap, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none';
  [ROOM_CLUSTER_LAYER_ID, ROOM_CLUSTER_COUNT_LAYER_ID, ROOM_UNCLUSTERED_LAYER_ID, ROOM_UNCLUSTERED_ICON_LAYER_ID, ROOM_PARTICIPANT_COUNT_LAYER_ID]
    .forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility); });
}
