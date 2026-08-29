import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import type { Product } from '@capgo/native-purchases';
import { ArrowLeft, Clock3, Sparkles, Zap } from 'lucide-react';
import { apiClient } from '../../services/api/apiClient';
import { useAuthStore } from '../../stores/useAuthStore';
import { useEntitlementsQuery, QUERY_KEYS } from '../../hooks/useQueries';
import { getPhotoUrl } from '../../services/media/mediaService';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { nativeHaptics } from '../../native/haptics';
import { DURATION } from '../../motion/tokens';
import { nativeIap } from '../../native/iap';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAppTranslation } from '../../i18n/appLocale';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const RadarRing: React.FC<{ delay: number; reduceMotion: boolean }> = ({ delay, reduceMotion }) => {
  if (reduceMotion) {
    return <div className="absolute inset-0 rounded-full border-2 border-pink-500/25" />;
  }
  return (
    <motion.div
      className="absolute inset-0 rounded-full border-2 border-pink-500/60"
      initial={{ scale: 1, opacity: 0.7 }}
      animate={{ scale: 2.4, opacity: 0 }}
      transition={{ duration: DURATION.radarCycle, repeat: Infinity, delay, ease: 'easeOut' }}
    />
  );
};

export const BoostScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const {
    data: entitlements,
    isLoading: isLoadingEntitlements,
    isError: isEntitlementsError,
    refetch: refetchEntitlements,
  } = useEntitlementsQuery();

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isStoreLoading, setIsStoreLoading] = useState(true);
  const [boostProduct, setBoostProduct] = useState<Product | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  // A boost activated in a previous session is still running server-side — reflect it
  // once entitlements load instead of showing the "start boost" prompt for an active boost.
  useEffect(() => {
    if (!entitlements?.boostActiveUntil) return;
    const until = new Date(entitlements.boostActiveUntil).getTime();
    if (until > Date.now()) setExpiresAt(until);
  }, [entitlements?.boostActiveUntil]);

  useEffect(() => {
    let active = true;
    nativeIap.getBoostProduct()
      .then((product) => { if (active) setBoostProduct(product); })
      .catch(() => { if (active) setBoostProduct(null); })
      .finally(() => { if (active) setIsStoreLoading(false); });
    return () => { active = false; };
  }, []);

  const isActive = !!expiresAt && expiresAt > now;
  const boostsRemaining = typeof entitlements?.boostCount === 'number' ? entitlements.boostCount : 0;
  const subscriptionTier = entitlements?.subscriptionTier || 'FREE';
  const canActivate = boostsRemaining > 0;
  const remainingMs = isActive ? expiresAt! - now : 0;
  const progress = Math.max(0, Math.min(100, (remainingMs / (30 * 60 * 1000)) * 100));
  const boostStateLabel = isActive
    ? t('ownProfilePremiumActiveLabel')
    : subscriptionTier === 'GOLD'
      ? 'Ryvo Gold'
      : subscriptionTier === 'PLUS'
        ? 'Ryvo Plus'
        : t('boostFreeTierLabel');

  const handleActivateBoost = async () => {
    setErrorMsg('');
    setIsLoading(true);
    nativeHaptics.impact();
    try {
      // /api/discovery/boost is AdMob/subscription-only and 403s for free-credit users —
      // this is the endpoint that actually consumes a boost_count credit atomically.
      const res: any = await apiClient.post('/api/user/boost/activate');
      const expires = res?.data?.boostActiveUntil;
      setExpiresAt(expires ? new Date(expires).getTime() : Date.now() + 30 * 60 * 1000);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.entitlements });
    } catch (err: any) {
      setErrorMsg(err.message || t('boostActivateFailedError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchaseBoost = async () => {
    setErrorMsg('');
    setIsPurchasing(true);
    try {
      await nativeIap.purchaseBoost();
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.entitlements });
    } catch (err: any) {
      setErrorMsg(err.message || t('boostPurchaseFailedError'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const photoUrl = getPhotoUrl(user?.photos?.[0]) || user?.photoUrl;

  return (
    <div className="h-full w-full overflow-y-auto bg-app px-4 pb-8 text-app no-scrollbar select-none">
      <header className="pt-safe my-2 flex items-center justify-between">
        <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <div className="flex items-center gap-1.5">
          <AppLogo size="sm" variant="icon" />
          <h3 className="text-heading text-app">Boost</h3>
        </div>
        <div className="w-9" />
      </header>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-4 w-full max-w-sm overflow-hidden rounded-[28px] border border-pink-500/25 bg-gradient-to-br from-pink-500/10 via-surface to-violet-500/10 shadow-elevated">
        <div className="relative flex items-center gap-5 px-5 py-6">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-pink-500/15 blur-3xl" />
          <div className="relative grid h-32 w-32 shrink-0 place-items-center">
            <RadarRing delay={0} reduceMotion={!!reduceMotion} />
            <RadarRing delay={1.2} reduceMotion={!!reduceMotion} />
            <div className="relative z-10 rounded-full bg-brand-gradient p-1 shadow-elevated shadow-pink-500/30">
              <ProfileAvatarFrame photoUrl={photoUrl} name={user?.name} activeFrameId={user?.activeFrameId} verified={user?.verified} size="xl" eager />
            </div>
            <div className="absolute bottom-1 right-1 z-30 grid h-9 w-9 place-items-center rounded-full border-2 border-surface bg-brand-gradient shadow-elevated">
              <Zap className="h-4.5 w-4.5 fill-current text-white" />
            </div>
          </div>
          <div className="relative min-w-0 text-left">
            <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2.5 py-1 text-micro font-black text-pink-500"><Sparkles className="h-3 w-3" /> {boostStateLabel}</span>
            <h1 className="text-heading font-black text-app">{t('boostHeroTitle')}</h1>
            <p className="mt-2 text-caption normal-case leading-relaxed text-app-muted">{t('boostHeroDescription')}</p>
          </div>
        </div>
      </motion.section>

      {errorMsg && (
        <div className="mx-auto mt-4 w-full max-w-sm rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-center text-caption font-bold text-red-500">
          {errorMsg}
        </div>
      )}

      {isLoadingEntitlements ? (
        <section className="mx-auto mt-4 w-full max-w-sm space-y-4 rounded-3xl border border-app bg-surface p-5 shadow-soft" aria-label={t('boostLoadingAriaLabel')}>
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-14 w-full rounded-[20px]" />
        </section>
      ) : isEntitlementsError ? (
        <section className="mx-auto mt-4 w-full max-w-sm rounded-3xl border border-app bg-surface p-5 text-center shadow-soft">
          <p className="text-body font-extrabold text-app">{t('boostEntitlementsLoadFailedTitle')}</p>
          <p className="mt-1 text-caption normal-case text-app-muted">{t('boostEntitlementsLoadFailedSubtitle')}</p>
          <AppButton className="mt-4" variant="secondary" size="md" fullWidth onClick={() => void refetchEntitlements()}>
            {t('retryButton')}
          </AppButton>
        </section>
      ) : isActive ? (
        <section className="mx-auto mt-4 w-full max-w-sm rounded-3xl border border-pink-500 bg-surface p-5 shadow-elevated">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-extrabold text-pink-500"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-pink-500" /><span>{t('boostActiveLabel')}</span></div>
            <Clock3 className="h-5 w-5 text-app-muted" />
          </div>
          <p className="mt-3 text-title tabular-nums text-app">{t('boostActiveWithTimeTemplate').replace('{time}', formatRemaining(remainingMs))}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-app-secondary"><div className="h-full rounded-full bg-brand-gradient transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-caption normal-case text-app-muted">{t('boostActiveDescription')}</p>
        </section>
      ) : (
        <section className="mx-auto mt-4 w-full max-w-sm rounded-3xl border border-app bg-surface p-5 shadow-soft">
          <div className="mb-5">
            <p className="text-body font-extrabold text-app">{subscriptionTier === 'GOLD' ? t('boostGoldTierLabel') : subscriptionTier === 'PLUS' ? t('boostPlusTierLabel') : t('boostNoCreditsLabel')}</p>
            <p className="mt-1 text-caption normal-case text-app-muted">{t('boostRemainingCreditsTemplate').replace('{count}', String(boostsRemaining))}</p>
          </div>

          {canActivate ? (
            <AppButton variant="primary" size="lg" fullWidth loading={isLoading} onClick={handleActivateBoost}>
              {t('boostStartAction')}
            </AppButton>
          ) : isStoreLoading ? (
            <div className="space-y-3"><Skeleton className="h-14 w-full rounded-[20px]" /><Skeleton className="mx-auto h-5 w-32" /></div>
          ) : boostProduct ? (
            <div className="space-y-3">
              <AppButton variant="primary" size="lg" fullWidth loading={isPurchasing} onClick={handlePurchaseBoost}>{t('boostBuyWithPriceTemplate').replace('{price}', boostProduct.priceString)}</AppButton>
              <AppButton variant="secondary" size="md" fullWidth onClick={() => navigate('/premium')}>{t('boostReviewPlansAction')}</AppButton>
            </div>
          ) : (
            <AppButton variant="primary" size="lg" fullWidth onClick={() => navigate('/premium')}>
              {t('boostExplorePlusGoldAction')}
            </AppButton>
          )}
        </section>
      )}
    </div>
  );
};
