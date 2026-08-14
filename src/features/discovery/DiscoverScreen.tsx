import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Heart, SlidersHorizontal, Star, X, Zap } from 'lucide-react';
import { useDiscoveryFeedQuery, useInAppNotificationsQuery, useLikeMutation, usePassMutation } from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { MatchModal } from '../../components/MatchModal';
import { FilterBottomSheet } from '../../components/FilterBottomSheet';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { nativeHaptics } from '../../native/haptics';
import { toast } from '../../stores/useToastStore';
import { SwipeCard, type SwipeCardHandle, type SwipeCardProfile, type SwipeDirection } from './SwipeCard';

const PAGE_LIMIT = 20;
const PREFETCH_THRESHOLD = 3;

export const DiscoverScreen: React.FC = () => {
  const [deck, setDeck] = useState<SwipeCardProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [matchResult, setMatchResult] = useState<{ isOpen: boolean; matchUser?: any; matchId?: string }>({
    isOpen: false,
  });

  const navigate = useNavigate();
  const { data: feedPage, isLoading, isFetching, refetch } = useDiscoveryFeedQuery(page, PAGE_LIMIT);
  const { data: notificationsData } = useInAppNotificationsQuery();
  const likeMutation = useLikeMutation();
  const passMutation = usePassMutation();
  const topCardRef = useRef<SwipeCardHandle>(null);
  const actionLockRef = useRef(false);
  const unreadNotificationCount = notificationsData?.unreadCount || 0;

  // Append newly-fetched pages to the local deck in the order the server returned them.
  // Never re-sort/filter locally — the server owns ranking.
  useEffect(() => {
    if (!Array.isArray(feedPage)) return;
    setDeck((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const additions = feedPage.filter((p: SwipeCardProfile) => !seen.has(p.id));
      return page === 1 ? feedPage : [...prev, ...additions];
    });
    if (feedPage.length < PAGE_LIMIT) setHasMore(false);
  }, [feedPage, page]);

  // Prefetch the next page as the deck runs low, instead of refetching on every swipe.
  useEffect(() => {
    if (!hasMore || isFetching) return;
    if (deck.length - currentIndex <= PREFETCH_THRESHOLD) {
      setPage((p) => p + 1);
    }
  }, [currentIndex, deck.length, hasMore, isFetching]);

  // Departing cards still finishing their own fly-off animation after the deck has already
  // advanced past them. An array (not a single slot) so rapid consecutive swipes — now
  // possible since input is no longer gated on exit animations — can overlap in flight.
  const [exitingCards, setExitingCards] = useState<SwipeCardProfile[]>([]);

  const visibleCards = useMemo(() => deck.slice(currentIndex, currentIndex + 2), [deck, currentIndex]);
  const currentProfile = visibleCards[0];

  // Warm the browser cache for the next card's first photo only -- so the card behind the
  // current one never shows a blank frame mid-swipe, without preloading the whole deck.
  useEffect(() => {
    const nextProfile = visibleCards[1];
    const nextPhoto = Array.isArray(nextProfile?.photos)
      ? (nextProfile.photos[0] as any)?.url || nextProfile.photos[0]
      : nextProfile?.photoUrl;
    if (!nextPhoto) return;
    const img = new Image();
    img.src = normalizeMediaUrl(nextPhoto);
  }, [visibleCards]);

  const handleExitComplete = (id: string) => {
    setExitingCards((cur) => cur.filter((p) => p.id !== id));
  };

  const handleSwiped = async (direction: SwipeDirection, profile: SwipeCardProfile) => {
    nativeHaptics.impact();
    // Advance the deck (and thus which card is interactive) immediately — departing cards
    // keep rendering separately below purely to finish their own fly-off animation.
    setCurrentIndex((i) => i + 1);
    setExitingCards((cur) => [...cur, profile]);
    // Safety net: the exit spring normally clears itself via onExitComplete once its own
    // animation finishes, but a burst of near-simultaneous swipes can occasionally leave one
    // stuck (observed under rapid automated multi-touch testing) -- this guarantees a ghost
    // card is never left rendered indefinitely, well after any real exit animation would have
    // finished on its own.
    setTimeout(() => handleExitComplete(profile.id), 1200);

    if (direction === 'right' || direction === 'up') {
      try {
        const res: any = await likeMutation.mutateAsync({
          targetUserId: profile.id,
          isSuperLike: direction === 'up',
        });
        // The backend returns { status, isMatch, matchId } directly (no `data` wrapper, no
        // `matchUser` -- it never had one to send), so build the match-modal profile locally.
        if (res?.isMatch) {
          setMatchResult({
            isOpen: true,
            matchUser: profile,
            matchId: res.matchId,
          });
        }
      } catch (err: any) {
        console.error('[LIKE ERROR]', err);
        // The card has already visually flown off by this point (intentional -- see the
        // comment above) so a failed request needs an explicit toast, otherwise a rejected
        // Super Like (e.g. out of credits) silently does nothing and the user never finds out.
        toast.error(err?.message || 'İşlem tamamlanamadı.');
      }
    } else {
      try {
        await passMutation.mutateAsync(profile.id);
      } catch (err: any) {
        console.error('[PASS ERROR]', err);
        toast.error(err?.message || 'İşlem tamamlanamadı.');
      }
    }
  };

  // Same-frame duplicate-tap guard (e.g. a WebView firing both a touch and a simulated mouse
  // click for one physical tap) -- released next animation frame, so legitimate rapid
  // consecutive swipes on the newly-interactive card are never delayed.
  const handleAction = (direction: SwipeDirection) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    topCardRef.current?.triggerSwipe(direction);
    requestAnimationFrame(() => {
      actionLockRef.current = false;
    });
  };

  const handleReset = () => {
    setDeck([]);
    setCurrentIndex(0);
    setPage(1);
    setHasMore(true);
    refetch();
  };

  const isInitialLoading = isLoading && deck.length === 0;

  return (
    <div className="relative h-full w-full bg-app text-app flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar Header */}
      <header className="pt-safe px-4 h-16 flex items-center justify-between z-sticky bg-app/80 backdrop-blur-md">
        <AppLogo variant="icon" size="sm" />

        <div className="flex items-center gap-2">
          <IconButton aria-label="Bildirimler" variant="surface" size="md" onClick={() => navigate('/notifications')} className="relative">
            <Bell className="w-5 h-5" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-gradient text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-app">
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </IconButton>
          <IconButton aria-label="Filtreler" variant="surface" size="md" onClick={() => setIsFilterOpen(true)}>
            <SlidersHorizontal className="w-5 h-5" />
          </IconButton>
        </div>
      </header>

      {/* Main Swipe / Empty Body */}
      <div className="relative flex-1 w-full max-w-md mx-auto my-auto flex items-center justify-center px-3 py-2">
        {isInitialLoading ? (
          <div className="relative w-full h-[65dvh] max-h-[600px]">
            <Skeleton variant="media" className="absolute inset-0 aspect-auto rounded-[30px]" />
          </div>
        ) : !currentProfile ? (
          <EmptyState
            icon="🔥"
            title="Yakındaki Tüm Profiller İncelendi"
            subtitle="Arama tercihlerinizi değiştirerek veya yerinizi yenileyerek daha fazla kişi keşfedebilirsiniz."
            actionLabel="Yeniden Tara"
            onAction={handleReset}
          />
        ) : (
          <div className="relative w-full h-[65dvh] max-h-[600px]">
            {[...visibleCards].reverse().map((profile) => (
              <SwipeCard
                key={profile.id}
                ref={profile.id === currentProfile.id ? topCardRef : undefined}
                profile={profile}
                isTop={profile.id === currentProfile.id}
                onSwiped={handleSwiped}
                onInfoClick={() => navigate(`/discover/${profile.id}`)}
              />
            ))}
            {/* Departing cards render last (on top), oldest first, so each visibly flies off
                above the already-interactive card underneath — none of them gate input. */}
            {exitingCards.map((profile) => (
              <SwipeCard
                key={profile.id}
                profile={profile}
                isTop={false}
                isExiting
                onSwiped={() => {}}
                onExitComplete={() => handleExitComplete(profile.id)}
                onInfoClick={() => {}}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action Control Floating Buttons */}
      {currentProfile && (
        <div className="flex items-center justify-around max-w-sm mx-auto w-full py-2 mb-20 z-sticky">
          <button
            onClick={() => handleAction('left')}
            className="w-14 h-14 rounded-full bg-surface border border-app text-[#FF4B55] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
          >
            <X className="w-7 h-7 stroke-[2.5]" />
          </button>

          <button
            onClick={() => handleAction('up')}
            className="w-12 h-12 rounded-full bg-surface border border-app text-[#25D9D0] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
          >
            <Star className="w-6 h-6 fill-current" />
          </button>

          <button
            onClick={() => handleAction('right')}
            className="w-16 h-16 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-xl shadow-pink-500/30 active:scale-90 transition-transform"
          >
            <Heart className="w-8 h-8 fill-current" />
          </button>

          <button
            onClick={() => navigate('/boost')}
            className="w-12 h-12 rounded-full bg-surface border border-app text-[#F5B942] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
          >
            <Zap className="w-6 h-6 fill-current" />
          </button>
        </div>
      )}

      {/* Filter Bottom Sheet */}
      <FilterBottomSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} onApplied={handleReset} />

      {/* Match Result Popup */}
      <MatchModal
        isOpen={matchResult.isOpen}
        onClose={() => setMatchResult({ isOpen: false })}
        matchedUser={matchResult.matchUser}
        matchId={matchResult.matchId}
      />
    </div>
  );
};
