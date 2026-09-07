import React from 'react';
import { Check } from 'lucide-react';
import { normalizeMediaUrl } from '../../services/media/mediaService';

const BRAND_ICON_URL = '/assets/brand/ana_simge.png';

interface RoomAvatarProps {
  coverUrl?: string | null;
  official?: boolean;
  /** Tailwind size classes for the square, e.g. "h-12 w-12". */
  className?: string;
  tickClassName?: string;
}

/**
 * The one place a room's identity is drawn. A room shows its own cover when it has one and the
 * app icon when it does not -- the same icon the map pin uses (roomMapLayers.ts), so a pin and a
 * list row read as the same object. Official rooms carry the verified tick in the corner.
 */
export const RoomAvatar: React.FC<RoomAvatarProps> = ({
  coverUrl,
  official = false,
  className = 'h-12 w-12',
  tickClassName = 'h-3 w-3',
}) => (
  <div className={`relative shrink-0 ${className}`}>
    <div className="h-full w-full overflow-hidden rounded-2xl border border-app bg-surface">
      {coverUrl ? (
        <img
          src={normalizeMediaUrl(coverUrl)}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(event) => { event.currentTarget.src = BRAND_ICON_URL; event.currentTarget.className = 'h-full w-full object-contain p-1.5'; }}
        />
      ) : (
        <img src={BRAND_ICON_URL} alt="" className="h-full w-full object-contain p-1.5" />
      )}
    </div>
    {official && (
      <span
        aria-hidden="true"
        className="absolute -bottom-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-surface bg-[#25D9D0] text-white"
      >
        <Check className={tickClassName} strokeWidth={3.5} />
      </span>
    )}
  </div>
);
