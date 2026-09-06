import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useFramesQuery } from '../../hooks/useQueries';
import { useAuthStore } from '../../stores/useAuthStore';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { cn } from '../../lib/utils';
import { Avatar } from './Avatar';
import { CountryFlagBadge } from './CountryFlagBadge';
import { isProfileFrameAssetDecoded, warmProfileFrameAssets } from '../../services/media/profileFrameCache';
import {
  getProfileFrameAsset,
  getProfileFrameGeometry,
  getProfileFramePreviewAsset,
  getProfileFramePlacement,
  PROFILE_AVATAR_SIZE_PX,
  type ProfileAvatarSize,
  type ProfileFrameRecord,
} from './profileFrameGeometry';

export interface ProfileAvatarFrameProps {
  photoUrl?: string | null;
  name?: string;
  activeFrameId?: string | null;
  frame?: ProfileFrameRecord | null;
  size?: ProfileAvatarSize;
  verified?: boolean;
  online?: boolean;
  countryCode?: string | null;
  showCountryFlag?: boolean;
  className?: string;
  eager?: boolean;
  preferPreview?: boolean;
  onFrameLoad?: () => void;
}

const ProfileFrameCatalogContext = createContext<ProfileFrameRecord[]>([]);

/** One catalog subscription for the app, regardless of how many avatars are on screen. */
export const ProfileFrameCatalogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const activeFrameId = useAuthStore((state) => state.user?.activeFrameId);
  const { data } = useFramesQuery(authenticated);
  const frames = useMemo<ProfileFrameRecord[]>(
    () => Array.isArray(data?.frames) ? data.frames : [],
    [data?.frames]
  );
  useEffect(() => warmProfileFrameAssets(frames, activeFrameId), [activeFrameId, frames]);
  return <ProfileFrameCatalogContext.Provider value={frames}>{children}</ProfileFrameCatalogContext.Provider>;
};

function flagSizeFor(size: ProfileAvatarSize): 'xs' | 'sm' | 'md' {
  if (size === 'xs' || size === 'sm') return 'xs';
  if (size === 'md' || size === 'lg') return 'sm';
  return 'md';
}

/**
 * The single normalized avatar/frame renderer used by catalog and product surfaces.
 * The avatar owns a stable square; decoration may overflow it without changing layout.
 */
export const ProfileAvatarFrame: React.FC<ProfileAvatarFrameProps> = ({
  photoUrl,
  name,
  activeFrameId,
  frame: suppliedFrame,
  size = 'lg',
  verified,
  online,
  countryCode,
  showCountryFlag = false,
  className,
  eager = false,
  preferPreview = false,
  onFrameLoad,
}) => {
  const catalogFrames = useContext(ProfileFrameCatalogContext);
  const resolvedFrame = suppliedFrame || catalogFrames.find((item) => item.id === activeFrameId) || null;
  const resolvedFrameId = resolvedFrame?.id || activeFrameId || 'standard';
  const frameAsset = resolvedFrameId === 'standard'
    ? null
    : preferPreview
      ? getProfileFramePreviewAsset(resolvedFrame)
      : getProfileFrameAsset(resolvedFrame);
  const placement = getProfileFramePlacement(resolvedFrameId);
  const flagAnchor = getProfileFrameGeometry(resolvedFrameId).flagAnchor;
  const [failedAsset, setFailedAsset] = useState<string | null>(null);
  const [loadedAsset, setLoadedAsset] = useState<string | null>(null);
  const assetUrl = frameAsset ? normalizeMediaUrl(frameAsset) : null;
  const showDecoration = Boolean(assetUrl && failedAsset !== assetUrl && loadedAsset === assetUrl);
  const src = photoUrl ? normalizeMediaUrl(photoUrl) : undefined;
  const pixelSize = PROFILE_AVATAR_SIZE_PX[size];

  useEffect(() => {
    setFailedAsset(null);
    setLoadedAsset(assetUrl && isProfileFrameAssetDecoded(assetUrl) ? assetUrl : null);
  }, [assetUrl]);

  return (
    <div
      className={cn('relative inline-flex shrink-0 isolate overflow-visible', className)}
      style={{ width: pixelSize, height: pixelSize }}
      data-profile-avatar-frame={resolvedFrameId}
      data-frame-state={showDecoration ? 'decorative' : 'standard'}
    >
      {!showDecoration && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -inset-[3px] rounded-full',
            verified
              ? 'bg-gradient-to-tr from-aqua to-indigo'
              : 'bg-brand-gradient'
          )}
        />
      )}

      <span className="absolute inset-0 z-10 overflow-hidden rounded-full bg-surface p-[2px]" data-avatar-clip="circular">
        <Avatar src={src} name={name} size={size} className="h-full w-full overflow-hidden rounded-full" />
      </span>

      {assetUrl && failedAsset !== assetUrl && (
        <img
          src={assetUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading={eager || isProfileFrameAssetDecoded(assetUrl) ? 'eager' : 'lazy'}
          fetchPriority={eager || isProfileFrameAssetDecoded(assetUrl) ? 'high' : 'auto'}
          decoding="async"
          onLoad={() => { setLoadedAsset(assetUrl); onFrameLoad?.(); }}
          onError={() => {
            setFailedAsset(assetUrl);
            if (import.meta.env.DEV) console.warn(`[PROFILE FRAME] Asset failed; using Standard: ${resolvedFrameId}`);
          }}
          className={cn('absolute z-20 top-1/2 left-1/2 max-w-none h-auto pointer-events-none select-none transition-opacity duration-150', showDecoration ? 'opacity-100' : 'opacity-0')}
          style={{
            ...placement,
            transformOrigin: 'center',
          }}
        />
      )}

      {online && (
        <span data-avatar-badge="online" className="absolute bottom-0 left-0 z-30 h-[22%] min-h-2.5 w-[22%] min-w-2.5 rounded-full border-2 border-surface bg-success" />
      )}

      {verified && (
        <span data-avatar-badge="verified" className="absolute bottom-0 right-0 z-30 grid h-[24%] min-h-3 w-[24%] min-w-3 place-items-center rounded-full border-2 border-surface bg-aqua text-white">
          <span className="h-1/2 w-1/2 rounded-full bg-white" />
        </span>
      )}

      {showCountryFlag && countryCode && (
        <CountryFlagBadge
          countryCode={countryCode}
          size={flagSizeFor(size)}
          className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
          data-avatar-badge="country"
          style={{ left: `${flagAnchor.x * 100}%`, top: `${flagAnchor.y * 100}%` }}
        />
      )}
    </div>
  );
};

/** Backwards-compatible export; both names use the exact same geometry engine. */
export const FramedAvatar = ProfileAvatarFrame;
