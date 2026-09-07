import React, { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import type { ProfileAvatarSize } from './profileFrameGeometry';

export type AvatarSize = ProfileAvatarSize;

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'w-8 h-8 text-[11px]',
  sm: 'w-10 h-10 text-xs',
  md: 'w-14 h-14 text-sm',
  lg: 'w-20 h-20 text-lg',
  xl: 'w-28 h-28 text-2xl',
  hero: 'w-40 h-40 text-3xl',
};

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string;
  size?: AvatarSize;
  online?: boolean;
}

function initialsFrom(name?: string) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md', online, className, ...props }) => {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [src]);

  return (
    <div className={cn('relative shrink-0', SIZE_CLASSES[size], className)} {...props}>
      {src && !imageFailed ? (
        <img
          src={src}
          alt={name || 'avatar'}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="w-full h-full rounded-full object-cover"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-brand-gradient flex items-center justify-center font-bold text-white">
          {initialsFrom(name)}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 w-1/4 h-1/4 min-w-[10px] min-h-[10px] rounded-full bg-[#32D583] border-2 border-surface" />
      )}
    </div>
  );
};

type RingVariant = 'premium' | 'brand' | 'verified' | 'none';

export interface AvatarRingProps {
  children: React.ReactNode;
  variant?: RingVariant;
  className?: string;
}

const RING_CLASSES: Record<RingVariant, string> = {
  premium: 'bg-gradient-to-tr from-[#F5B942] via-[#FBD98A] to-[#F5B942]',
  brand: 'bg-brand-gradient',
  verified: 'bg-gradient-to-tr from-[#25D9D0] to-[#536DFE]',
  none: 'bg-transparent',
};

export const AvatarRing: React.FC<AvatarRingProps> = ({ children, variant = 'brand', className }) => {
  return (
    <div
      className={cn(
        'inline-flex p-[3px] rounded-full',
        RING_CLASSES[variant],
        className
      )}
    >
      <div className="rounded-full bg-app p-[2px]">{children}</div>
    </div>
  );
};

export interface ProfileImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  radius?: 'card' | 'hero' | 'full';
}

export const ProfileImage: React.FC<ProfileImageProps> = ({ radius = 'card', className, alt, ...props }) => {
  const radiusClass =
    radius === 'hero' ? 'rounded-[30px]' : radius === 'full' ? 'rounded-full' : 'rounded-[24px]';
  return (
    <img
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('w-full h-full object-cover', radiusClass, className)}
      {...props}
    />
  );
};
