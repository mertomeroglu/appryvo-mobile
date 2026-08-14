import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { useFramesQuery } from '../../hooks/useQueries';
import { computeProfileCompletion } from '../../lib/profileCompletion';
import { getPhotoUrl } from '../../services/media/mediaService';
import { countryCodeToFlag, normalizeCountryCode } from '../../lib/countryFlags';
import { EditProfileModal } from '../../components/EditProfileModal';
import { FramedAvatar } from '../../components/ui/FramedAvatar';
import { VerifiedBadge } from '../../components/ui/Badge';
import { AppLogo } from '../../components/ui/AppLogo';
import {
  Crown,
  Zap,
  ShieldCheck,
  Settings,
  Frame,
  Compass,
  Edit3,
  Eye,
  MessageSquareQuote,
  ChevronRight,
  MapPin,
} from 'lucide-react';

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-micro text-app-muted uppercase tracking-wider px-1 mb-2">{children}</h4>
);

const ProfileRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  accent?: 'default' | 'gold';
  onClick: () => void;
}> = ({ icon, label, value, accent = 'default', onClick }) => (
  <button
    onClick={onClick}
    className="w-full p-3.5 rounded-2xl bg-surface border border-app flex items-center justify-between shadow-soft active:scale-[0.99] transition-transform"
  >
    <div className="flex items-center gap-3 min-w-0">
      <span className={accent === 'gold' ? 'text-[#F5B942]' : 'text-pink-500'}>{icon}</span>
      <span className="text-body font-bold text-app truncate">{label}</span>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      {value && <span className="text-caption text-app-muted normal-case">{value}</span>}
      <ChevronRight className="w-4 h-4 text-app-muted" />
    </div>
  </button>
);

export const OwnProfileScreen: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFocusSection, setEditFocusSection] = useState<string | undefined>(undefined);

  const openEditModal = (section?: string) => {
    setEditFocusSection(section);
    setIsEditModalOpen(true);
  };

  const { data: framesData } = useFramesQuery();

  const photoUrl = getPhotoUrl(user?.photos?.[0]) || user?.photoUrl;
  const { percent: completion, missing: missingFields } = computeProfileCompletion(user);
  const showFlag = user?.showCountryFlag !== false && !!normalizeCountryCode(user?.countryCode);
  const activeFrameName =
    framesData?.frames?.find((f: any) => f.id === (framesData?.activeFrameId || user?.activeFrameId))?.name;

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar pb-28 select-none">
      {/* Header */}
      <header className="pt-safe flex items-center justify-center gap-2 mb-2 relative">
        <AppLogo variant="icon" size="sm" />
        <h2 className="text-title text-app">Profilim</h2>
      </header>

      {/* Identity block: avatar ring, nationality flag, verification, name, location, completion */}
      <div className="flex flex-col items-center text-center my-2">
        <div className="relative inline-flex">
          <FramedAvatar
            photoUrl={photoUrl}
            name={user?.name}
            activeFrameId={user?.activeFrameId}
            verified={user?.verified}
            size="xl"
          />
          {showFlag && (
            <span
              className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full bg-surface border-2 border-app shadow-soft flex items-center justify-center text-base z-10"
              aria-label="Ülke"
            >
              {countryCodeToFlag(user?.countryCode)}
            </span>
          )}
        </div>

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

        <div className="w-full max-w-[280px] mt-3">
          {completion < 100 ? (
            <button
              onClick={() => openEditModal(missingFields[0]?.key)}
              className="w-full text-left active:scale-[0.98] transition-transform"
            >
              <div className="flex justify-between items-center text-micro font-bold text-app-muted mb-1">
                <span>Profilini tamamla</span>
                {missingFields[0] && <span className="text-pink-500">{missingFields[0].cta}</span>}
              </div>
              <div className="h-1.5 rounded-full bg-app-secondary overflow-hidden">
                <div
                  className="h-full bg-brand-gradient rounded-full transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1.5 text-caption font-bold text-[#32D583]">
              <span>Profilin hazır</span>
              <span>✓</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 mt-4">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="px-4 py-2 rounded-full bg-surface border border-app text-caption font-extrabold text-pink-500 flex items-center gap-1.5 shadow-soft active:scale-95 transition-transform"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Düzenle</span>
          </button>
          <button
            onClick={() => navigate('/profile/preview')}
            className="px-4 py-2 rounded-full bg-surface border border-app text-caption font-extrabold text-app flex items-center gap-1.5 shadow-soft active:scale-95 transition-transform"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Önizle</span>
          </button>
        </div>
      </div>

      {/* Grouped card: profile */}
      <div className="mt-6">
        <SectionLabel>Profil</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Edit3 className="w-5 h-5" />} label="Profili düzenle" onClick={() => setIsEditModalOpen(true)} />
          <ProfileRow
            icon={<ShieldCheck className="w-5 h-5" />}
            label="Doğrulanmış rozeti al"
            value={user?.verified ? 'Doğrulandı' : undefined}
            onClick={() => navigate('/verification')}
          />
          <ProfileRow
            icon={<Crown className="w-5 h-5" />}
            label="Ryvo premium"
            value={user?.isPremium ? 'Aktif' : 'Yükselt'}
            accent="gold"
            onClick={() => navigate('/premium')}
          />
          <ProfileRow
            icon={<Frame className="w-5 h-5" />}
            label="Profil çerçevesi seç"
            value={activeFrameName}
            onClick={() => navigate('/frames')}
          />
        </div>
      </div>

      {/* Grouped card: quick access */}
      <div className="mt-6">
        <SectionLabel>Daha Fazla</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Zap className="w-5 h-5" />} label="Boost ile öne çık" onClick={() => navigate('/boost')} />
          <ProfileRow
            icon={<MessageSquareQuote className="w-5 h-5" />}
            label="İtiraflar & Sosyal Akış"
            onClick={() => navigate('/confessions')}
          />
          <ProfileRow icon={<Compass className="w-5 h-5" />} label="Passport lokasyonu" onClick={() => navigate('/passport')} />
        </div>
      </div>

      {/* Grouped card: settings entry point */}
      <div className="mt-6">
        <SectionLabel>Ayarlar</SectionLabel>
        <div className="space-y-2.5">
          <ProfileRow icon={<Settings className="w-5 h-5" />} label="Tüm ayarlar" onClick={() => navigate('/settings')} />
        </div>
      </div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        focusSection={editFocusSection}
      />
    </div>
  );
};
