import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Lock, Star } from 'lucide-react';
import { useInboundLikesQuery, useEntitlementsQuery, useMarkLikesSeenMutation } from '../../hooks/useQueries';
import { normalizeMediaUrl, getPhotoUrl } from '../../services/media/mediaService';
import { formatDisplayAge } from '../../lib/profileLabels';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { PremiumBadge } from '../../components/ui/Badge';
import { AppButton } from '../../components/ui/AppButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { useAppTranslation } from '../../i18n/appLocale';

function initialsFrom(name?: string) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const LikeCardImage: React.FC<{ src?: string; name?: string; blurred: boolean }> = ({ src, name, blurred }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center font-bold text-white text-title bg-brand-gradient ${
          blurred ? 'blur-md scale-110' : ''
        }`}
      >
        {initialsFrom(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`w-full h-full object-cover transition-all ${blurred ? 'blur-xl scale-110 opacity-70' : ''}`}
    />
  );
};

export const LikesScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const { data: likes, isLoading } = useInboundLikesQuery();
  const { data: entitlements } = useEntitlementsQuery();
  const markSeen = useMarkLikesSeenMutation();
  const navigate = useNavigate();

  useEffect(() => {
    markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPremium = entitlements?.isPremium === true;
  const likesList = likes || [];

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar pb-24 select-none">
      {/* Top Title Bar */}
      <header className="pt-safe flex items-center justify-between my-2">
        <div className="flex items-center gap-2.5">
          <AppLogo variant="icon" size="sm" />
          <div>
            <h2 className="text-title text-app">{t('likesScreenTitle')}</h2>
            <p className="text-caption text-app-muted mt-0.5 normal-case">{t('likesScreenSubtitle')}</p>
          </div>
        </div>
        {!isLoading && (
          <div className="px-3 py-1.5 rounded-full bg-surface border border-app text-caption font-extrabold text-pink-500 flex items-center gap-1.5 shadow-soft">
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>{t('likesCountTemplate').replace('{count}', String(likesList.length))}</span>
          </div>
        )}
      </header>

      {/* Non-Premium Banner CTA */}
      {!isLoading && !isPremium && likesList.length > 0 && (
        <div className="my-4 p-4 rounded-2xl bg-brand-gradient text-white flex items-center gap-3 shadow-elevated shadow-pink-500/20">
          <div className="min-w-0 flex-1">
            <PremiumBadge label="Ryvo Gold" className="text-[#3A2A05] mb-2" />
            <h4 className="text-body font-extrabold leading-snug">{t('likesUnlockBannerTitle')}</h4>
            <p className="text-caption text-white/80 normal-case leading-relaxed mt-0.5">
              {t('likesUnlockBannerDescription')}
            </p>
          </div>
          <AppButton
            variant="secondary"
            size="sm"
            className="bg-white text-pink-600 border-0 shrink-0"
            onClick={() => navigate('/premium')}
          >
            {t('ownProfileUpgradeLabel')}
          </AppButton>
        </div>
      )}

      {/* Loading skeleton grid */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 my-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="media" className="h-60 aspect-auto" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && likesList.length === 0 && (
        <div className="my-auto py-12">
          <EmptyState
            icon="♡"
            title={t('likesEmptyTitle')}
            subtitle={t('likesEmptySubtitle')}
            actionLabel={t('likesBoostProfileAction')}
            onAction={() => navigate('/boost')}
          />
        </div>
      )}

      {/* Likes Grid */}
      {!isLoading && likesList.length > 0 && (
        <div className="grid grid-cols-2 gap-3 my-2">
          {likesList.map((item: any, idx: number) => {
            const user = item.user || item;
            // Trust the backend's canReveal (factors premium + match-note exceptions) —
            // it used to fall back to a `blurred` field the API never actually sends,
            // which meant every card blurred for non-premium users regardless of canReveal.
            const isBlurred = item.canReveal === false;
            // `photos[0]` is always a plain URL string on this endpoint (the medium photo when
            // revealed, a server-side blurred derivative when locked) -- never `{url}` -- but
            // getPhotoUrl() tolerates either shape so this stays correct if that ever changes.
            // When locked, never fall through to `photoUrl` (the original, unblurred asset) --
            // only `photoBlurUrl` is a safe fallback for a locked card.
            const primaryPhoto = getPhotoUrl(user.photos?.[0]);
            const rawPhoto = isBlurred ? primaryPhoto || user.photoBlurUrl : primaryPhoto || user.photoUrl;
            const photoUrl = rawPhoto ? normalizeMediaUrl(rawPhoto) : undefined;

            return (
              <div
                key={user.id || idx}
                className="relative h-60 rounded-[20px] overflow-hidden bg-surface border border-app shadow-soft"
              >
                <LikeCardImage src={photoUrl} name={user.name} blurred={isBlurred} />

                {item.isSuperLike && (
                  <span className="absolute top-2 end-2 w-7 h-7 rounded-full bg-[#25D9D0] border-2 border-white/80 flex items-center justify-center shadow-md z-10">
                    <Star className="w-3.5 h-3.5 text-white fill-current" />
                  </span>
                )}

                {isBlurred ? (
                  <button
                    onClick={() => navigate('/premium')}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 p-4 text-center"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-2 shadow-elevated">
                      <Lock className="w-5 h-5" />
                    </div>
                    <span className="text-caption font-extrabold text-white">{t('likesUnlockAction')}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => navigate(`/discover/${user.id}`)}
                    className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 text-white text-start"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <h4 className="text-body font-extrabold">{user.name}</h4>
                      {formatDisplayAge(user.age) !== undefined && (
                        <span className="text-caption text-gray-300">{formatDisplayAge(user.age)}</span>
                      )}
                    </div>
                    {user.city && <p className="text-micro text-gray-400 normal-case">{user.city}</p>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
