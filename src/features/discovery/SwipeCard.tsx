import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, useReducedMotion, animate, type PanInfo } from 'framer-motion';
import { Crown, Heart, MapPin, Star, X } from 'lucide-react';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { VerifiedBadge } from '../../components/ui/Badge';
import { DURATION, SPRING } from '../../motion/tokens';
import { getRelationshipGoalLabels, getZodiacLabel, formatDisplayAge } from '../../lib/profileLabels';
import { getLocalizedInterestLabel } from '../../lib/interestLabels';
import { ZodiacIcon } from '../../components/ui/ZodiacIcon';
import { getPhotoUrl } from '../../services/media/mediaService';
import { useAppTranslation } from '../../i18n/appLocale';

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
  relationshipGoals?: string[];
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
  isExiting?: boolean;
  onSwiped: (direction: SwipeDirection, profile: SwipeCardProfile) => void;
  onExitComplete?: (profileId: string) => void;
  canSuperLike?: boolean;
  onSuperLikeUnavailable?: () => void;
  onInfoClick: () => void;
}

function normalizePhotos(profile: SwipeCardProfile): string[] {
  if (Array.isArray(profile.photos) && profile.photos.length > 0) {
    return profile.photos.map((photo) => getPhotoUrl(photo)).filter((url): url is string => Boolean(url));
  }
  return profile.photoUrl ? [profile.photoUrl] : [];
}

const SwipeCardComponent = React.forwardRef<SwipeCardHandle, SwipeCardProps>(function SwipeCard(
  { profile, isTop, isExiting = false, onSwiped, onExitComplete, canSuperLike = true, onSuperLikeUnavailable, onInfoClick },
  ref
) {
  const { locale, t } = useAppTranslation();
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
  const photos = useMemo(() => normalizePhotos(profile).map((url) => normalizeMediaUrl(url)), [profile]);
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(() => new Set());
  const currentPhoto = photos[photoIndex];
  const renderedPhoto = currentPhoto && !failedPhotos.has(currentPhoto)
    ? currentPhoto
    : normalizeMediaUrl(undefined);

  // Guards against the same card being committed twice -- e.g. a drag-release and an action
  // button tap landing in the same event batch, before the parent's re-render flips isTop to
  // false for this card. Safe as a plain ref (no reset effect needed): DiscoverScreen keys
  // each SwipeCard by profile.id, so a genuinely new profile always gets a fresh instance.
  const hasCommittedRef = useRef(false);

  const commit = (direction: SwipeDirection, velocity: { x: number; y: number }) => {
    if (hasCommittedRef.current) return;
    hasCommittedRef.current = true;
    // Commit the local deck before waiting for animation or network. The parent retains this
    // exact keyed component as an exit layer, so the next card can accept input immediately
    // without remounting a zero-position copy of the old card.
    onSwiped(direction, profile);
    const finishSwipe = () => onExitComplete?.(profile.id);

    if (direction === 'up') {
      // Let horizontal drift continue naturally while the vertical exit drives completion.
      animate(x, x.get() + velocity.x * 0.15, { type: 'spring', velocity: velocity.x, stiffness: 260, damping: 26 });
      animate(y, -900, {
        type: 'spring',
        velocity: velocity.y,
        stiffness: 260,
        damping: 26,
        onComplete: finishSwipe,
      });
      return;
    }

    const targetX = direction === 'right' ? 620 : -620;
    animate(x, targetX, {
      type: 'spring',
      velocity: velocity.x,
      stiffness: 220,
      damping: 24,
      onComplete: finishSwipe,
    });
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    const isVerticalIntent = Math.abs(offset.y) > Math.abs(offset.x) * 1.2 && offset.y < 0;

    if (isVerticalIntent && (offset.y < SUPERLIKE_OFFSET_THRESHOLD || velocity.y < SUPERLIKE_VELOCITY_THRESHOLD)) {
      if (!canSuperLike) {
        animate(x, 0, settleSpring);
        animate(y, 0, settleSpring);
        onSuperLikeUnavailable?.();
        return;
      }
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
      img.src = url as string;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop, photoIndex]);

  return (
    <motion.div
      data-moving={isTop || isExiting ? 'true' : 'false'}
      style={{ x, y, rotate, scale: isTop ? superLift : 1 }}
      drag={isTop}
      onDragEnd={isTop ? handleDragEnd : undefined}
      initial={isExiting || isTop ? false : { scale: 0.94, y: 14, opacity: 0.85 }}
      animate={isExiting ? undefined : isTop ? { scale: 1, y: 0, opacity: 1 } : { scale: 0.94, y: 14, opacity: 0.85 }}
      transition={reduceMotion ? { duration: DURATION.micro } : SPRING.soft}
      className={`discovery-swipe-card absolute inset-0 rounded-[30px] overflow-hidden shadow-elevated bg-surface border border-app select-none ${
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
      {currentPhoto ? (
        <img
          src={renderedPhoto}
          alt={profile.name}
          decoding="async"
          loading={isTop ? 'eager' : 'lazy'}
          fetchPriority={isTop ? 'high' : 'low'}
          className="w-full h-full object-cover pointer-events-none"
          draggable={false}
          onError={() => {
            if (currentPhoto !== renderedPhoto) return;
            setFailedPhotos((current) => new Set(current).add(currentPhoto));
          }}
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
            aria-label={t('fullProfilePrevPhotoAriaLabel')}
            className="w-1/2 h-full"
            onTap={() => goPhoto(-1)}
          />
          <motion.button
            aria-label={t('fullProfileNextPhotoAriaLabel')}
            className="w-1/2 h-full"
            onTap={() => goPhoto(1)}
          />
        </div>
      )}

      {/* Intent overlays */}
      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute top-10 left-8 w-16 h-16 rounded-full border-4 border-[#32D583] text-[#32D583] bg-black/45 flex items-center justify-center -rotate-12 shadow-lg z-20 pointer-events-none"
      >
        <Heart className="w-9 h-9 fill-current" />
      </motion.div>
      <motion.div
        style={{ opacity: passOpacity }}
        className="absolute top-10 right-8 w-16 h-16 rounded-full border-4 border-[#FF4B55] text-[#FF4B55] bg-black/45 flex items-center justify-center rotate-12 shadow-lg z-20 pointer-events-none"
      >
        <X className="w-10 h-10 stroke-[3]" />
      </motion.div>
      <motion.div
        style={{ opacity: superOpacity }}
        className="absolute top-10 inset-x-0 mx-auto w-16 h-16 rounded-full border-4 border-[#25D9D0] text-[#25D9D0] bg-black/45 flex items-center justify-center shadow-lg z-20 pointer-events-none"
      >
        <Star className="w-9 h-9 fill-current" />
      </motion.div>

      {/* Info gradient overlay */}
      <motion.div
        onTap={() => onInfoClick()}
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-6 text-white flex flex-col justify-end z-10 cursor-pointer"
      >
        <div className="flex items-baseline gap-2 mb-1">
          <h2 className="text-3xl font-black">{profile.name}</h2>
          {formatDisplayAge(profile.age) !== undefined && <span className="text-2xl font-bold text-gray-300">{formatDisplayAge(profile.age)}</span>}
          {profile.verified && <VerifiedBadge size={22} />}
          {profile.isPremium && <Crown className="w-5 h-5 text-[#F5B942] fill-current" />}
          {profile.activeNow && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#32D583]">
              <span className="w-2 h-2 rounded-full bg-[#32D583]" />
              {t('swipeActiveNowLabel')}
            </span>
          )}
        </div>

        {profile.city && (
          <div className="flex items-center gap-1.5 text-xs text-gray-300 mb-2 flex-wrap">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-pink-500" />
              <span>{t('profileResidenceOtherLabel')}: {profile.city}</span>
              {typeof profile.distanceKm === 'number' && <span>• {t('fullProfileDistanceAwayTemplate').replace('{distance}', String(profile.distanceKm))}</span>}
            </span>
          </div>
        )}

        {profile.isNewMember && (
          <div className="mb-1.5">
            <span className="text-[11px] font-black tracking-wide bg-[#FF4D8D] px-3 py-1 rounded-full text-white shadow-md shadow-pink-500/30">
              {t('swipeNewMemberBadge')}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {profile.zodiac && getZodiacLabel(profile.zodiac, locale) && (
            <span className="flex items-center gap-1 text-[11px] font-semibold bg-black/35 px-3 py-1 rounded-full text-white border border-white/10">
              <ZodiacIcon sign={profile.zodiac} size={13} />
              {getZodiacLabel(profile.zodiac, locale)}
            </span>
          )}
          {getRelationshipGoalLabels(profile.relationshipGoals || profile.relationshipGoal, locale).map((label) => (
            <span key={label} className="text-[11px] font-semibold bg-black/35 px-3 py-1 rounded-full text-white border border-white/10">
              {label}
            </span>
          ))}
          {Array.isArray(profile.interests) &&
            profile.interests.slice(0, 3).map((interest, i) => (
              <span
                key={i}
                className="text-[11px] font-semibold bg-black/35 px-3 py-1 rounded-full text-white border border-white/10"
              >
                {getLocalizedInterestLabel(interest, locale)}
              </span>
            ))}
        </div>
      </motion.div>
    </motion.div>
  );
});

SwipeCardComponent.displayName = 'SwipeCard';

export const SwipeCard = React.memo(
  SwipeCardComponent,
  (previous, next) =>
    previous.profile === next.profile &&
    previous.isTop === next.isTop &&
    previous.isExiting === next.isExiting &&
    previous.canSuperLike === next.canSuperLike
);
