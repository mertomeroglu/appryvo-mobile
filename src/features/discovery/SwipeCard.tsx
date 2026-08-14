import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion, animate, type PanInfo } from 'framer-motion';
import { Crown, Info, MapPin } from 'lucide-react';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { VerifiedBadge } from '../../components/ui/Badge';
import { DURATION, SPRING } from '../../motion/tokens';
import { getRelationshipGoalLabel, ZODIAC_LABELS } from '../../lib/profileLabels';

const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 500;
const SUPERLIKE_OFFSET_THRESHOLD = -110;
const SUPERLIKE_VELOCITY_THRESHOLD = -500;

export type SwipeDirection = 'left' | 'right' | 'up';

export interface SwipeCardProfile {
  id: string;
  name: string;
  age?: number;
  city?: string;
  distanceKm?: number;
  verified?: boolean;
  isPremium?: boolean;
  zodiac?: string;
  relationshipGoal?: string;
  interests?: string[];
  photos?: any[];
  photoUrl?: string;
  activeNow?: boolean;
  isNewMember?: boolean;
}

export interface SwipeCardHandle {
  triggerSwipe: (direction: SwipeDirection) => void;
}

interface SwipeCardProps {
  profile: SwipeCardProfile;
  isTop: boolean;
  /** True while this card is a departing ghost, still finishing its own fly-off animation
   *  after the deck has already advanced past it. Disables declarative entrance animation
   *  so it doesn't fight the imperative exit tween on the same motion values. */
  isExiting?: boolean;
  onSwiped: (direction: SwipeDirection, profile: SwipeCardProfile) => void;
  /** Fired once the exit fling animation finishes — lets the parent stop rendering the ghost. */
  onExitComplete?: () => void;
  onInfoClick: () => void;
}

function normalizePhotos(profile: SwipeCardProfile): string[] {
  if (Array.isArray(profile.photos) && profile.photos.length > 0) {
    return profile.photos.map((p) => (typeof p === 'object' ? p?.url : p)).filter(Boolean);
  }
  return profile.photoUrl ? [profile.photoUrl] : [];
}

export const SwipeCard = React.forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  { profile, isTop, isExiting, onSwiped, onExitComplete, onInfoClick },
  ref
) {
  const reduceMotion = useReducedMotion();
  // Direct-manipulation drag tracking stays 1:1 with the finger regardless of this setting —
  // only the non-essential bounce/overshoot on settle and stack entrance is dampened.
  const settleSpring = reduceMotion
    ? { type: 'spring' as const, stiffness: 400, damping: 45, mass: 1 }
    : SPRING.swipeCard;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-320, 320], [-16, 16]);
  const likeOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const passOpacity = useTransform(x, [-20, -SWIPE_THRESHOLD], [0, 1]);
  const superOpacity = useTransform(y, [-20, SUPERLIKE_OFFSET_THRESHOLD], [0, 1]);
  const superLift = useTransform(y, [0, SUPERLIKE_OFFSET_THRESHOLD], [1, 1.03]);

  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = normalizePhotos(profile);

  // Guards against the same card being committed twice -- e.g. a drag-release and an action
  // button tap landing in the same event batch, before the parent's re-render flips isTop to
  // false for this card. Safe as a plain ref (no reset effect needed): DiscoverScreen keys
  // each SwipeCard by profile.id, so a genuinely new profile always gets a fresh instance.
  const hasCommittedRef = useRef(false);

  const commit = (direction: SwipeDirection, velocity: { x: number; y: number }) => {
    if (hasCommittedRef.current) return;
    hasCommittedRef.current = true;
    // Advance the deck immediately so the next card becomes interactive right away —
    // the fly-off below is purely a visual tail, not a gate on the next swipe.
    onSwiped(direction, profile);

    if (direction === 'up') {
      // Let horizontal drift continue naturally while the vertical exit drives completion.
      animate(x, x.get() + velocity.x * 0.15, { type: 'spring', velocity: velocity.x, stiffness: 260, damping: 26 });
      animate(y, -900, {
        type: 'spring',
        velocity: velocity.y,
        stiffness: 260,
        damping: 26,
        onComplete: () => onExitComplete?.(),
      });
      return;
    }

    const targetX = direction === 'right' ? 620 : -620;
    animate(x, targetX, {
      type: 'spring',
      velocity: velocity.x,
      stiffness: 220,
      damping: 24,
      onComplete: () => onExitComplete?.(),
    });
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    const isVerticalIntent = Math.abs(offset.y) > Math.abs(offset.x) * 1.2 && offset.y < 0;

    if (isVerticalIntent && (offset.y < SUPERLIKE_OFFSET_THRESHOLD || velocity.y < SUPERLIKE_VELOCITY_THRESHOLD)) {
      commit('up', velocity);
      return;
    }
    if (offset.x > SWIPE_THRESHOLD || velocity.x > VELOCITY_THRESHOLD) {
      commit('right', velocity);
      return;
    }
    if (offset.x < -SWIPE_THRESHOLD || velocity.x < -VELOCITY_THRESHOLD) {
      commit('left', velocity);
      return;
    }

    animate(x, 0, settleSpring);
    animate(y, 0, settleSpring);
  };

  useImperativeHandle(ref, () => ({
    triggerSwipe: (direction: SwipeDirection) => commit(direction, { x: 0, y: 0 }),
  }));

  const goPhoto = (dir: 1 | -1) => {
    setPhotoIndex((i) => Math.min(Math.max(i + dir, 0), Math.max(photos.length - 1, 0)));
  };

  // Warm the neighboring photos so tapping next/previous never shows a blank frame.
  useEffect(() => {
    if (!isTop) return;
    [photos[photoIndex + 1], photos[photoIndex - 1]].filter(Boolean).forEach((url) => {
      const img = new window.Image();
      img.src = normalizeMediaUrl(url as string);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop, photoIndex]);

  return (
    <motion.div
      style={{ x, y, rotate, scale: isTop ? superLift : 1 }}
      drag={isTop}
      onDragEnd={isTop ? handleDragEnd : undefined}
      initial={isExiting || isTop ? false : { scale: 0.94, y: 14, opacity: 0.85 }}
      animate={isExiting ? undefined : isTop ? { scale: 1, y: 0, opacity: 1 } : { scale: 0.94, y: 14, opacity: 0.85 }}
      transition={reduceMotion ? { duration: DURATION.micro } : SPRING.soft}
      className={`absolute inset-0 rounded-[30px] overflow-hidden shadow-floating bg-surface border border-app select-none ${
        // Tailwind compiles pointer-events-none after pointer-events-auto, so with equal
        // specificity -none always wins the cascade if both classes are ever present at once
        // regardless of order in this string -- the previous version always included
        // pointer-events-none unconditionally, which silently made the top card (and every
        // descendant that doesn't set its own pointer-events) permanently non-interactive for
        // real touch/drag, even though action buttons still worked via the imperative ref.
        // Keeping the two classes mutually exclusive is the only order-proof fix.
        isTop ? 'cursor-grab active:cursor-grabbing pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {photos[photoIndex] ? (
        <img
          src={normalizeMediaUrl(photos[photoIndex])}
          alt={profile.name}
          decoding="async"
          className="w-full h-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full bg-app-secondary" />
      )}

      {/* Photo navigation progress dashes */}
      {photos.length > 1 && (
        <div className="absolute top-3.5 inset-x-3.5 flex gap-1.5 z-20">
          {photos.map((_, i) => (
            <div
              key={i}
              className={`h-[3px] flex-1 rounded-full transition-colors ${
                i === photoIndex ? 'bg-white' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      )}

      {/* Tap zones for photo navigation (top card only). Uses Framer's own onTap gesture
          (not native onClick) -- Framer arbitrates tap-vs-drag internally across a gesture
          tree that shares a draggable ancestor, so a genuine tap always changes photo while a
          real horizontal/vertical drag still swipes the card, even when the drag started
          inside this same region. Native onClick + stopPropagation can't achieve this: Framer's
          drag listener is bound directly on the card's DOM node and sees pointerdown before
          React's synthetic bubble phase ever runs. */}
      {isTop && photos.length > 1 && (
        <div className="absolute inset-x-0 top-0 h-[78%] flex z-10">
          <motion.button
            aria-label="Önceki fotoğraf"
            className="w-1/2 h-full"
            onTap={() => goPhoto(-1)}
          />
          <motion.button
            aria-label="Sonraki fotoğraf"
            className="w-1/2 h-full"
            onTap={() => goPhoto(1)}
          />
        </div>
      )}

      {/* Info button */}
      <motion.button
        onTap={() => onInfoClick()}
        className="absolute top-4 right-4 p-2.5 rounded-full bg-black/40 text-white backdrop-blur-md z-20"
      >
        <Info className="w-5 h-5" />
      </motion.button>

      {/* Intent overlays */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute top-8 left-8 border-4 border-[#32D583] text-[#32D583] px-6 py-2 rounded-2xl font-black text-3xl tracking-widest -rotate-12 shadow-lg z-20 pointer-events-none"
      >
        BEĞENDİN
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="absolute top-8 right-8 border-4 border-[#FF4B55] text-[#FF4B55] px-6 py-2 rounded-2xl font-black text-3xl tracking-widest rotate-12 shadow-lg z-20 pointer-events-none"
      >
        PAS
      </motion.div>
      <motion.div
        style={{ opacity: superOpacity }}
        className="absolute top-8 inset-x-0 mx-auto w-fit border-4 border-[#25D9D0] text-[#25D9D0] px-6 py-2 rounded-2xl font-black text-3xl tracking-widest shadow-lg z-20 pointer-events-none"
      >
        SÜPER
      </motion.div>

      {/* Info gradient overlay */}
      <motion.div
        onTap={() => onInfoClick()}
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-6 text-white flex flex-col justify-end z-10 cursor-pointer"
      >
        <div className="flex items-baseline gap-2 mb-1">
          <h2 className="text-3xl font-black">{profile.name}</h2>
          {profile.age && <span className="text-2xl font-bold text-gray-300">{profile.age}</span>}
          {profile.verified && <VerifiedBadge size={22} />}
          {profile.isPremium && <Crown className="w-5 h-5 text-[#F5B942] fill-current" />}
          {profile.activeNow && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#32D583]">
              <span className="w-2 h-2 rounded-full bg-[#32D583]" />
              Şimdi Aktif
            </span>
          )}
        </div>

        {profile.city && (
          <div className="flex items-center gap-1.5 text-xs text-gray-300 mb-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-pink-500" />
              <span>{profile.city}</span>
              {typeof profile.distanceKm === 'number' && <span>• {profile.distanceKm} km uzakta</span>}
            </span>
          </div>
        )}

        {profile.isNewMember && (
          <div className="mb-1.5">
            <span className="text-[11px] font-black tracking-wide bg-[#FF4D8D] px-3 py-1 rounded-full text-white shadow-md shadow-pink-500/30">
              ✨ YENİ ÜYE
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {profile.zodiac && ZODIAC_LABELS[profile.zodiac] && (
            <span className="text-[11px] font-semibold bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/10">
              {ZODIAC_LABELS[profile.zodiac]}
            </span>
          )}
          {getRelationshipGoalLabel(profile.relationshipGoal) && (
            <span className="text-[11px] font-semibold bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/10">
              {getRelationshipGoalLabel(profile.relationshipGoal)}
            </span>
          )}
          {Array.isArray(profile.interests) &&
            profile.interests.slice(0, 3).map((interest, i) => (
              <span
                key={i}
                className="text-[11px] font-semibold bg-white/15 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/10"
              >
                {interest}
              </span>
            ))}
        </div>
      </motion.div>
    </motion.div>
  );
});
