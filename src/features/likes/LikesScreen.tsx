import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Lock, Star } from 'lucide-react';
import { useInboundLikesQuery, useEntitlementsQuery, useMarkLikesSeenMutation } from '../../hooks/useQueries';
import { normalizeMediaUrl } from '../../services/media/mediaService';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { PremiumBadge } from '../../components/ui/Badge';
import { AppButton } from '../../components/ui/AppButton';
import { AppLogo } from '../../components/ui/AppLogo';

export const LikesScreen: React.FC = () => {
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
            <h2 className="text-title text-app">Seni Beğenenler</h2>
            <p className="text-caption text-app-muted mt-0.5 normal-case">Sana ilgi duyan kişileri keşfet</p>
          </div>
        </div>
        {!isLoading && (
          <div className="px-3 py-1.5 rounded-full bg-surface border border-app text-caption font-extrabold text-pink-500 flex items-center gap-1.5 shadow-soft">
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>{likesList.length} Kişi</span>
          </div>
        )}
      </header>

      {/* Non-Premium Banner CTA */}
      {!isLoading && !isPremium && likesList.length > 0 && (
        <div className="my-4 p-4 rounded-2xl bg-brand-gradient text-white flex items-center justify-between shadow-elevated shadow-pink-500/20">
          <div className="flex items-center gap-3">
            <PremiumBadge label="Ryvo Gold" className="text-[#3A2A05]" />
            <div>
              <h4 className="text-caption font-extrabold">Seni Beğenenleri Gör</h4>
              <p className="text-micro text-white/80 normal-case">Fotoğrafların kilidini açmak için Ryvo Gold’a geç</p>
            </div>
          </div>
          <AppButton
            variant="secondary"
            size="sm"
            className="bg-white text-pink-600 border-0"
            onClick={() => navigate('/premium')}
          >
            Yükselt
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
            title="Yeni Beğeni Yok"
            subtitle="Seni beğenen yeni kişiler geldiğinde burada göreceksin."
            actionLabel="Profili Güçlendir"
            onAction={() => navigate('/boost')}
          />
        </div>
      )}

      {/* Likes Grid */}
      {!isLoading && likesList.length > 0 && (
        <div className="grid grid-cols-2 gap-3 my-2">
          {likesList.map((item: any, idx: number) => {
            const user = item.user || item;
            const photoUrl = normalizeMediaUrl(user.photoUrl || user.photos?.[0]?.url);
            // Trust the backend's canReveal (factors premium + match-note exceptions) —
            // it used to fall back to a `blurred` field the API never actually sends,
            // which meant every card blurred for non-premium users regardless of canReveal.
            const isBlurred = item.canReveal === false;

            return (
              <div
                key={user.id || idx}
                className="relative h-60 rounded-[20px] overflow-hidden bg-surface border border-app shadow-soft"
              >
                <img
                  src={photoUrl}
                  alt={user.name}
                  loading="lazy"
                  decoding="async"
                  className={`w-full h-full object-cover transition-all ${
                    isBlurred ? 'blur-xl scale-110 opacity-70' : ''
                  }`}
                />

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
                    <span className="text-caption font-extrabold text-white">Kilidi Aç</span>
                  </button>
                ) : (
                  <button
                    onClick={() => navigate(`/discover/${user.id}`)}
                    className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 text-white text-start"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <h4 className="text-body font-extrabold">{user.name}</h4>
                      <span className="text-caption text-gray-300">{user.age}</span>
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
