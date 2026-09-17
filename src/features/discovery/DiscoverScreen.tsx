import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  Camera,
  CheckCircle2,
  CloudOff,
  Crosshair,
  HelpCircle,
  LocateFixed,
  Loader2,
  MapPin,
  MapPinOff,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  User,
} from 'lucide-react';
import { useInAppNotificationsQuery } from '../../hooks/useQueries';
import {
  useDiscoveryPassMutation,
  useDiscoveryV2FeedQuery,
  type DiscoveryV2Candidate,
  type InteractionStatus,
} from '../../hooks/useQuestionQueries';
import { getPhotoUrl, normalizeMediaUrl } from '../../services/media/mediaService';
import { FilterBottomSheet } from '../../components/FilterBottomSheet';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { IconButton } from '../../components/ui/IconButton';
import { AppButton } from '../../components/ui/AppButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { VerifiedBadge } from '../../components/ui/Badge';
import { useAppTranslation } from '../../i18n/appLocale';
import { getLocalizedInterestLabel } from '../../lib/interestLabels';
import { nativeHaptics } from '../../native/haptics';
import { acquireBestLocation } from '../../services/geo/locationQuality';
import { nativeApp } from '../../native/app';
import { nativeAppSettings } from '../../native/nativeSettings';
import { apiClient } from '../../services/api/apiClient';
import { toast } from '../../stores/useToastStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { SPRING, PRESS_SCALE } from '../../motion/tokens';
import { cn } from '../../lib/utils';
import { QuestionAnswerSheet, type QuestionSheetOutcome } from '../questions/QuestionAnswerSheet';
import { QuestionsRequiredGate } from '../questions/QuestionsRequiredGate';
import { useQuestionText, type QuestionTextKey } from '../questions/questionLocale';

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

// Module-level (not per-mount) so a remount doesn't forget which profiles were already handled
// this session. /discover and /discover/:userId are sibling routes (see routes/index.tsx), so
// opening a full profile and navigating back unmounts and remounts DiscoverScreen -- a per-mount
// useRef reset to empty here, while useDiscoveryV2FeedQuery's first page keeps returning its
// cached (staleTime 60s) response under the same query key (feedSession always restarts at 0).
// handleReset (explicit rescan) and a location change both intentionally clear this for a truly
// fresh session.
const consumedProfileIds = new Set<string>();

/** Interaction states that replace the "answer" action with a read-only status line. */
const PENDING_STATUS_KEYS: Partial<Record<InteractionStatus, QuestionTextKey>> = {
  QUESTION_PRESENTED: 'statusAwaiting',
  OWNER_PENDING: 'statusAwaiting',
  SUPERLIKE_PENDING: 'statusSuperlikeSent',
  RETRY_REQUESTED: 'statusRetryRequested',
  MATCHED: 'statusMatched',
};

export const DiscoverScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const { qt } = useQuestionText();
  const [deck, setDeck] = useState<DiscoveryV2Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [feedSession, setFeedSession] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [answerTarget, setAnswerTarget] = useState<DiscoveryV2Candidate | null>(null);
  const [passingId, setPassingId] = useState<string | null>(null);
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

  const navigate = useNavigate();
  const {
    data: feedPage,
    error: feedError,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useDiscoveryV2FeedQuery(cursor, PAGE_LIMIT, feedSession);
  const { data: notificationsData } = useInAppNotificationsQuery();
  const passMutation = useDiscoveryPassMutation();
  const locationRequestInFlightRef = useRef(false);
  const retryLocationOnResumeRef = useRef(false);
  const sheetOutcomeRef = useRef<QuestionSheetOutcome | null>(null);
  const unreadNotificationCount = notificationsData?.unreadCount || 0;
  const currentUser = useAuthStore((state) => state.user);

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
  // (App Store privacy requirement -- map/discover location is opt-in only). The feed above
  // already renders the ordinary (global) list with no location involved.
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

  // Append newly-fetched pages in the order the server returned them.
  // Never re-sort/filter locally — the server owns ranking.
  useEffect(() => {
    if (!feedPage) return;
    setDeck((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const additions = feedPage.profiles.filter((p) => !seen.has(p.id) && !consumedProfileIds.has(p.id));
      return [...prev, ...additions];
    });
    setHasMore(feedPage.paging.hasMore);
    setNextCursor(feedPage.paging.nextCursor);
  }, [feedPage]);

  // Prefetch the next page as the list runs low, instead of refetching after every profile.
  useEffect(() => {
    if (!hasMore || !nextCursor || isFetching || cursor === nextCursor) return;
    if (deck.length - currentIndex <= PREFETCH_THRESHOLD) {
      setCursor(nextCursor);
    }
  }, [currentIndex, deck.length, hasMore, isFetching, cursor, nextCursor]);

  const visibleProfiles = useMemo(() => deck.slice(currentIndex, currentIndex + 2), [deck, currentIndex]);
  const currentProfile = visibleProfiles[0];

  // Bound long-session memory: consumed profiles no longer need to stay in the React list.
  useEffect(() => {
    if (currentIndex < 10) return;
    setDeck((current) => current.slice(currentIndex));
    setCurrentIndex(0);
  }, [currentIndex]);

  // Warm the browser cache for the next profile's first photo only.
  useEffect(() => {
    const nextPhoto = getPhotoUrl(visibleProfiles[1]?.photos?.[0]) || visibleProfiles[1]?.photoUrl;
    if (!nextPhoto) return;
    const img = new Image();
    img.src = normalizeMediaUrl(nextPhoto);
  }, [visibleProfiles]);

  const advance = useCallback((profileId: string) => {
    consumedProfileIds.add(profileId);
    setCurrentIndex((index) => index + 1);
  }, []);

  // "Şimdilik Geç": a directional, never-expiring discovery pass. The profile leaves the feed on
  // a plain fade/lift -- deliberately not a swipe-style exit, this route has no gestures at all.
  const handlePass = async (profile: DiscoveryV2Candidate) => {
    if (passingId) return;
    setPassingId(profile.id);
    void nativeHaptics.impact();
    try {
      await passMutation.mutateAsync(profile.id);
      advance(profile.id);
    } catch {
      toast.error(qt('actionFailed'));
    } finally {
      setPassingId(null);
    }
  };

  const handleSheetClose = () => {
    const outcome = sheetOutcomeRef.current;
    const profileId = answerTarget?.id;
    sheetOutcomeRef.current = null;
    setAnswerTarget(null);
    // Any resolved outcome (answered, retry asked, Super Like sent, profile gone) removes the
    // profile from this session's feed; a plain dismissal leaves it in place.
    if (outcome && profileId) advance(profileId);
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
  const requiresQuestions = feedErrorCode === 'QUESTIONS_REQUIRED' || currentUser?.questionsRequired === true;
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

  return (
    <div className="relative h-full w-full bg-app text-app flex flex-col overflow-hidden">
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

      {/* One profile at a time -- no deck, no gestures, no like/pass buttons. */}
      <div className="relative flex-1 min-h-0 w-full max-w-md mx-auto flex flex-col px-4 pb-[calc(var(--safe-bottom)+var(--nav-footprint)+16px)]">
        {requiresQuestions ? (
          <div className="flex flex-1 items-center justify-center">
            <QuestionsRequiredGate />
          </div>
        ) : isInitialLoading ? (
          <div className="flex-1 pt-3">
            <Skeleton variant="title" className="mb-3 h-5 w-40" />
            <Skeleton variant="media" className="h-[58%] min-h-[220px] rounded-[30px]" />
            <Skeleton variant="text" className="mt-4 h-4 w-2/3" />
            <Skeleton variant="text" className="mt-2 h-4 w-1/2" />
          </div>
        ) : isError && !currentProfile ? (
          <div className="flex flex-1 items-center justify-center">
            {requiresProfilePhotos ? (
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
            )}
          </div>
        ) : !currentProfile ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<SearchX className="h-8 w-8" aria-hidden="true" />}
              title={hasActiveFilters ? t('discoverNoMatchTitle') : qt('emptyTitle')}
              subtitle={hasActiveFilters ? t('discoverNoMatchDescription') : qt('emptyDescription')}
              actionLabel={hasActiveFilters ? t('discoverReviewFiltersAction') : t('discoverRescanAction')}
              onAction={hasActiveFilters ? () => setIsFilterOpen(true) : handleReset}
            />
          </div>
        ) : (
          <>
            <h1 className="shrink-0 py-3 text-heading font-extrabold text-app">{qt('discoverTitle')}</h1>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={currentProfile.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24, scale: 0.98 }}
                transition={SPRING.soft}
                className="flex min-h-0 flex-1 flex-col"
              >
                <QuestionProfileCard
                  profile={currentProfile}
                  onOpenProfile={() => navigate(`/discover/${currentProfile.id}`)}
                />
                <QuestionProfileActions
                  profile={currentProfile}
                  passing={passingId === currentProfile.id}
                  onAnswer={() => setAnswerTarget(currentProfile)}
                  onViewProfile={() => navigate(`/discover/${currentProfile.id}`)}
                  onPass={() => void handlePass(currentProfile)}
                />
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Filter Bottom Sheet */}
      <FilterBottomSheet isOpen={isFilterOpen} onClose={() => setIsFilterOpen(false)} onApplied={handleReset} />

      <QuestionAnswerSheet
        isOpen={answerTarget !== null}
        onClose={handleSheetClose}
        target={answerTarget ? { id: answerTarget.id, name: answerTarget.name } : null}
        initialStatus={answerTarget?.questionState?.status || null}
        onOutcome={(outcome) => { sheetOutcomeRef.current = outcome; }}
        onQuestionsRequired={() => navigate('/profile/questions')}
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

const QuestionProfileCard: React.FC<{ profile: DiscoveryV2Candidate; onOpenProfile: () => void }> = ({
  profile,
  onOpenProfile,
}) => {
  const { locale } = useAppTranslation();
  const { qt } = useQuestionText();
  const photo = getPhotoUrl(profile.photos?.[0]) || profile.photoMediumUrl || profile.photoUrl;
  const compatibility = typeof profile.compatibility === 'number' ? Math.round(profile.compatibility) : null;
  const interests = (profile.commonInterests || []).slice(0, 4);
  const distance = typeof profile.distanceKm === 'number' ? Math.max(1, Math.round(profile.distanceKm)) : null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-[30px] border border-app bg-surface shadow-soft" data-testid="question-profile-card">
      <button type="button" onClick={onOpenProfile} className="block w-full text-left" aria-label={profile.name}>
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-t-[30px] bg-app-secondary">
          {photo ? (
            <img src={normalizeMediaUrl(photo)} alt={profile.name} className="h-full w-full object-cover" loading="eager" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-app-muted">
              <User className="h-12 w-12" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-heading font-extrabold text-white">
                {profile.name}{profile.age ? `, ${profile.age}` : ''}
              </h2>
              {profile.verified && <VerifiedBadge />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-caption font-semibold text-white/85">
              {profile.city && <span className="truncate">{profile.city}</span>}
              {distance !== null && <span>{qt('distanceTemplate', { km: distance })}</span>}
              {profile.activeNow && <span>{qt('activeNow')}</span>}
              {profile.isNewMember && <span>{qt('newMember')}</span>}
            </div>
          </div>
        </div>
      </button>

      <div className="p-4">
        {compatibility !== null && (
          <div className="flex items-center gap-2 rounded-2xl bg-surface-elevated px-3 py-2">
            <Sparkles className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
            <span className="text-caption font-bold text-app">{qt('compatibilityTemplate', { percent: compatibility })}</span>
          </div>
        )}
        {interests.length > 0 && (
          <div className="mt-3">
            <p className="text-caption font-semibold text-app-muted">{qt('commonInterests')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {interests.map((interest) => (
                <span key={interest} className="rounded-full border border-app bg-surface-elevated px-3 py-1 text-caption font-semibold text-app">
                  {getLocalizedInterestLabel(interest, locale)}
                </span>
              ))}
            </div>
          </div>
        )}
        {profile.bio && (
          <p className="mt-3 text-caption normal-case leading-relaxed text-app-muted">{profile.bio}</p>
        )}
      </div>
    </div>
  );
};

const QuestionProfileActions: React.FC<{
  profile: DiscoveryV2Candidate;
  passing: boolean;
  onAnswer: () => void;
  onViewProfile: () => void;
  onPass: () => void;
}> = ({ profile, passing, onAnswer, onViewProfile, onPass }) => {
  const { qt } = useQuestionText();
  const status = profile.questionState?.status;
  const pendingKey = status ? PENDING_STATUS_KEYS[status] : undefined;

  return (
    <div className="shrink-0 pt-3">
      {pendingKey ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-app bg-surface-elevated px-4 py-3 text-caption font-bold text-app">
          <CheckCircle2 className="h-4 w-4 text-[#32D583]" aria-hidden="true" />
          {qt(pendingKey)}
        </div>
      ) : (
        <AppButton
          fullWidth
          size="lg"
          variant="primary"
          leftIcon={<HelpCircle className="h-4 w-4" />}
          disabled={passing}
          onClick={onAnswer}
        >
          {qt('answerQuestion')}
        </AppButton>
      )}
      <div className="mt-2 flex gap-2">
        <motion.button
          type="button"
          whileTap={{ scale: PRESS_SCALE }}
          transition={SPRING.snappy}
          onClick={onViewProfile}
          className={cn(
            'flex-1 rounded-2xl border border-app bg-surface px-4 py-3 text-caption font-bold text-app'
          )}
        >
          {qt('viewProfile')}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: PRESS_SCALE }}
          transition={SPRING.snappy}
          disabled={passing}
          onClick={onPass}
          className="flex-1 rounded-2xl border border-app bg-surface px-4 py-3 text-caption font-bold text-app-muted disabled:opacity-60"
        >
          {passing ? <Loader2 className="mx-auto h-4 w-4 animate-spin" aria-hidden="true" /> : qt('skipForNow')}
        </motion.button>
      </div>
    </div>
  );
};
