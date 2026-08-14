import React from 'react';
import { useFramesQuery } from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { cn } from '../../lib/utils';
import { Avatar, AvatarRing } from './Avatar';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface FramedAvatarProps {
  photoUrl?: string | null;
  name?: string;
  activeFrameId?: string | null;
  size?: AvatarSize;
  verified?: boolean;
  className?: string;
}

/**
 * Avatar that renders the user's equipped decorative frame (see ProfileFramesScreen) around
 * their photo. Falls back to the plain brand/verified ring when no frame is equipped ("standard")
 * or the frames catalog hasn't loaded yet. The frame artwork PNGs are wide decorative rings with
 * a transparent circular window in the middle -- they need to render noticeably larger than the
 * avatar itself (~1.7x) so that window lines up with the avatar's edge and the ornamentation
 * (crown, gems, etc.) extends past it, instead of getting clipped to the avatar's own bounds.
 */
export const FramedAvatar: React.FC<FramedAvatarProps> = ({
  photoUrl,
  name,
  activeFrameId,
  size = 'lg',
  verified,
  className,
}) => {
  const { data: framesData } = useFramesQuery();
  const frame =
    activeFrameId && activeFrameId !== 'standard'
      ? framesData?.frames?.find((f: any) => f.id === activeFrameId)
      : null;
  const frameAsset = frame?.circleAsset || frame?.portraitAsset;
  const src = photoUrl ? normalizeMediaUrl(photoUrl) : undefined;

  if (frameAsset) {
    return (
      <div className={cn('relative inline-flex shrink-0', className)}>
        <Avatar src={src} name={name} size={size} />
        <img
          src={normalizeMediaUrl(frameAsset)}
          alt=""
          className="absolute top-1/2 left-1/2 pointer-events-none select-none"
          style={{ width: '175%', height: '175%', transform: 'translate(-50%, -50%)' }}
        />
      </div>
    );
  }

  return (
    <AvatarRing variant={verified ? 'verified' : 'brand'} className={className}>
      <Avatar src={src} name={name} size={size} />
    </AvatarRing>
  );
};
