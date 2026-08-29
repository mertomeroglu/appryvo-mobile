import React, { useMemo, useState } from 'react';
import { formatDisplayAge } from '../../lib/profileLabels';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Cigarette,
  Crown,
  Flag,
  Heart,
  Languages,
  MapPin,
  MessageCircle,
  Ruler,
  Share2,
  Star,
  UserMinus,
  Volume2,
  Wine,
  X,
} from 'lucide-react';
import { useDiscoveryUserQuery, useEntitlementsQuery, useLikeMutation, useMatchesQuery, usePassMutation, useFollowStatusQuery } from '../../hooks/useQueries';
import { FollowButton } from '../../components/FollowButton';
import { TrustProfileSection } from '../../components/TrustProfileSection';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { VerifiedBadge } from '../../components/ui/Badge';
import { nativeHaptics } from '../../native/haptics';
import { nativeShare } from '../../native/share';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { IconButton } from '../../components/ui/IconButton';
import { AppButton } from '../../components/ui/AppButton';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { ZodiacIcon } from '../../components/ui/ZodiacIcon';
import { SafetyReportModal } from '../../components/SafetyReportModal';
import { MatchModal } from '../../components/MatchModal';
import {
  getRelationshipGoalLabels,
  getSmokingLabel,
  getDrinkingLabel,
  getChildrenStatusLabel,
  getFamilyPlansLabel,
  getZodiacLabel,
} from '../../lib/profileLabels';
import { getLocalizedStoredLanguageName } from '../../lib/languages';
import { getLocalizedInterestLabel } from '../../lib/interestLabels';
import { useAppTranslation } from '../../i18n/appLocale';

function normalizePhotos(user: any): string[] {
  if (Array.isArray(user?.photos) && user.photos.length > 0) {
    return user.photos.map((p: any) => (typeof p === 'object' ? p?.url : p)).filter(Boolean);
  }
  return user?.photoUrl ? [user.photoUrl] : [];
}

export const FullProfileScreen: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading, isError, refetch } = useDiscoveryUserQuery(userId);
  const { locale, t } = useAppTranslation();
  const { data: entitlements } = useEntitlementsQuery();
  const { data: followStatus } = useFollowStatusQuery(userId);
  const { data: matches } = useMatchesQuery();
  const likeMutation = useLikeMutation();
  const passMutation = usePassMutation();

  // This profile route is shared by Discover/Likes (someone not yet matched) and by
  // already-matched contexts -- the chat header's "view profile" and the map/stories/
  // connections list all link here too, for a person who may already be a match. Like/Pass/
  // Super Like on an existing match is meaningless (and re-liking just no-ops the reciprocal
  // match server-side), so the action bar must branch on match state instead of always
  // offering to (re)swipe.
  const existingMatch = useMemo(
    () => (Array.isArray(matches) ? matches.find((match: any) => match.user?.id === userId) : undefined),
    [matches, userId]
  );

  const [photoIndex, setPhotoIndex] = useState(0);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isBlockOpen, setIsBlockOpen] = useState(false);
  const [matchResult, setMatchResult] = useState<{ isOpen: boolean; matchUser?: any; matchId?: string }>({
    isOpen: false,
  });

  if (isLoading) {
    return (
      <div className="relative h-full w-full bg-app overflow-hidden">
        <Skeleton variant="media" className="absolute inset-0 rounded-none aspect-auto" />
        <IconButton
          aria-label={t('backButtonLabel')}
          variant="surface"
          size="md"
          onClick={() => navigate(-1)}
          className="absolute top-safe-offset start-4 z-10"
        >
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <div className="absolute inset-x-0 bottom-0 p-6 space-y-2">
          <Skeleton variant="title" className="bg-white/10" />
          <Skeleton variant="text" className="w-1/2 bg-white/10" />
        </div>
      </div>
    );
  }
  if (isError || !user) {
    return <ErrorState message={t('fullProfileLoadFailedError')} onRetry={() => refetch()} />;
  }

  const photos = normalizePhotos(user);

  const handleLike = async (isSuperLike: boolean) => {
    if (!userId) return;
    if (
      isSuperLike &&
      entitlements &&
      entitlements.isUnlimitedSuperLike !== true &&
      Number(entitlements.superlikeCount ?? entitlements.superLikeCount ?? 0) <= 0
    ) {
      navigate('/premium');
      return;
    }
    nativeHaptics.impact();
    try {
      const res: any = await likeMutation.mutateAsync({ targetUserId: userId, isSuperLike });
      // Backend returns { status, isMatch, matchId } directly -- no `data` wrapper, no
      // `matchUser` (it never sends one; build it from the profile already in hand).
      if (res?.isMatch) {
        setMatchResult({ isOpen: true, matchUser: user, matchId: res.matchId });
      } else {
        navigate(-1);
      }
    } catch (err: any) {
      console.error('[FULL PROFILE LIKE ERROR]', err);
      if (isSuperLike && err?.code === 'SUPERLIKE_QUOTA_EXHAUSTED') navigate('/premium');
    }
  };

  const handlePass = async () => {
    if (!userId) return;
    nativeHaptics.impact();
    try {
      await passMutation.mutateAsync(userId);
    } catch (err) {
      console.error('[FULL PROFILE PASS ERROR]', err);
    } finally {
      navigate(-1);
    }
  };

  const voicePromptUrl = user.voicePrompt?.url;
  const prompts: any[] = Array.isArray(user.prompts) ? user.prompts : [];

  return (
    <div className="h-full w-full overflow-y-auto no-scrollbar bg-app text-app">
      {/* Hero photo */}
      <div className="relative w-full h-[58vh] max-h-[520px] bg-app-secondary rounded-b-[34px] overflow-hidden">
        {photos[photoIndex] ? (
          <img
            src={normalizeMediaUrl(photos[photoIndex])}
            alt={user.name}
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : null}

        {photos.length > 1 && (
          <>
            <div className="absolute top-4 inset-x-4 flex gap-1.5 z-20">
              {photos.map((_, i) => (
                <div
                  key={i}
                  className={`h-[3px] flex-1 rounded-full transition-colors ${
                    i === photoIndex ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
            <div className="absolute inset-x-0 top-0 h-[85%] flex z-10">
              <button
                aria-label={t('fullProfilePrevPhotoAriaLabel')}
                className="w-1/2 h-full"
                onClick={() => setPhotoIndex((i) => Math.max(i - 1, 0))}
              />
              <button
                aria-label={t('fullProfileNextPhotoAriaLabel')}
                className="w-1/2 h-full"
                onClick={() => setPhotoIndex((i) => Math.min(i + 1, photos.length - 1))}
              />
            </div>
          </>
        )}

        {/* RYVO PATCH V2 01 issue 2: was `top-4`, a flat 16px from the top of this full-bleed hero
            image (no header in normal flow above it to reserve space) that ignored
            env(safe-area-inset-top) entirely. On notched/Dynamic-Island iPhones part of the
            button's hit area sat under the physically-obstructed sensor housing, making it hard
            or impossible to press -- while non-notched iPhones (SE, etc.) were unaffected,
            matching the "some iPhones" bug report. Same fix idiom as SocialMapScreen.tsx. */}
        <div className="absolute top-safe-offset start-4 z-20">
          <IconButton aria-label={t('backButtonLabel')} variant="overlay" size="md" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
        </div>

        <div className="absolute top-4 end-4 z-20">
          <IconButton
            aria-label={t('fullProfileShareAriaLabel')}
            variant="overlay"
            size="md"
            onClick={() => {
              if (!userId) return;
              void nativeShare.share({
                title: user.name,
                text: t('ownProfileShareTextTemplate').replace('{name}', user.name),
                url: `https://appryvo.online/discover/${userId}`,
                dialogTitle: t('ownProfileShareDialogTitle'),
              }).catch(() => {});
            }}
          >
            <Share2 className="w-5 h-5" />
          </IconButton>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent p-6 text-white z-10">
          <div className="flex items-end gap-3">
            <ProfileAvatarFrame
              photoUrl={photos[0]}
              name={user.name}
              activeFrameId={user.activeFrameId}
              verified={user.verified}
              countryCode={user.countryCode}
              showCountryFlag
              size="lg"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <h1 className="text-3xl font-black">{user.name}</h1>
                {formatDisplayAge(user.age) !== undefined && <span className="text-2xl font-bold text-gray-300">{formatDisplayAge(user.age)}</span>}
                {user.verified && <VerifiedBadge size={24} />}
                {user.isPremium && <Crown className="w-6 h-6 text-[#F5B942] fill-current" />}
              </div>
              {(user.city || typeof user.distanceKm === 'number') && (
                <div className="flex items-center gap-1.5 text-xs text-gray-300 mt-1">
                  <MapPin className="w-4 h-4 text-pink-500" />
                  {user.city && <span>{user.city}</span>}
                  {typeof user.distanceKm === 'number' && <span>• {t('fullProfileDistanceAwayTemplate').replace('{distance}', String(user.distanceKm))}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-4 pb-44">
        <div className="flex items-center justify-between gap-3 bg-surface border border-app p-4 rounded-2xl">
          <button
            type="button"
            onClick={() => userId && navigate(`/connections/${userId}`)}
            className="min-w-0 text-start"
          >
            <span className="block text-caption font-bold text-app normal-case">
              {followStatus ? t('ownProfileFollowStatsTemplate').replace('{followers}', String(followStatus.followersCount)).replace('{following}', String(followStatus.followingCount)) : t('connectionsTitle')}
            </span>
            {followStatus?.isFollowedBy && (
              <span className="block text-micro text-app-muted normal-case mt-0.5">{t('fullProfileFollowsYouLabel')}</span>
            )}
          </button>
          {userId && <FollowButton userId={userId} size="sm" />}
        </div>

        {user.bio && (
          <div className="bg-surface border border-app p-4 rounded-2xl space-y-1">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('bioSectionLabel')}</h4>
            <p className="text-body text-app leading-relaxed">{user.bio}</p>
          </div>
        )}

        {getRelationshipGoalLabels(user.relationshipGoals || user.relationshipGoal, locale).length > 0 && (
          <div className="bg-surface border border-app p-4 rounded-2xl space-y-1">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('fullProfileLookingForLabel')}</h4>
            <div className="flex flex-wrap gap-2 pt-1">
              {getRelationshipGoalLabels(user.relationshipGoals || user.relationshipGoal, locale).map((label) => (
                <span key={label} className="text-caption px-3 py-1.5 rounded-full bg-app-secondary border border-app text-app font-semibold">
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {user.job && (
          <div className="bg-surface border border-app p-4 rounded-2xl space-y-1">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('fullProfileBasicInfoLabel')}</h4>
            <p className="flex items-center gap-2 text-body text-app">
              <Briefcase className="w-4 h-4 text-app-muted" />
              {user.job}
            </p>
          </div>
        )}

        {(user.zodiac || user.heightCm || (getSmokingLabel(user.smokingStatus, locale) || getDrinkingLabel(user.drinkingStatus, locale)) ||
          getChildrenStatusLabel(user.childrenStatus, locale) || getFamilyPlansLabel(user.familyPlans, locale)) && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('lifestyleSectionLabel')}</h4>
            <div className="flex flex-wrap gap-2">
              {user.zodiac && getZodiacLabel(user.zodiac, locale) && (
                <span className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  <ZodiacIcon sign={user.zodiac} className="text-purple-400" />
                  {getZodiacLabel(user.zodiac, locale)}
                </span>
              )}
              {user.heightCm && (
                <span className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  <Ruler className="w-3.5 h-3.5 text-indigo-400" />
                  {user.heightCm} cm
                </span>
              )}
              {getSmokingLabel(user.smokingStatus, locale) && (
                <span className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  <Cigarette className="w-3.5 h-3.5 text-app-muted" />
                  {getSmokingLabel(user.smokingStatus, locale)}
                </span>
              )}
              {getDrinkingLabel(user.drinkingStatus, locale) && (
                <span className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  <Wine className="w-3.5 h-3.5 text-app-muted" />
                  {getDrinkingLabel(user.drinkingStatus, locale)}
                </span>
              )}
              {getChildrenStatusLabel(user.childrenStatus, locale) && (
                <span className="text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  {getChildrenStatusLabel(user.childrenStatus, locale)}
                </span>
              )}
              {getFamilyPlansLabel(user.familyPlans, locale) && (
                <span className="text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium">
                  {getFamilyPlansLabel(user.familyPlans, locale)}
                </span>
              )}
            </div>
          </div>
        )}

        {Array.isArray(user.languages) && user.languages.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('fullProfileSpokenLanguagesLabel')}</h4>
            <div className="flex flex-wrap gap-2">
              {user.languages.map((lang: string, idx: number) => (
                <span
                  key={idx}
                  className="flex items-center gap-1.5 text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium"
                >
                  <Languages className="w-3.5 h-3.5 text-teal-400" />
                  {getLocalizedStoredLanguageName(lang, locale)}
                </span>
              ))}
            </div>
          </div>
        )}

        {voicePromptUrl && (
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 p-4 rounded-2xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-pink-500 text-white">
                <Volume2 className="w-5 h-5" />
              </div>
              <h4 className="text-caption font-bold text-app">{t('fullProfileVoiceIntroLabel')}</h4>
            </div>
            <audio src={normalizeMediaUrl(voicePromptUrl)} controls className="w-full h-9" />
          </div>
        )}

        {Array.isArray(user.interests) && user.interests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('interestsSectionLabel')}</h4>
            <div className="flex flex-wrap gap-2">
              {user.interests.map((interest: string, idx: number) => (
                <span
                  key={idx}
                  className="text-caption px-3 py-1.5 rounded-full bg-surface border border-app text-app font-medium"
                >
                  {getLocalizedInterestLabel(interest, locale)}
                </span>
              ))}
            </div>
          </div>
        )}

        {prompts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-micro text-app-muted uppercase tracking-wider">{t('fullProfilePromptsLabel')}</h4>
            {prompts.map((prompt: any, idx: number) => {
              const question = prompt?.question || prompt?.prompt;
              const answer = prompt?.answer;
              if (!question || !answer) return null;
              return (
                <div key={idx} className="bg-surface border border-app p-4 rounded-2xl space-y-1">
                  <h5 className="text-micro text-app-muted">{question}</h5>
                  <p className="text-body text-app">{answer}</p>
                </div>
              );
            })}
          </div>
        )}

        <TrustProfileSection userId={userId} />

        <button
          type="button"
          onClick={() => setIsReportOpen(true)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-start active:scale-[0.99] transition-transform"
        >
          <Flag className="w-5 h-5 text-[#FF4B55] shrink-0" />
          <span className="min-w-0">
            <span className="block text-body font-bold text-[#FF4B55]">{t('fullProfileReportAction')}</span>
            <span className="block text-micro text-app-muted normal-case break-words">
              {t('fullProfileReportDescription')}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsBlockOpen(true)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-start active:scale-[0.99] transition-transform"
        >
          <UserMinus className="w-5 h-5 text-[#FF4B55] shrink-0" />
          <span className="min-w-0">
            <span className="block text-body font-bold text-[#FF4B55]">{t('fullProfileBlockAction')}</span>
            <span className="block text-micro text-app-muted normal-case break-words">
              {t('fullProfileBlockDescription')}
            </span>
          </span>
        </button>
      </div>

      {/* Actions */}
      <div
        className="fixed bottom-0 inset-x-0 pb-safe pt-8"
        style={{ background: 'linear-gradient(to top, var(--color-bg) 55%, transparent)' }}
      >
        {existingMatch ? (
          <div className="px-6 pb-6">
            <AppButton
              variant="primary"
              size="lg"
              fullWidth
              leftIcon={<MessageCircle className="w-5 h-5" />}
              onClick={() => navigate(`/chat/${existingMatch.id}`)}
            >
              {t('sendMessageButtonLabel')}
            </AppButton>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-5 pb-6">
            <button
              onClick={handlePass}
              className="w-14 h-14 rounded-full bg-surface border border-app text-[#FF4B55] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
            >
              <X className="w-7 h-7 stroke-[2.5]" />
            </button>
            <button
              onClick={() => handleLike(true)}
              className="w-12 h-12 rounded-full bg-surface border border-app text-[#25D9D0] flex items-center justify-center shadow-elevated active:scale-90 transition-transform"
            >
              <Star className="w-6 h-6 fill-current" />
            </button>
            <button
              onClick={() => handleLike(false)}
              className="w-16 h-16 rounded-full bg-brand-gradient text-white flex items-center justify-center shadow-xl shadow-pink-500/30 active:scale-90 transition-transform"
            >
              <Heart className="w-8 h-8 fill-current" />
            </button>
          </div>
        )}
      </div>

      <SafetyReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        targetUserId={userId}
        targetUserName={user.name}
      />

      <SafetyReportModal
        isOpen={isBlockOpen}
        onClose={() => setIsBlockOpen(false)}
        type="block"
        targetUserId={userId}
        targetUserName={user.name}
        onSuccess={() => navigate(-1)}
      />

      <MatchModal
        isOpen={matchResult.isOpen}
        onClose={() => {
          setMatchResult({ isOpen: false });
          navigate(-1);
        }}
        matchedUser={matchResult.matchUser}
        matchId={matchResult.matchId}
      />
    </div>
  );
};
