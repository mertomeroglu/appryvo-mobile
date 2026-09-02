import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROOM_CLUSTER_MAX_ZOOM,
  ROOM_CLUSTER_RADIUS,
  buildRoomFeatureCollection,
} from '../src/features/map/roomMapLayers';
import type { CommunityRoom, RoomType } from '../src/services/rooms/communityRoomsService';

const screen = readFileSync(resolve('src/features/map/SocialMapScreen.tsx'), 'utf8');
const layers = readFileSync(resolve('src/features/map/roomMapLayers.ts'), 'utf8');
function room(id: string, type: RoomType): CommunityRoom {
  return {
    id, title: id, topic: '', type, category: 'GENERAL', language: 'tr', cityId: 34,
    city: 'İstanbul', countryId: 'TR', country: 'Türkiye', latitude: 41.01, longitude: 28.97,
    status: 'ACTIVE', maxParticipants: 100, activeParticipantCount: 3, messageCount: 0,
    isOfficial: id === 'text', isDemo: false, participants: [], createdAt: '', updatedAt: '',
  };
}

describe('native MapLibre room clustering', () => {
  it('builds primitive GeoJSON properties for every room type', () => {
    const data = buildRoomFeatureCollection([room('text', 'TEXT'), room('voice', 'VOICE'), room('video', 'VIDEO')], 'voice');
    expect(data.type).toBe('FeatureCollection');
    expect(data.features.map((f) => f.properties.roomType)).toEqual(['TEXT', 'VOICE', 'VIDEO']);
    expect(data.features[1].properties.selected).toBe(true);
    expect(data.features.every((f) => !('room' in f.properties))).toBe(true);
  });
  it('separates privacy-safe city-centroid points after cluster expansion', () => {
    const points = buildRoomFeatureCollection([room('a', 'TEXT'), room('b', 'TEXT')]).features;
    expect(points[0].geometry.coordinates).not.toEqual(points[1].geometry.coordinates);
  });
  it('enables native clustering with a bounded expansion threshold and no individual maxzoom', () => {
    expect(ROOM_CLUSTER_RADIUS).toBeGreaterThanOrEqual(40);
    expect(ROOM_CLUSTER_MAX_ZOOM).toBeLessThan(15);
    expect(layers).toMatch(/cluster:\s*true/);
    expect(layers).not.toMatch(/ROOM_UNCLUSTERED_LAYER_ID[\s\S]{0,500}maxzoom/);
  });
  it('renders cluster counts and expands clusters through the MapLibre API', () => {
    expect(layers).toMatch(/point_count_abbreviated/);
    expect(screen).toMatch(/getClusterExpansionZoom/);
    expect(screen).toMatch(/easeTo/);
  });
  it('keeps room selection behavior and avoids DOM room-marker fanout', () => {
    expect(screen).toMatch(/setSelectedRoom\(room\)/);
    expect(screen).not.toMatch(/roomMarkersRef/);
    ['room-text-icon', 'room-voice-icon', 'room-video-icon'].forEach((icon) => expect(layers).toContain(icon));
  });
});
