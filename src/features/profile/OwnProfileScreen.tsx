import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { useFramesQuery, useFollowStatusQuery } from '../../hooks/useQueries';
import { computeProfileCompletion } from '../../lib/profileCompletion';
import { getPhotoUrl } from '../../services/media/mediaService';
import { normalizeCountryCode } from '../../lib/countryFlags';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { VerifiedBadge } from '../../components/ui/Badge';
import { AppLogo } from '../../components/ui/AppLogo';
import { PASSPORT_LABELS, useAppLocaleStore } from '../../i18n/appLocale';
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
} from 'lucide-react';
import { nativeShare } from '../../native/share';

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
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFocusSection, setEditFocusSection] = useState<string | undefined>(undefined);
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
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

  const photoUrl = getPhotoUrl(user?.photos?.[0]) || user?.photoUrl;
  const { percent: completion, missing: missingFields } = useMemo(() => computeProfileCompletion(user), [user]);
  const showFlag = user?.showCountryFlag !== false && !!normalizeCountryCode(user?.countryCode);
  const activeFrameName =
    framesData?.frames?.find((f: any) => f.id === (framesData?.activeFrameId || user?.activeFrameId))?.name;
  const verificationComplete = user?.verified === true || user?.verificationState === 'APPROVED';
  const verificationPending = user?.verificationState === 'PENDING';
  const verificationValue = verificationComplete
    ? 'Doğrulandı'
    : verificationPending
      ? 'İnceleniyor'
      : user?.verificationState === 'REJECTED' || user?.verificationState === 'REVERIFICATION_REQUIRED'
        ? 'Tekrar dene'
        : 'Başlat';

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

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar pb-28 select-none">
      {/* Header */}
      <header className="pt-safe flex items-center justify-center gap-2 mb-2 relative">
        <AppLogo variant="icon" size="sm" />
        <h2 className="text-title text-app">Profilim</h2>
        <button
          onClick={() => navigate('/profile/preview')}
          className="absolute right-0 px-3 py-2 rounded-full bg-surface border border-app text-caption font-extrabold text-app flex items-center gap-1.5 shadow-soft active:scale-95 transition-transform"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Önizle</span>
        </button>
      </header>

      {/* Identity block: avatar ring, nationality flag, verification, name, location, completion */}
      <div className="flex flex-col items-center text-center my-2">
        <ProfileAvatarFrame
          photoUrl={photoUrl}
          name={user?.name}
          activeFrameId={user?.activeFrameId}
          verified={user?.verified}
          countryCode={user?.countryCode}
          showCountryFlag={showFlag}
          size="xl"
          eager
        />

        <div className="flex items-center gap-2 mt-3">
          <h2 className="text-title text-app">{user?.name || 'Kullanıcı'}</h2>
          {user?.age && <span className="text-heading text-app-muted">{user.age}</span>}
          {/* Verification is a separate, backend-driven signal from nationality -- never
              inferred from or tied to the flag above. */}
          {user?.verified && <VerifiedBadge size={20} />}
        </div>
        <div className="flex items-center gap-1 text-caption text-app-muted font-semibold mt-0.5 normal-case">
          <MapPin className="w-3.5 h-3.5" />
          <span>{user?.city || 'Lokasyon belirtilmedi'}</span>
        </div>

        <div className="w-full max-w-[320px] mt-4">
          {completion < 100 ? (
            <button
              type="button"
              onClick={() => setIsCompletionOpen(true)}
              aria-haspopup="dialog"
              className="relative z-content w-full rounded-2xl border border-app bg-surface p-3.5 text-left shadow-soft touch-manipulation active:scale-[0.98] transition-transform"
            >
              <div className="mb-2 flex items-center justify-between gap-3 text-caption font-bold text-app-muted">
                <span>Profilini tamamla</span>
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
              <span>Profilin hazır</span>
              <span>✓</span>
            </div>
          )}
        </div>

      </div>

      {/* Grouped card: profile */}
      <div className="mt-6">
        <SectionLabel>Profil</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Edit3 className="w-5 h-5" />} label="Profili düzenle" onClick={() => openEditModal()} />
          <ProfileRow
            icon={<Users className="w-5 h-5" />}
            label="Bağlantılarım"
            value={followStatus ? `${followStatus.followersCount} takipçi · ${followStatus.followingCount} takip` : undefined}
            onClick={() => user?.id && navigate(`/connections/${user.id}`)}
          />
          <ProfileRow
            icon={<Share2 className="w-5 h-5" />}
            label="Profilimi paylaş"
            onClick={() => {
              if (!user?.id) return;
              void nativeShare.share({
                title: user.name,
                text: `${user.name} — Ryvo'da profilime göz at`,
                url: `https://appryvo.online/discover/${user.id}`,
                dialogTitle: 'Profili Paylaş',
              }).catch(() => {});
            }}
          />
          <ProfileRow
            icon={<ShieldCheck className="w-5 h-5" />}
            label="Kimlik doğrulama"
            value={verificationValue}
            onClick={verificationComplete || verificationPending ? undefined : () => navigate('/verification')}
          />
          <ProfileRow
            icon={<Crown className="w-5 h-5" />}
            label="Ryvo Plus & Gold"
            value={user?.isPremium ? 'Aktif' : 'Yükselt'}
            accent="gold"
            onClick={() => navigate('/premium')}
          />
          <ProfileRow
            icon={<Frame className="w-5 h-5" />}
            label="Profil çerçevesi seç"
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
        <SectionLabel>Daha Fazla</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Zap className="w-5 h-5" />} label="Boost ile öne çık" onClick={() => navigate('/boost')} />
          <ProfileRow icon={<Compass className="w-5 h-5" />} label={`${PASSPORT_LABELS[locale]} lokasyonu`} onClick={() => navigate('/passport')} />
        </div>
      </div>

      {/* Grouped card: settings entry point */}
      <div className="mt-6">
        <SectionLabel>Ayarlar</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Settings className="w-5 h-5" />} label="Tüm ayarlar" onClick={() => navigate('/settings')} />
        </div>
      </div>

      <BottomSheet isOpen={isCompletionOpen} onClose={() => setIsCompletionOpen(false)}>
        <section className="px-5 pb-6 pt-2" role="dialog" aria-modal="true" aria-labelledby="profile-completion-title">
          <div className="mb-4">
            <h3 id="profile-completion-title" className="text-heading text-app">Profilini tamamla</h3>
            <p className="mt-1 text-caption normal-case text-app-muted">
              Profilinde eksik olan alanları tamamla.
            </p>
          </div>
          <div className="space-y-2.5">
            {missingFields.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => openEditModal(field.key)}
                className="flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-2xl border border-app bg-app-secondary px-4 py-3 text-left active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pink-500/10 text-pink-500">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1 text-body font-bold text-app">{field.cta}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-app-muted" />
              </button>
            ))}
          </div>
        </section>
      </BottomSheet>

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
    </div>
  );
};
