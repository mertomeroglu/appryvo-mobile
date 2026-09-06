import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  Bell,
  Camera,
  CloudOff,
  Crosshair,
  Heart,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinOff,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
  Star,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import {
  useDiscoveryFeedQuery,
  useEntitlementsQuery,
  useInAppNotificationsQuery,
  useLikeMutation,
  usePassMutation,
} from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { MatchModal } from '../../components/MatchModal';
import { FilterBottomSheet } from '../../components/FilterBottomSheet';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { IconButton } from '../../components/ui/IconButton';
import { AppButton } from '../../components/ui/AppButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { RewardedAdSheet } from '../../components/RewardedAdSheet';
import { useAppTranslation } from '../../i18n/appLocale';
import { nativeHaptics } from '../../native/haptics';
import { acquireBestLocation } from '../../services/geo/locationQuality';
import { nativeApp } from '../../native/app';
import { nativeAppSettings } from '../../native/nativeSettings';
import { nativeNetwork } from '../../native/network';
import { apiClient } from '../../services/api/apiClient';
import {
  enqueueDiscoveryAction,
  flushDiscoveryActions,
  isRetryableDiscoveryError,
} from '../../services/discovery/discoveryActionQueue';
import { toast } from '../../stores/useToastStore';
import { SwipeCard, type SwipeCardHandle, type SwipeCardProfile, type SwipeDirection } from './SwipeCard';
import { useAuthStore } from '../../stores/useAuthStore';

const PAGE_LIMIT = 20;
const PREFETCH_THRESHOLD = 3;
const DISCOVER_LOCATION_KEY = 'appryvo_discover_location_v1';
type LocationGateState =
  | 'checking'
  | 'prompt'
  | 'requesting'
  | 'permissionDenied'
  | 'servicesDisabled'
  | 'unavailable'
  | 'syncFailed'
  | 'located';

function isLocationServicesDisabled(error: unknown): boolean {
  const value = error as { code?: string; message?: string };
  const text = `${value?.code || ''} ${value?.message || ''}`.toLowerCase();
  return text.includes('0007') || text.includes('location services') || text.includes('location disabled');
}

// Module-level (not per-mount) so a remount doesn't forget which profiles were already swiped
// this session. /discover and /discover/:userId are sibling routes (see routes/index.tsx), so
// opening a full profile or the chat from a fresh match and navigating back unmounts and
// remounts DiscoverScreen -- a per-mount useRef reset to empty here, while
// useDiscoveryFeedQuery's first page keeps returning its cached (staleTime 60s) response under
// the same query key (feedSession always restarts at 0). Without a session-lived dedup set, an
// already-swiped -- possibly just matched -- profile could silently reappear in the deck.
// handleReset (explicit rescan) and a location change both intentionally clear this for a truly
// fresh session.
const consumedProfileIds = new Set<string>();

export const DiscoverScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const [deck, setDeck] = useState<SwipeCardProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [feedSession, setFeedSession] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [exitingCards, setExitingCards] = useState<SwipeCardProfile[]>([]);
  const [lastSwiped, setLastSwiped] = useState<{ profile: SwipeCardProfile; direction: SwipeDirection } | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSuperLikeQuotaOpen, setIsSuperLikeQuotaOpen] = useState(false);
  const [isRewardedAdOpen, setIsRewardedAdOpen] = useState(false);
  // Never call Geolocation.checkPermissions() just to decide the initial gate -- that's still a
  // native location API call the user hasn't asked for. Read only the locally-remembered outcome
  // of a *previous* explicit grant; anything else (never asked, previously chose global) starts
  // at 'prompt' with zero native calls, and Discover renders the normal (global) feed underneath
  // regardless of this gate -- the gate only controls the optional location opt-in banner.
  const [locationGate, setLocationGate] = useState<LocationGateState>(() => (
    typeof localStorage !== 'undefined' && localStorage.getItem(DISCOVER_LOCATION_KEY) === 'located'
      ? 'located'
      : 'prompt'
  ));
  // Always start collapsed to the small dismissible pill, never the full-screen choice modal --
  // opening Discover must never surface anything that looks like an automatic location prompt.
  // Tapping the pill is the explicit user action that reveals the Grant/Global choice.
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(true);
  const [matchResult, setMatchResult] = useState<{ isOpen: boolean; matchUser?: any; matchId?: string }>({
    isOpen: false,
  });

  const navigate = useNavigate();
  const {
    data: feedPage,
    error: feedError,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useDiscoveryFeedQuery(cursor, PAGE_LIMIT, feedSession);
  const { data: notificationsData } = useInAppNotificationsQuery();
  const { data: entitlements } = useEntitlementsQuery();
  const likeMutation = useLikeMutation();
  const passMutation = usePassMutation();
  const topCardRef = useRef<SwipeCardHandle>(null);
  const actionLockRef = useRef(false);
  const locationRequestInFlightRef = useRef(false);
  const retryLocationOnResumeRef = useRef(false);
  const unreadNotificationCount = notificationsData?.unreadCount || 0;
  const currentUser = useAuthStore((state) => state.user);
  const viewerId = String(currentUser?.id || currentUser?.uid || '');

  useEffect(() => {
    if (!viewerId) return;
    let disposed = false;
    let removeListener: (() => void) | undefined;
    const flushIfOnline = async () => {
      const status = await nativeNetwork.getStatus();
      if (status.connected) await flushDiscoveryActions(viewerId);
    };
    flushIfOnline().catch(() => {});
    nativeNetwork.addStatusListener((status) => {
      if (status.connected) flushDiscoveryActions(viewerId).catch(() => {});
    }).then((handle) => {
      if (disposed) handle.remove();
      else removeListener = () => handle.remove();
    }).catch(() => {});
    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [viewerId]);

  const continueWithGlobalDiscovery = useCallback(() => {
    localStorage.setItem(DISCOVER_LOCATION_KEY, 'global');
    setLocationPromptDismissed(true);
    toast.show(t('discoverContinueGlobalToast'), 'neutral');
  }, [t]);

  const resolveDiscoverLocation = useCallback(async (
    requestPermission: boolean,
    announceSuccess = false,
    refreshFeed = true
  ) => {
    if (locationRequestInFlightRef.current) return;
    locationRequestInFlightRef.current = true;
    setLocationGate(requestPermission ? 'requesting' : 'checking');

    try {
      if (Capacitor.isNativePlatform()) {
        let permission;
        try {
          permission = await Geolocation.checkPermissions();
        } catch (error) {
          setLocationGate(isLocationServicesDisabled(error) ? 'servicesDisabled' : 'unavailable');
          return;
        }

        const isGranted = permission.location === 'granted' || permission.coarseLocation === 'granted';
        if (!isGranted && !requestPermission) {
          setLocationGate(permission.location === 'denied' ? 'permissionDenied' : 'prompt');
          return;
        }
        if (!isGranted) {
          try {
            permission = await Geolocation.requestPermissions();
          } catch (error) {
            setLocationGate(isLocationServicesDisabled(error) ? 'servicesDisabled' : 'permissionDenied');
            return;
          }
          if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
            setLocationGate('permissionDenied');
            return;
          }
        }
      } else if (!requestPermission && 'permissions' in navigator) {
        const browserPermission = await navigator.permissions.query({ name: 'geolocation' });
        if (browserPermission.state !== 'granted') {
          setLocationGate(browserPermission.state === 'denied' ? 'permissionDenied' : 'prompt');
          return;
        }
      }

      let position: any;
      try {
        position = await acquireBestLocation();
      } catch (error) {
        setLocationGate(isLocationServicesDisabled(error) ? 'servicesDisabled' : 'unavailable');
        return;
      }

      const lat = position?.coords?.latitude;
      const lng = position?.coords?.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setLocationGate('unavailable');
        return;
      }

      try {
        // Deliberately no mapVisible field: this is a distance-for-matching sync, not a map
        // check-in, and must never flip the user's map visibility either way (see
        // location_utils.js buildLocationUpsert's tri-state handling).
        await apiClient.post('/api/user/location', {
          latitude: lat,
          longitude: lng,
          accuracy: Number.isFinite(position?.coords?.accuracy) ? position.coords.accuracy : undefined,
          observedAt: new Date(position.timestamp).toISOString(),
        });
      } catch {
        setLocationGate('syncFailed');
        return;
      }

      localStorage.setItem(DISCOVER_LOCATION_KEY, 'located');
      setLocationPromptDismissed(false);
      setLocationGate('located');
      if (refreshFeed) {
        consumedProfileIds.clear();
        setDeck([]);
        setCurrentIndex(0);
        setCursor(null);
        setNextCursor(null);
        setFeedSession((value) => value + 1);
        setHasMore(true);
        await refetch();
      }
      if (announceSuccess) toast.success(t('discoverLocationUpdatedToast'));
    } catch {
      setLocationGate('unavailable');
    } finally {
      locationRequestInFlightRef.current = false;
    }
  }, [refetch, t]);

  const requestDiscoverLocation = useCallback(() => {
    void resolveDiscoverLocation(true, true);
  }, [resolveDiscoverLocation]);

  // Always call the latest resolveDiscoverLocation without making the resume-listener effect
  // below depend on its identity -- resolveDiscoverLocation is recreated whenever any of its own
  // closed-over values change (e.g. refetch, t), and depending on it directly would re-run a
  // "register once" effect on every one of those renders instead of once per screen visit.
  // Deliberately NOT invoked on mount: opening Discover must never touch Geolocation on its own
  // (App Store privacy requirement -- map/discover location is opt-in only). The deck above
  // already renders the ordinary (global) feed with no location involved.
  const resolveDiscoverLocationRef = useRef(resolveDiscoverLocation);
  useEffect(() => {
    resolveDiscoverLocationRef.current = resolveDiscoverLocation;
  }, [resolveDiscoverLocation]);

  const openLocationSettings = async () => {
    retryLocationOnResumeRef.current = true;
    await nativeAppSettings.openLocationServices();
  };

  const openPermissionSettings = async () => {
    if (!Capacitor.isNativePlatform()) {
      requestDiscoverLocation();
      return;
    }
    retryLocationOnResumeRef.current = true;
    await nativeAppSettings.open();
  };

  useEffect(() => {
    let disposed = false;
    let removeListener: (() => void) | undefined;
    nativeApp.addStateChangeListener((state) => {
      // Resuming the app must NEVER touch GPS on its own. The single exception is a pending
      // "we just sent the user to Settings for a location feature they explicitly requested"
      // retry (see openLocationSettings/openPermissionSettings) -- that flag is consumed here
      // and cleared immediately so it can only ever fire this one retry, not on every resume.
      if (state.isActive && retryLocationOnResumeRef.current) {
        retryLocationOnResumeRef.current = false;
        void resolveDiscoverLocationRef.current(false, true, false);
      }
    }).then((handle) => {
      if (disposed) handle.remove();
      else removeListener = () => handle.remove();
    }).catch(() => {});
    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);

  // Append newly-fetched pages to the local deck in the order the server returned them.
  // Never re-sort/filter locally — the server owns ranking.
  useEffect(() => {
    if (!feedPage) return;
    setDeck((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const additions = feedPage.profiles.filter(
        (p: SwipeCardProfile) => !seen.has(p.id) && !consumedProfileIds.has(p.id)
      );
      return [...prev, ...additions];
    });
    setHasMore(feedPage.paging.hasMore);
    setNextCursor(feedPage.paging.nextCursor);
  }, [feedPage]);

  // Prefetch the next page as the deck runs low, instead of refetching on every swipe.
  useEffect(() => {
    if (!hasMore || !nextCursor || isFetching || cursor === nextCursor) return;
    if (deck.length - currentIndex <= PREFETCH_THRESHOLD) {
      setCursor(nextCursor);
    }
  }, [currentIndex, deck.length, hasMore, isFetching, cursor, nextCursor]);

  const visibleCards = useMemo(() => deck.slice(currentIndex, currentIndex + 2), [deck, currentIndex]);
  const currentProfile = visibleCards[0];
  const renderedCards = useMemo(() => {
    const visibleInPaintOrder = [...visibleCards].reverse();
    const visibleIds = new Set(visibleInPaintOrder.map((profile) => profile.id));
    return [...visibleInPaintOrder, ...exitingCards.filter((profile) => !visibleIds.has(profile.id))];
  }, [visibleCards, exitingCards]);

  // Bound long-session memory: consumed profiles no longer need to stay in the React deck.
  // Pruning in batches avoids reallocating the array on every swipe.
  useEffect(() => {
    if (currentIndex < 10) return;
    setDeck((current) => current.slice(currentIndex));
    setCurrentIndex(0);
  }, [currentIndex]);

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

  const handleSwiped = async (direction: SwipeDirection, profile: SwipeCardProfile) => {
    nativeHaptics.impact();
    // Commit immediately, then keep this same keyed card in renderedCards as a non-interactive
    // exit layer. The next profile becomes top/interactive without a stale zero-position remount.
    consumedProfileIds.add(profile.id);
    setExitingCards((current) => (
      current.some((item) => item.id === profile.id) ? current : [...current, profile].slice(-1)
    ));
    setCurrentIndex((i) => i + 1);
    setLastSwiped({ profile, direction });
    window.setTimeout(() => handleExitComplete(profile.id), 1200);

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
        if (isRetryableDiscoveryError(err) && viewerId) {
          enqueueDiscoveryAction({ viewerId, targetUserId: profile.id, direction, createdAt: Date.now() });
          toast.show(t('discoveryQueuedOfflineToast'), 'neutral');
        } else if (direction === 'up' && err?.code === 'SUPERLIKE_QUOTA_EXHAUSTED') {
          setIsSuperLikeQuotaOpen(true);
        } else if (err?.code === 'LIKE_QUOTA_EXHAUSTED' && err?.rawDetails?.canWatchAdForLike) {
          setIsRewardedAdOpen(true);
        } else {
          toast.error(err?.message || t('discoveryActionFailedToast'));
        }
      }
    } else {
      try {
        await passMutation.mutateAsync(profile.id);
      } catch (err: any) {
        console.error('[PASS ERROR]', err);
        if (isRetryableDiscoveryError(err) && viewerId) {
          enqueueDiscoveryAction({ viewerId, targetUserId: profile.id, direction, createdAt: Date.now() });
          toast.show(t('discoveryQueuedOfflineToast'), 'neutral');
          return;
        }
        toast.error(err?.message || t('discoveryActionFailedToast'));
      }
    }
  };

  const handleRewind = async () => {
    if (!lastSwiped || currentIndex <= 0) return;
    try {
      await apiClient.post('/api/discovery/rewind', { targetUserId: lastSwiped.profile.id, direction: lastSwiped.direction });
      consumedProfileIds.delete(lastSwiped.profile.id);
      setExitingCards([]);
      setCurrentIndex((value) => Math.max(0, value - 1));
      setLastSwiped(null);
    } catch (err: any) {
      if (err?.code === 'REWIND_QUOTA_EXHAUSTED') toast.show(t('rewindQuotaToast'), 'neutral');
      else toast.error(err?.message || t('rewindFailedToast'));
    }
  };

  // Same-frame duplicate-tap guard (e.g. a WebView firing both a touch and a simulated mouse
  // click for one physical tap) -- released next animation frame, so legitimate rapid
  // consecutive swipes on the newly-interactive card are never delayed.
  const handleAction = (direction: SwipeDirection) => {
    if (actionLockRef.current) return;
    if (
      direction === 'up' &&
      entitlements &&
      entitlements.isUnlimitedSuperLike !== true &&
      Number(entitlements?.superlikeCount ?? entitlements?.superLikeCount ?? 0) <= 0
    ) {
      setIsSuperLikeQuotaOpen(true);
      return;
    }
    actionLockRef.current = true;
    topCardRef.current?.triggerSwipe(direction);
    requestAnimationFrame(() => {
      actionLockRef.current = false;
    });
  };

  const handleExitComplete = (profileId: string) => {
    setExitingCards((current) => current.filter((profile) => profile.id !== profileId));
  };

  const handleReset = () => {
    consumedProfileIds.clear();
    setDeck([]);
    setCurrentIndex(0);
    setCursor(null);
    setNextCursor(null);
    setFeedSession((value) => value + 1);
    setHasMore(true);
    refetch();
  };

  const isInitialLoading = isLoading && deck.length === 0;
  const feedErrorCode = (feedError as { code?: string } | null)?.code;
  const requiresProfilePhotos = feedErrorCode === 'MIN_PROFILE_PHOTOS';
  const hasActiveFilters = Boolean(
    currentUser?.verifiedOnlyPref ||
    currentUser?.recentlyActivePref ||
    currentUser?.newMembersPref ||
    currentUser?.discoveryRelationshipGoalPref
  );
  const locationIssue = {
    prompt: {
      icon: <LocateFixed className="h-6 w-6" aria-hidden="true" />,
      banner: t('discoverLocationPromptBanner'),
      title: t('discoverLocationPromptTitle'),
      description: t('discoverLocationPromptDescription'),
      action: t('discoverGrantLocationAction'),
    },
    permissionDenied: {
      icon: <MapPinOff className="h-6 w-6" aria-hidden="true" />,
      banner: t('discoverLocationDeniedBanner'),
      title: t('permissionLocationTitle'),
      description: t('discoverLocationDeniedDescription'),
      action: Capacitor.isNativePlatform() ? t('discoverOpenAppSettingsAction') : t('discoverGrantLocationAction'),
    },
    servicesDisabled: {
      icon: <MapPinOff className="h-6 w-6" aria-hidden="true" />,
      banner: t('discoverServicesDisabledBanner'),
      title: t('discoverServicesDisabledTitle'),
      description: t('discoverServicesDisabledDescription'),
      action: t('discoverOpenLocationSettingsAction'),
    },
    unavailable: {
      icon: <Crosshair className="h-6 w-6" aria-hidden="true" />,
      banner: t('discoverLocationUnavailableBanner'),
      title: t('discoverLocationUnavailableTitle'),
      description: t('discoverLocationUnavailableDescription'),
      action: t('retryButton'),
    },
    syncFailed: {
      icon: <CloudOff className="h-6 w-6" aria-hidden="true" />,
      banner: t('discoverSyncFailedBanner'),
      title: t('discoverSyncFailedTitle'),
      description: t('discoverSyncFailedDescription'),
      action: t('discoverResyncAction'),
    },
  }[locationGate as Exclude<LocationGateState, 'checking' | 'requesting' | 'located'>];
  const canSuperLike =
    !entitlements ||
    entitlements.isUnlimitedSuperLike === true ||
    Number(entitlements.superlikeCount ?? entitlements.superLikeCount ?? 0) > 0;

  return (
    <div className="relative h-full w-full bg-app text-app flex flex-col justify-between overflow-hidden select-none">
      {/* Top Bar Header */}
      <header className="pt-safe px-4 min-h-[calc(4rem+var(--safe-top))] flex items-center justify-between z-sticky bg-app-80 backdrop-blur-md">
        <AppLogo variant="icon" size="md" />

        <div className="flex items-center gap-2">
          <IconButton aria-label={t('notifications')} variant="surface" size="md" onClick={() => navigate('/notifications')} className="relative">
            <Bell className="w-5 h-5" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-gradient text-white text-[10px] font-extrabold flex items-center justify-center border-2 border-app">
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </IconButton>
          <IconButton aria-label={t('discoverFiltersAriaLabel')} variant="surface" size="md" onClick={() => setIsFilterOpen(true)}>
            <SlidersHorizontal className="w-5 h-5" />
          </IconButton>
        </div>
      </header>

      {locationPromptDismissed && locationIssue && (
        <button
          type="button"
          onClick={() => setLocationPromptDismissed(false)}
          className="mx-auto mt-1 flex items-center gap-1.5 rounded-full border border-app bg-surface px-3 py-1.5 text-micro font-bold text-app-muted shadow-soft"
        >
          <MapPin className="h-3.5 w-3.5 text-pink-500" />
          {locationIssue.banner}
        </button>
      )}

      {/* Main Swipe / Empty Body */}
      {/* min-h-0 is required here: without it, a flex item's automatic minimum size is its
          content's size, so the h-full card box below (or the old fixed h-[65dvh]) could force
          this flex-1 item taller than the space actually left after the header and action row,
          silently pushing the action row down into/under the floating bottom nav on shorter
          viewports instead of the card simply sizing to whatever room truly remains. */}
      <div className="relative flex-1 min-h-0 w-full max-w-md mx-auto my-auto flex items-center justify-center px-3 py-2">
        {isInitialLoading ? (
          <div className="relative w-full h-full max-h-[600px]">
            <Skeleton variant="media" className="absolute inset-0 aspect-auto rounded-[30px]" />
          </div>
        ) : isError && !currentProfile ? (
          requiresProfilePhotos ? (
            <EmptyState
              icon={<Camera className="h-8 w-8" aria-hidden="true" />}
              title={t('discoverCompletePhotosTitle')}
              subtitle={t('discoverCompletePhotosDescription')}
              actionLabel={t('discoverGoToProfileAction')}
              onAction={() => navigate('/profile')}
            />
          ) : (
            <ErrorState
              icon={<TriangleAlert className="h-8 w-8" aria-hidden="true" />}
              title={feedErrorCode === 'NETWORK_ERROR' || feedErrorCode === 'TIMEOUT' ? t('discoverConnectionErrorTitle') : t('discoverFeedErrorTitle')}
              message={t('discoverFeedErrorMessage')}
              onRetry={() => void refetch()}
            />
          )
        ) : !currentProfile ? (
          <EmptyState
            icon={<SearchX className="h-8 w-8" aria-hidden="true" />}
            title={hasActiveFilters ? t('discoverNoMatchTitle') : t('discoverNoProfilesTitle')}
            subtitle={hasActiveFilters
              ? t('discoverNoMatchDescription')
              : t('discoverNoProfilesDescription')}
            actionLabel={hasActiveFilters ? t('discoverReviewFiltersAction') : t('discoverRescanAction')}
            onAction={hasActiveFilters ? () => setIsFilterOpen(true) : handleReset}
          />
        ) : (
          <div className="relative w-full h-full max-h-[600px]">
            {renderedCards.map((profile) => {
              const isExiting = exitingCards.some((item) => item.id === profile.id);
              return (
              <SwipeCard
                key={profile.id}
                ref={profile.id === currentProfile.id ? topCardRef : undefined}
                profile={profile}
                isTop={profile.id === currentProfile.id}
                isExiting={isExiting}
                onSwiped={handleSwiped}
                onExitComplete={handleExitComplete}
                canSuperLike={canSuperLike}
                onSuperLikeUnavailable={() => setIsSuperLikeQuotaOpen(true)}
                onInfoClick={() => { if (!isExiting) navigate(`/discover/${profile.id}`); }}
              />
              );
            })}
          </div>
        )}
      </div>

      {/* Action Control Floating Buttons */}
      {/* The floating bottom nav is a fixed-position overlay reserving --nav-footprint (see
          globals.css -- its own rendered height + bottom margin) above
          env(safe-area-inset-bottom), and paints above this row (z-navigation > z-sticky). A bare
          fixed mb-20 cleared that on devices with little/no safe-area-inset-bottom but let the
          nav visually sit on top of these buttons (and their hit-targets) on devices with a
          taller inset (e.g. the home-indicator area on notched phones). Add an explicit 24px
          buffer on top of the nav's own footprint so rounding/OS differences in the reported
          safe-area inset can't fully close the gap. */}
      {currentProfile && (
        <div className="flex items-center justify-around max-w-sm mx-auto w-full py-2 mb-[calc(var(--safe-bottom)+var(--nav-footprint)+24px)] z-sticky">
          <button onClick={handleRewind} disabled={!lastSwiped} aria-label={t('discoverRewindAriaLabel')} className="w-11 h-11 rounded-full bg-surface border border-app text-amber-500 flex items-center justify-center shadow-elevated disabled:opacity-35 active:scale-90 transition-transform"><RotateCcw className="w-5 h-5" /></button>
          <button
            onClick={() => handleAction('left')}
            aria-label={t('discoverPassAriaLabel')}
            className="w-14 h-14 rounded-full bg-surface border border-app text-[#FF4B55] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
          >
            <X className="w-7 h-7 stroke-[2.5]" />
          </button>

          <button
            onClick={() => handleAction('up')}
            aria-label={t('discoverSuperLikeAriaLabel')}
            className="w-12 h-12 rounded-full bg-surface border border-app text-[#25D9D0] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
          >
            <Star className="w-6 h-6 fill-current" />
          </button>

          <button
            onClick={() => handleAction('right')}
            aria-label={t('discoverLikeAriaLabel')}
            className="w-16 h-16 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-xl shadow-pink-500/30 active:scale-90 transition-transform"
          >
            <Heart className="w-8 h-8 fill-current" />
          </button>

          <button
            onClick={() => navigate('/boost')}
            aria-label={t('discoverBoostAriaLabel')}
            className="w-12 h-12 rounded-full bg-surface border border-app text-[#F5B942] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
          >
            <Zap className="w-6 h-6 fill-current" />
          </button>
        </div>
      )}

      {/* Filter Bottom Sheet */}
      <FilterBottomSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} onApplied={handleReset} />

      <BottomSheet isOpen={isSuperLikeQuotaOpen} onClose={() => setIsSuperLikeQuotaOpen(false)}>
        <div className="px-6 pb-6 pt-2 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-cyan-500/10 text-[#25D9D0]">
            <Star className="h-7 w-7 fill-current" />
          </span>
          <h2 className="mt-4 text-title text-app">{t('superLikeQuotaTitle')}</h2>
          <p className="mt-2 text-caption normal-case leading-relaxed text-app-muted">
            {t('superLikeQuotaDescription')}
          </p>
          <div className="mt-5 space-y-2.5">
            <AppButton
              fullWidth
              size="lg"
              variant="primary"
              onClick={() => {
                setIsSuperLikeQuotaOpen(false);
                navigate('/premium');
              }}
            >
              {t('explorePlusGoldCta')}
            </AppButton>
            <AppButton fullWidth size="md" variant="ghost" onClick={() => setIsSuperLikeQuotaOpen(false)}>
              {t('notNowLabel')}
            </AppButton>
          </div>
        </div>
      </BottomSheet>

      <RewardedAdSheet
        isOpen={isRewardedAdOpen}
        onClose={() => setIsRewardedAdOpen(false)}
        rewardType="REWARDED_LIKE"
        title={t('dailyLikesExhaustedTitle')}
        description={t('dailyLikesExhaustedDescription')}
        rewardLabel={t('plus5LikesLabel')}
      />

      {/* Match Result Popup */}
      <MatchModal
        isOpen={matchResult.isOpen}
        onClose={() => setMatchResult({ isOpen: false })}
        matchedUser={matchResult.matchUser}
        matchId={matchResult.matchId}
      />

      {!locationPromptDismissed && (locationGate === 'requesting' || Boolean(locationIssue)) && (
        <div className="fixed inset-0 z-modal flex items-end justify-center bg-black/45 p-4 pb-safe backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-[28px] border border-app bg-surface p-6 text-center shadow-floating">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-white shadow-elevated">
              {locationGate === 'requesting'
                ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                : locationIssue?.icon}
            </div>
            <h2 className="text-title text-app">{locationGate === 'requesting' ? t('discoverLocatingTitle') : locationIssue?.title}</h2>
            <p className="mt-2 text-caption normal-case leading-relaxed text-app-muted">
              {locationGate === 'requesting'
                ? t('discoverCheckingDescription')
                : locationIssue?.description}
            </p>
            <div className="mt-6 space-y-2.5">
              <AppButton
                fullWidth
                size="lg"
                variant="primary"
                loading={locationGate === 'requesting'}
                onClick={locationGate === 'servicesDisabled'
                  ? openLocationSettings
                  : locationGate === 'permissionDenied'
                    ? openPermissionSettings
                    : requestDiscoverLocation}
              >
                {locationGate === 'requesting' ? t('discoverCheckingAction') : locationIssue?.action}
              </AppButton>
              <AppButton fullWidth size="md" variant="ghost" disabled={locationGate === 'requesting'} onClick={continueWithGlobalDiscovery}>
                {t('discoverContinueGlobalAction')}
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
