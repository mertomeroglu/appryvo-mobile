import {
  getProfileFrameAsset,
  getProfileFramePreviewAsset,
  type ProfileFrameRecord,
} from '../../components/ui/profileFrameGeometry';
import { normalizeMediaUrl } from './mediaService';

const decodedAssets = new Set<string>();
const pendingAssets = new Map<string, Promise<boolean>>();

function scheduleIdle(callback: () => void) {
  if (typeof window === 'undefined') return;
  const requestIdle = (window as typeof window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (requestIdle) requestIdle(callback, { timeout: 2000 });
  else window.setTimeout(callback, 250);
}

export function isProfileFrameAssetDecoded(url?: string | null) {
  return !!url && decodedAssets.has(normalizeMediaUrl(url));
}

export function preloadProfileFrameAsset(url?: string | null, priority: 'high' | 'low' = 'low') {
  if (!url || typeof Image === 'undefined') return Promise.resolve(false);
  const normalizedUrl = normalizeMediaUrl(url);
  if (decodedAssets.has(normalizedUrl)) return Promise.resolve(true);
  const pending = pendingAssets.get(normalizedUrl);
  if (pending) return pending;

  const promise = new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    image.onload = async () => {
      try {
        await image.decode?.();
      } catch {
        // A completed onload is still browser-cached even when decode() is unavailable/rejects.
      }
      decodedAssets.add(normalizedUrl);
      pendingAssets.delete(normalizedUrl);
      resolve(true);
    };
    image.onerror = () => {
      pendingAssets.delete(normalizedUrl);
      resolve(false);
    };
    image.src = normalizedUrl;
  });
  pendingAssets.set(normalizedUrl, promise);
  return promise;
}

export function warmProfileFrameAssets(frames: ProfileFrameRecord[], activeFrameId?: string | null) {
  if (!frames.length) return;
  const selected = frames.find((frame) => frame.id === activeFrameId);
  if (selected) void preloadProfileFrameAsset(getProfileFrameAsset(selected), 'high');

  // The first viewport is tiny WebP artwork. Remaining previews wait for idle time so frame
  // warming never blocks profile data, discovery images, or user interaction.
  frames.slice(0, 4).forEach((frame) => {
    void preloadProfileFrameAsset(getProfileFramePreviewAsset(frame), frame.id === activeFrameId ? 'high' : 'low');
  });
  scheduleIdle(() => {
    frames.slice(4).forEach((frame) => void preloadProfileFrameAsset(getProfileFramePreviewAsset(frame)));
  });
}

export function getProfileFrameCacheSnapshot() {
  return { decoded: decodedAssets.size, pending: pendingAssets.size };
}
