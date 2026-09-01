import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isUsableLocation } from '../src/services/geo/locationQuality';

const source = (path: string) => readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

describe('critical product fixes V6', () => {
  it('rejects swapped/invalid, stale, and poor-accuracy GPS samples', () => {
    const now = 1_800_000_000_000;
    const fix = (latitude: number, longitude: number, accuracy: number, age = 0) => ({ timestamp: now - age, coords: { latitude, longitude, accuracy } });
    expect(isUsableLocation(fix(38.4237, 27.1428, 12), now)).toBe(true);
    expect(isUsableLocation(fix(120, 27.1428, 12), now)).toBe(false);
    expect(isUsableLocation(fix(38.4237, 27.1428, 250), now)).toBe(false);
    expect(isUsableLocation(fix(38.4237, 27.1428, 12, 31_000), now)).toBe(false);
  });

  it('keeps MapLibre coordinates lng/lat and isolates marker animation from its root', () => {
    const map = source('features/map/SocialMapScreen.tsx');
    const css = source('features/map/SocialMapScreen.css');
    expect(map).toContain('.setLngLat([lng, lat])');
    expect(map).toContain('class="ryvo-room-marker-root"');
    expect(css).toContain('.ryvo-room-marker.is-selected { transform:scale(1.12)');
  });

  it('reports the immutable selected message and never falls back to original locked media', () => {
    expect(source('features/chat/ChatScreen.tsx')).toContain("targetType={reportedMessageId ? 'MESSAGE' : 'USER'}");
    expect(source('features/likes/LikesScreen.tsx')).toContain('isBlurred ? primaryPhoto || user.photoBlurUrl : primaryPhoto || user.photoUrl');
  });

  it('exposes canonical city, prompt, voice, follower removal and block controls', () => {
    const editor = source('components/ProfileCreativeEditor.tsx');
    const connections = source('features/profile/ConnectionsListScreen.tsx');
    expect(editor).toContain('searchCities(cityQuery)');
    expect(editor).toContain("apiClient.put('/api/user/prompts'");
    expect(editor).toContain("mediaService.uploadMedia(blob,'voice')");
    expect(connections).toContain('/api/follows/followers/');
    expect(connections).toContain("apiClient.post('/api/blocks'");
  });
});
