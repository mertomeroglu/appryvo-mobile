export type ProfileAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';

export interface ProfileFrameRecord {
  id: string;
  name?: string;
  circleAsset?: string | null;
  previewAsset?: string | null;
  portraitAsset?: string | null;
  [key: string]: unknown;
}

export interface ProfileFrameGeometry {
  canvasScale: number;
  offsetX: number;
  offsetY: number;
  /** Country-flag centre in avatar-diameter coordinates. */
  flagAnchor: { x: number; y: number };
}

export const PROFILE_AVATAR_SIZE_PX: Record<ProfileAvatarSize, number> = {
  xs: 32,
  sm: 40,
  md: 56,
  lg: 80,
  xl: 112,
  hero: 160,
};

const DEFAULT_GEOMETRY: ProfileFrameGeometry = {
  canvasScale: 1.42,
  offsetX: 0,
  offsetY: 0,
  flagAnchor: { x: 0.91, y: 0.9 },
};

/**
 * Visual-only metadata measured from the alpha channel of the 1024px circle assets.
 * It aligns each real transparent opening with one normalized avatar circle and never
 * enters user data, API persistence, theme state, or screen-specific CSS.
 */
export const PROFILE_FRAME_GEOMETRY: Readonly<Record<string, ProfileFrameGeometry>> = {
  butterfly: { canvasScale: 1.42, offsetX: 0, offsetY: 0.01, flagAnchor: { x: 1.1, y: 0.78 } },
  crown: { canvasScale: 1.44, offsetX: 0, offsetY: -0.024, flagAnchor: { x: 1.1, y: 0.72 } },
  flower: { canvasScale: 1.26, offsetX: -0.008, offsetY: 0.016, flagAnchor: { x: 1.1, y: 0.84 } },
  hearts: { canvasScale: 1.38, offsetX: 0, offsetY: -0.024, flagAnchor: { x: 1.1, y: 0.8 } },
  ocean: { canvasScale: 1.61, offsetX: -0.006, offsetY: 0.06, flagAnchor: { x: 1.1, y: 0.9 } },
  sakura: { canvasScale: 1.48, offsetX: 0, offsetY: 0.032, flagAnchor: { x: 1.1, y: 0.82 } },
};

export function getProfileFrameGeometry(frameId?: string | null): ProfileFrameGeometry {
  if (!frameId || frameId === 'standard') return DEFAULT_GEOMETRY;
  return PROFILE_FRAME_GEOMETRY[frameId] || DEFAULT_GEOMETRY;
}

export function getProfileFrameAsset(frame?: ProfileFrameRecord | null): string | null {
  return frame?.circleAsset || frame?.portraitAsset || null;
}

export function getProfileFramePreviewAsset(frame?: ProfileFrameRecord | null): string | null {
  return frame?.previewAsset || getProfileFrameAsset(frame);
}

export function getProfileFramePlacement(frameId?: string | null): { width: string; transform: string } {
  const geometry = getProfileFrameGeometry(frameId);
  return {
    width: `${geometry.canvasScale * 100}%`,
    // CSS translate percentages are relative to the frame image itself. Divide by the
    // canvas scale so offsetX/Y remain normalized to the avatar diameter as documented.
    transform: `translate(calc(-50% + ${(geometry.offsetX / geometry.canvasScale) * 100}%), calc(-50% + ${(geometry.offsetY / geometry.canvasScale) * 100}%))`,
  };
}
