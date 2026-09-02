import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { CommunityRoom, RoomType } from '../../services/rooms/communityRoomsService';

export const ROOM_SOURCE_ID = 'ryvo-rooms';
export const ROOM_CLUSTER_LAYER_ID = 'room-clusters';
export const ROOM_CLUSTER_COUNT_LAYER_ID = 'room-cluster-count';
export const ROOM_UNCLUSTERED_LAYER_ID = 'room-unclustered';
export const ROOM_UNCLUSTERED_ICON_LAYER_ID = 'room-unclustered-icon';
export const ROOM_PARTICIPANT_COUNT_LAYER_ID = 'room-participant-count';
export const ROOM_CLUSTER_MAX_ZOOM = 12;
export const ROOM_CLUSTER_RADIUS = 52;

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

// Room coordinates are deliberately city centroids. A tiny deterministic display-only offset
// prevents rooms in the same city from becoming permanently co-located after clusterMaxZoom;
// it never represents or reveals an owner's location.
function displayOffset(id: string): [number, number] {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  const angle = ((hash >>> 0) % 360) * (Math.PI / 180);
  const ring = 0.0012 + (((hash >>> 9) % 5) * 0.00045);
  return [Math.cos(angle) * ring, Math.sin(angle) * ring];
}

export function buildRoomFeatureCollection(rooms: CommunityRoom[], selectedRoomId?: string): RoomFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rooms
      .filter((room) => Number.isFinite(room.latitude) && Number.isFinite(room.longitude))
      .map((room) => {
        const [dx, dy] = displayOffset(room.id);
        return {
          type: 'Feature' as const,
          properties: {
            roomId: room.id,
            roomType: room.type,
            participantCount: room.activeParticipantCount || 0,
            official: Boolean(room.isOfficial),
            selected: room.id === selectedRoomId,
          },
          geometry: { type: 'Point' as const, coordinates: [room.longitude + dx, room.latitude + dy] as [number, number] },
        };
      }),
  };
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

export function installRoomMapLayers(map: MapLibreMap, data: RoomFeatureCollection, visible: boolean): void {
  if (typeof map.getSource !== 'function' || typeof map.addLayer !== 'function') return;
  if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
  (['TEXT', 'VOICE', 'VIDEO'] as RoomType[]).forEach((type) => {
    const id = `room-${type.toLowerCase()}-icon`;
    if (!map.hasImage(id)) map.addImage(id, makeIcon(type), { pixelRatio: 2 });
  });
  if (!map.getSource(ROOM_SOURCE_ID)) {
    map.addSource(ROOM_SOURCE_ID, {
      type: 'geojson',
      data: data as any,
      cluster: true,
      clusterRadius: ROOM_CLUSTER_RADIUS,
      clusterMaxZoom: ROOM_CLUSTER_MAX_ZOOM,
    });
  } else {
    (map.getSource(ROOM_SOURCE_ID) as GeoJSONSource).setData(data as any);
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
