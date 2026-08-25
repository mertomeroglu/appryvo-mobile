import { fireEvent, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ProfileAvatarFrame } from '../src/components/ui/FramedAvatar';
import {
  getProfileFramePlacement,
  PROFILE_AVATAR_SIZE_PX,
  PROFILE_FRAME_GEOMETRY,
  type ProfileFrameRecord,
} from '../src/components/ui/profileFrameGeometry';

vi.mock('../src/hooks/useQueries', () => ({
  useFramesQuery: () => ({ data: { frames: [] } }),
}));

const frame = (id: string): ProfileFrameRecord => ({
  id,
  name: id,
  circleAsset: `/assets/frames/circle/frame_circle_${id}_01.png`,
});

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('normalized profile-frame geometry', () => {
  it('defines one stable 32/40/56/80/112/160 avatar size system', () => {
    expect(PROFILE_AVATAR_SIZE_PX).toEqual({ xs: 32, sm: 40, md: 56, lg: 80, xl: 112, hero: 160 });
  });

  it('uses measured per-frame geometry instead of a global 175% scale', () => {
    expect(Object.keys(PROFILE_FRAME_GEOMETRY).sort()).toEqual(
      ['butterfly', 'crown', 'flower', 'hearts', 'ocean', 'sakura']
    );

    for (const geometry of Object.values(PROFILE_FRAME_GEOMETRY)) {
      expect(geometry.canvasScale).toBeGreaterThanOrEqual(1.25);
      expect(geometry.canvasScale).toBeLessThanOrEqual(1.61);
      expect(geometry.canvasScale).not.toBe(1.75);
      expect(geometry.flagAnchor.x).toBeGreaterThanOrEqual(1.08);
      expect(geometry.flagAnchor.x).toBeLessThanOrEqual(1.12);
      expect(geometry.flagAnchor.y).toBeGreaterThanOrEqual(0.35);
      expect(geometry.flagAnchor.y).toBeLessThanOrEqual(1.02);
    }
  });

  it.each(['butterfly', 'crown', 'flower', 'hearts', 'ocean', 'sakura'])('%s renders one centered frame layer', (id) => {
    const { container } = render(
      <ProfileAvatarFrame photoUrl="/avatar.jpg" name="Ryvo" activeFrameId={id} frame={frame(id)} size="md" />
    );
    const root = container.querySelector('[data-profile-avatar-frame]') as HTMLElement;
    const decoration = container.querySelector('img[aria-hidden="true"]') as HTMLImageElement;
    const placement = getProfileFramePlacement(id);

    expect(root.dataset.profileAvatarFrame).toBe(id);
    expect(root.dataset.frameState).toBe('decorative');
    expect(root.style.width).toBe('56px');
    expect(root.style.height).toBe('56px');
    expect(decoration.style.width).toBe(placement.width);
    expect(decoration.style.transform).toBe(placement.transform);
  });

  it('falls back to the normalized Standard ring when a decorative asset fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <ProfileAvatarFrame photoUrl="/avatar.jpg" activeFrameId="ocean" frame={frame('ocean')} size="lg" />
    );
    const decoration = container.querySelector('img[aria-hidden="true"]') as HTMLImageElement;
    fireEvent.error(decoration);
    expect(container.querySelector('[data-frame-state="standard"]')).toBeInTheDocument();
    expect(container.querySelector('img[aria-hidden="true"]')).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('routes every required UI surface through the shared renderer/geometry engine', () => {
    const consumers = [
      'src/features/profile/OwnProfileScreen.tsx',
      'src/features/frames/ProfileFramesScreen.tsx',
      'src/features/discovery/FullProfileScreen.tsx',
      'src/features/map/SocialMapScreen.tsx',
      'src/features/chat/MessagesScreen.tsx',
      'src/features/chat/ChatScreen.tsx',
      'src/components/MatchModal.tsx',
    ];
    for (const file of consumers) {
      expect(source(file)).toMatch(/ProfileAvatarFrame|getProfileFramePlacement/);
    }
    expect(source('src/features/frames/ProfileFramesScreen.tsx')).toContain('frame={f}');
    expect(source('src/components/ui/FramedAvatar.tsx')).not.toContain("width: '175%'");
  });

  it('carries equipped frame ids through map and match API DTOs', () => {
    const discovery = source('../web/server/api/src/discovery_controller.js');
    const matches = source('../web/server/api/src/matches_controller.js');
    expect(discovery).toContain("activeFrameId: row.active_frame_id || 'standard'");
    expect(matches).toContain("activeFrameId: row.active_frame_id || 'standard'");
  });
});
