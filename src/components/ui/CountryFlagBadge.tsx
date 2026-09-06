import React from 'react';
import { normalizeCountryCode } from '../../lib/countryFlags';
import { AVAILABLE_FLAG_CODES, UNKNOWN_FLAG_CODE, getFlagAssetPath } from '../../lib/flagAssets';
import { cn } from '../../lib/utils';

interface CountryFlagBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  countryCode?: string | null;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  style?: React.CSSProperties;
}

const SIZE_CLASSES = {
  xs: 'h-3.5 w-3.5 border',
  sm: 'h-[18px] w-[18px] border',
  md: 'h-6 w-6 border-2',
};

/**
 * The single shared country-flag renderer used everywhere a profile shows its owner's country
 * (own profile, full profile, profile preview, map profile sheet). Flat circular SVGs vendored
 * locally from HatScripts/circle-flags — never an emoji, never fetched from GitHub at runtime.
 * See THIRD_PARTY_NOTICES.md.
 */
export const CountryFlagBadge: React.FC<CountryFlagBadgeProps> = ({ countryCode, className, size = 'md', style, ...props }) => {
  const code = normalizeCountryCode(countryCode);
  if (!code) return null;
  const assetCode = AVAILABLE_FLAG_CODES.has(code) ? code : UNKNOWN_FLAG_CODE;

  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-surface bg-surface shadow-sm isolate',
        SIZE_CLASSES[size],
        className
      )}
      style={style}
      aria-label={`Ülke: ${code}`}
      title={code}
      {...props}
    >
      <img
        src={getFlagAssetPath(assetCode)}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  );
};
