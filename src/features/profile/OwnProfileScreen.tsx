import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { useFramesQuery, useFollowStatusQuery, useWalletQuery } from '../../hooks/useQueries';
import { computeProfileCompletion } from '../../lib/profileCompletion';
import { formatDisplayAge } from '../../lib/profileLabels';
import { getPhotoUrl } from '../../services/media/mediaService';
import { normalizeCountryCode } from '../../lib/countryFlags';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { VerifiedBadge } from '../../components/ui/Badge';
import { AppLogo } from '../../components/ui/AppLogo';
import { PASSPORT_LABELS, useAppLocaleStore, useAppTranslation } from '../../i18n/appLocale';
import { preloadEditProfileModal } from '../../routes/routePreload';
import { measureProfileMilestone } from '../../services/performance/profilePerformance';
import {
  Crown,
  Zap,
  ShieldCheck,
  Settings,
  Frame,
  Compass,
  Edit3,
  Eye,
  ChevronRight,
  MapPin,
  CheckCircle2,
  Users,
  Share2,
  MailCheck,
} from 'lucide-react';
import { nativeShare } from '../../native/share';
import { CoinStoreSheet } from '../coins/CoinStoreSheet';
import { CoinIcon } from '../gifts/CoinIcon';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { EmailOtpModal } from '../../components/EmailOtpModal';
import { socketService } from '../../services/socket/socketService';

const EditProfileModal = lazy(() => preloadEditProfileModal().then((module) => ({ default: module.EditProfileModal })));

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-micro text-app-muted uppercase tracking-wider px-1 mb-2">{children}</h4>
);

const ProfileRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  accent?: 'default' | 'gold';
  onClick?: () => void;
}> = ({ icon, label, value, accent = 'default', onClick }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`w-full p-3.5 rounded-2xl bg-surface border border-app flex items-center justify-between shadow-soft ${
      onClick ? 'active:scale-[0.99] transition-transform' : ''
    }`}
  >
    <div className="flex items-center gap-3 min-w-0">
      <span className={accent === 'gold' ? 'text-gold' : 'text-pink-500'}>{icon}</span>
      <span className="text-body font-bold text-app truncate">{label}</span>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      {value && <span className="text-caption text-app-muted normal-case">{value}</span>}
      {onClick && <ChevronRight className="w-4 h-4 text-app-muted" />}
    </div>
  </button>
);

export const OwnProfileScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEmailOtpOpen, setIsEmailOtpOpen] = useState(false);
  const [editFocusSection, setEditFocusSection] = useState<string | undefined>(undefined);
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
  const [coinStoreOpen, setCoinStoreOpen] = useState(false);
  const [isRealtimeOnline, setIsRealtimeOnline] = useState(() => socketService.isConnected());
  const locale = useAppLocaleStore((state) => state.locale);
  const shellReadyRef = useRef(false);
  const dataReadyRef = useRef(false);
  const interactiveReadyRef = useRef(false);

  const openEditModal = (section?: string) => {
    setIsCompletionOpen(false);
    setEditFocusSection(section);
    setIsEditModalOpen(true);
    void preloadEditProfileModal();
  };

  const { data: framesData } = useFramesQuery();
  const { data: followStatus } = useFollowStatusQuery(user?.id);
  const { data: wallet } = useWalletQuery();

  const photoUrl = getPhotoUrl(user?.photos?.[0]) || user?.photoUrl;
  const { percent: completion, missing: missingFields } = useMemo(() => computeProfileCompletion(user), [user]);
  const showFlag = user?.showCountryFlag !== false && !!normalizeCountryCode(user?.countryCode);
  const activeFrameName =
    framesData?.frames?.find((f: any) => f.id === (framesData?.activeFrameId || user?.activeFrameId))?.name;
  const verificationComplete = user?.verified === true || user?.verificationState === 'APPROVED';
  const verificationPending = user?.verificationState === 'PENDING';
  const verificationValue = verificationComplete
    ? t('settingsVerifiedLabel')
    : verificationPending
      ? t('settingsVerificationPendingLabel')
      : user?.verificationState === 'REJECTED' || user?.verificationState === 'REVERIFICATION_REQUIRED'
        ? t('settingsVerificationRetryLabel')
        : t('ownProfileVerificationStartLabel');

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      if (shellReadyRef.current) return;
      shellReadyRef.current = true;
      measureProfileMilestone('shell-ready');
    });
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (!user || dataReadyRef.current) return;
    let interactiveFrame = 0;
    const dataFrame = requestAnimationFrame(() => {
      dataReadyRef.current = true;
      measureProfileMilestone('data-ready');
      interactiveFrame = requestAnimationFrame(() => {
        if (interactiveReadyRef.current) return;
        interactiveReadyRef.current = true;
        measureProfileMilestone('interactive');
      });
    });
    return () => {
      cancelAnimationFrame(dataFrame);
      if (interactiveFrame) cancelAnimationFrame(interactiveFrame);
    };
  }, [user]);

  useEffect(() => {
    setIsRealtimeOnline(socketService.isConnected());
    const offConnect = socketService.on('connect', () => setIsRealtimeOnline(true));
    const offDisconnect = socketService.on('disconnect', () => setIsRealtimeOnline(false));
    return () => {
      offConnect();
      offDisconnect();
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar pb-28 select-none">
      <ScreenHeader
        transparent
        className="-mx-4"
        leading={<AppLogo variant="icon" size="sm" />}
        title={t('ownProfileTitle')}
        trailing={<button
          onClick={() => navigate('/profile/preview')}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-app bg-surface px-3 py-2 text-caption font-extrabold text-app shadow-soft transition-transform active:scale-95"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{t('ownProfilePreviewAction')}</span>
        </button>}
      />

      {/* Identity block: avatar ring, nationality flag, verification, name, location, completion */}
      <div className="flex flex-col items-center text-center my-2">
        <ProfileAvatarFrame
          photoUrl={photoUrl}
          name={user?.name}
          activeFrameId={user?.activeFrameId}
          verified={user?.verified}
          countryCode={user?.countryCode}
          showCountryFlag={showFlag}
          online={isRealtimeOnline}
          size="xl"
          eager
        />

        <div className="flex items-center gap-2 mt-3">
          <h2 className="text-title text-app">{user?.name || t('genericUserLabel')}</h2>
          {formatDisplayAge(user?.age) !== undefined && <span className="text-heading text-app-muted">{formatDisplayAge(user?.age)}</span>}
          {/* Verification is a separate, backend-driven signal from nationality -- never
              inferred from or tied to the flag above. */}
          {user?.verified && <VerifiedBadge size={20} />}
        </div>
        <div className="flex items-center gap-1 text-caption text-app-muted font-semibold mt-0.5 normal-case">
          <MapPin className="w-3.5 h-3.5" />
          <span>{user?.city || t('ownProfileNoLocationLabel')}</span>
        </div>

        {/* Followers/following: primary content directly under the identity block, not a
            Settings-nested "My Connections" row -- live counts, tap navigates to the shared
            followers/following list. */}
        {followStatus && (
          <button
            type="button"
            onClick={() => user?.id && navigate(`/connections/${user.id}`)}
            className="mt-2 flex items-center gap-1.5 text-caption font-bold text-app active:opacity-70 transition-opacity"
          >
            <Users className="w-3.5 h-3.5 text-app-muted" />
            <span>
              {t('ownProfileFollowStatsTemplate')
                .replace('{followers}', String(followStatus.followersCount))
                .replace('{following}', String(followStatus.followingCount))}
            </span>
          </button>
        )}

        <div className="w-full max-w-[320px] mt-4">
          {completion < 100 ? (
            <button
              type="button"
              onClick={() => setIsCompletionOpen(true)}
              aria-haspopup="dialog"
              className="relative z-content w-full rounded-2xl border border-app bg-surface p-3.5 text-start shadow-soft touch-manipulation active:scale-[0.98] transition-transform"
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-caption font-bold text-app-muted">
                <span>{t('ownProfileCompleteProfileLabel')}</span>
                <span className="rounded-full bg-pink-500/10 px-2 py-0.5 font-extrabold tabular-nums text-pink-500">%{completion}</span>
              </div>
              <div className="h-2 rounded-full bg-app-secondary overflow-hidden">
                <div
                  className="h-full bg-brand-gradient rounded-full transition-[width]"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </button>
          ) : (
            <div className="rounded-2xl border border-app bg-surface p-3.5 shadow-soft flex items-center justify-center gap-1.5 text-caption font-bold text-success">
              <span>{t('ownProfileReadyLabel')}</span>
              <span>✓</span>
            </div>
          )}
        </div>

      </div>

      {/* Grouped card: profile */}
      <div className="mt-6">
        <SectionLabel>{t('ownProfileSectionLabel')}</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Edit3 className="w-5 h-5" />} label={t('ownProfileEditAction')} onClick={() => openEditModal()} />
          <ProfileRow
            icon={<Share2 className="w-5 h-5" />}
            label={t('ownProfileShareAction')}
            onClick={() => {
              if (!user?.id) return;
              void nativeShare.share({
                title: user.name,
                text: t('ownProfileShareTextTemplate').replace('{name}', user.name),
                url: `https://appryvo.online/discover/${user.id}`,
                dialogTitle: t('ownProfileShareDialogTitle'),
              }).catch(() => {});
            }}
          />
          <ProfileRow
            icon={<ShieldCheck className="w-5 h-5" />}
            label={t('verificationScreenTitle')}
            value={verificationValue}
            onClick={verificationComplete || verificationPending ? undefined : () => navigate('/verification')}
          />
          {/* Optional, and private: this value renders only for the account owner -- no endpoint
              exposes anyone else's email-verification state. */}
          <ProfileRow
            icon={<MailCheck className="w-5 h-5" />}
            label={t('emailOtpRowLabel')}
            value={user?.emailVerified ? t('emailOtpVerifiedValue') : undefined}
            onClick={() => setIsEmailOtpOpen(true)}
          />
          <ProfileRow
            icon={<Crown className="w-5 h-5" />}
            label={t('premium')}
            value={user?.isPremium ? t('ownProfilePremiumActiveLabel') : t('ownProfileUpgradeLabel')}
            accent="gold"
            onClick={() => navigate('/premium')}
          />
          <ProfileRow
            icon={<Frame className="w-5 h-5" />}
            label={t('ownProfileChooseFrameAction')}
            value={activeFrameName}
            onClick={() => {
              if (typeof performance !== 'undefined') performance.mark('ryvo:frames:navigation-start');
              navigate('/frames');
            }}
          />
        </div>
      </div>

      {/* Grouped card: quick access */}
      <div className="mt-6">
        <SectionLabel>{t('giftCoinBalanceLabel')}</SectionLabel>
        <button type="button" onClick={() => setCoinStoreOpen(true)} className="w-full rounded-[24px] border border-[#F5B942]/40 bg-gradient-to-br from-[#FFF2B6]/65 via-surface to-pink-500/10 p-4 text-start shadow-premium active:scale-[0.99] dark:from-[#F5B942]/15">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-[#F5B942]/20"><CoinIcon className="h-7 w-7" /></span><div className="min-w-0 flex-1"><p className="text-micro normal-case text-app-muted">{t('giftCoinBalanceLabel')}</p><p className="text-heading tabular-nums text-app">{Number(wallet?.balance || 0).toLocaleString(locale)} Coin</p></div><span className="text-caption font-extrabold text-pink-500">{t('giftBuyCoinsAction')}</span></div>
        </button>
      </div>

      {/* Grouped card: quick access */}
      <div className="mt-6">
        <SectionLabel>{t('ownProfileMoreSectionLabel')}</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Zap className="w-5 h-5" />} label={t('ownProfileBoostAction')} onClick={() => navigate('/boost')} />
          <ProfileRow icon={<Compass className="w-5 h-5" />} label={t('ownProfilePassportLocationTemplate').replace('{passport}', PASSPORT_LABELS[locale])} onClick={() => navigate('/passport')} />
        </div>
      </div>

      {/* Grouped card: settings entry point */}
      <div className="mt-6">
        <SectionLabel>{t('settings')}</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Settings className="w-5 h-5" />} label={t('ownProfileAllSettingsAction')} onClick={() => navigate('/settings')} />
        </div>
      </div>

      <BottomSheet isOpen={isCompletionOpen} onClose={() => setIsCompletionOpen(false)}>
        <section className="px-5 pb-6 pt-2" role="dialog" aria-modal="true" aria-labelledby="profile-completion-title">
          <div className="mb-4">
            <h3 id="profile-completion-title" className="text-heading text-app">{t('ownProfileCompleteProfileLabel')}</h3>
            <p className="mt-1 text-caption normal-case text-app-muted">
              {t('ownProfileCompleteProfileDescription')}
            </p>
          </div>
          <div className="space-y-2.5">
            {missingFields.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => openEditModal(field.key)}
                className="flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-2xl border border-app bg-app-secondary px-4 py-3 text-start active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pink-500/10 text-pink-500">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1 text-body font-bold text-app">{t(field.ctaKey)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-app-muted" />
              </button>
            ))}
          </div>
        </section>
      </BottomSheet>

      <CoinStoreSheet isOpen={coinStoreOpen} onClose={() => setCoinStoreOpen(false)} />

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <Suspense fallback={null}>
          <EditProfileModal
            isOpen
            onClose={() => {
              setIsEditModalOpen(false);
              setEditFocusSection(undefined);
            }}
            focusSection={editFocusSection}
          />
        </Suspense>
      )}
    
      <EmailOtpModal
        isOpen={isEmailOtpOpen}
        onClose={() => setIsEmailOtpOpen(false)}
        email={user?.email}
        alreadyVerified={user?.emailVerified === true}
      />
    </div>
  );
};
