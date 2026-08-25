import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';

describe('decoded profile-frame cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('deduplicates concurrent loads and reuses a decoded asset', async () => {
    let imageInstances = 0;
    class TestImage {
      decoding = '';
      fetchPriority = '';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      decode = vi.fn().mockResolvedValue(undefined);
      constructor() {
        imageInstances += 1;
      }
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', TestImage);

    const { getProfileFrameCacheSnapshot, preloadProfileFrameAsset } = await import('../src/services/media/profileFrameCache');
    const asset = 'https://appryvo.online/assets/frames/circle/frame_circle_crown_01.png';
    const [first, duplicate] = await Promise.all([
      preloadProfileFrameAsset(asset, 'high'),
      preloadProfileFrameAsset(asset, 'high'),
    ]);
    const cached = await preloadProfileFrameAsset(asset, 'high');

    expect(first).toBe(true);
    expect(duplicate).toBe(true);
    expect(cached).toBe(true);
    expect(imageInstances).toBe(1);
    expect(getProfileFrameCacheSnapshot()).toEqual({ decoded: 1, pending: 0 });
  });

  it('renders a selected decoded frame eagerly from the warm cache', async () => {
    class TestImage {
      decoding = '';
      fetchPriority = '';
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      decode = vi.fn().mockResolvedValue(undefined);
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', TestImage);
    const asset = 'https://appryvo.online/assets/frames/circle/frame_circle_ocean_01.png';
    const { preloadProfileFrameAsset } = await import('../src/services/media/profileFrameCache');
    await preloadProfileFrameAsset(asset, 'high');
    const { ProfileAvatarFrame } = await import('../src/components/ui/FramedAvatar');
    const { container } = render(React.createElement(ProfileAvatarFrame, {
      activeFrameId: 'ocean',
      frame: { id: 'ocean', circleAsset: asset },
      name: 'Ryvo',
      size: 'xl',
    }));
    const decoration = container.querySelector('img[aria-hidden="true"]');
    expect(decoration).toHaveAttribute('loading', 'eager');
    expect(decoration).toHaveAttribute('fetchpriority', 'high');
  });
});
