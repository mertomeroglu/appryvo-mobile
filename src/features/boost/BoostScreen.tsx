import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Zap } from 'lucide-react';
import { apiClient } from '../../services/api/apiClient';
import { useAuthStore } from '../../stores/useAuthStore';
import { useEntitlementsQuery, QUERY_KEYS } from '../../hooks/useQueries';
import { normalizeMediaUrl, getPhotoUrl } from '../../services/media/mediaService';
import { Avatar } from '../../components/ui/Avatar';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { nativeHaptics } from '../../native/haptics';
import { DURATION } from '../../motion/tokens';

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
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const { data: entitlements, isLoading: isLoadingEntitlements } = useEntitlementsQuery();

  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(false);
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

  const isActive = !!expiresAt && expiresAt > now;
  const isPremium = entitlements?.isPremium === true;
  const boostsRemaining = typeof entitlements?.boostCount === 'number' ? entitlements.boostCount : 0;
  const canActivate = isPremium || boostsRemaining > 0;

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
      setErrorMsg(err.message || 'Boost etkinleştirilemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  const photoUrl = getPhotoUrl(user?.photos?.[0]) || user?.photoUrl;

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar select-none">
      {/* Top Bar */}
      <header className="pt-safe flex items-center justify-between my-2">
        <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <div className="flex items-center gap-1.5">
          <AppLogo size="sm" variant="icon" />
          <h3 className="text-heading text-app">Profil Boost</h3>
        </div>
        <div className="w-9" />
      </header>

      {/* Hero: centered avatar with radar/pulse */}
      <div className="flex flex-col items-center text-center my-8">
        <div className="relative w-40 h-40 flex items-center justify-center mb-6">
          {isActive && (
            <>
              <RadarRing delay={0} reduceMotion={!!reduceMotion} />
              <RadarRing delay={0.9} reduceMotion={!!reduceMotion} />
              <RadarRing delay={1.8} reduceMotion={!!reduceMotion} />
            </>
          )}
          <div className="relative z-10 p-1 rounded-full bg-brand-gradient shadow-elevated shadow-pink-500/30">
            <Avatar
              src={photoUrl ? normalizeMediaUrl(photoUrl) : undefined}
              name={user?.name}
              size="xl"
              className="w-32 h-32 border-4 border-app"
            />
          </div>
          <div className="absolute -bottom-1 -right-1 z-20 w-10 h-10 rounded-full bg-brand-gradient flex items-center justify-center shadow-elevated border-2 border-app">
            <Zap className="w-5 h-5 text-white fill-current" />
          </div>
        </div>

        <h1 className="text-title text-brand-gradient mb-2">10 Kat Daha Fazla Görüntülenme</h1>
        <p className="text-caption text-app-muted max-w-xs leading-relaxed normal-case">
          30 dakika boyunca profilin bölgendeki keşfet akışında en üst sıraya yerleştirilir.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center">
          {errorMsg}
        </div>
      )}

      {/* Status Card */}
      {isActive ? (
        <div className="p-6 rounded-3xl bg-surface border border-pink-500 text-center space-y-2 my-auto shadow-elevated">
          <div className="flex items-center justify-center gap-2 text-pink-500 font-extrabold">
            <span>Boost Aktif!</span>
          </div>
          <p className="text-title tabular-nums text-app">{formatRemaining(expiresAt! - now)}</p>
          <p className="text-caption text-app-muted normal-case">Profilin şu an bölgende ilk sırada gösteriliyor.</p>
        </div>
      ) : (
        <div className="p-6 rounded-3xl bg-surface border border-app text-center space-y-4 my-auto shadow-soft">
          {!isLoadingEntitlements && (
            <p className="text-body font-extrabold text-app">
              {isPremium
                ? 'VIP üye olarak sınırsız boost hakkına sahipsin'
                : boostsRemaining > 0
                  ? `${boostsRemaining} Ücretsiz Boost Hakkın Var`
                  : 'Ücretsiz Boost Hakkın Kalmadı'}
            </p>
          )}

          {canActivate ? (
            <AppButton variant="primary" size="lg" fullWidth loading={isLoading} onClick={handleActivateBoost}>
              Boost'u Başlat
            </AppButton>
          ) : (
            <AppButton variant="primary" size="lg" fullWidth onClick={() => navigate('/premium')}>
              VIP Ol ve Boost Kazan
            </AppButton>
          )}
        </div>
      )}
    </div>
  );
};
