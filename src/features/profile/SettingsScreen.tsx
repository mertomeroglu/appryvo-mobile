import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Flag,
  Languages,
  LifeBuoy,
  LogOut,
  Mail,
  Moon,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  UserX,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useThemeStore, type ThemeMode } from '../../theme/themeStore';
import { useNotificationsPreferenceMutation } from '../../hooks/useQueries';
import { apiClient } from '../../services/api/apiClient';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { Modal } from '../../components/ui/Modal';
import { SafetyReportModal } from '../../components/SafetyReportModal';
import { SPRING } from '../../motion/tokens';
import { toast } from '../../stores/useToastStore';
import { CHAT_TRANSLATION_LANGUAGES, chatLanguageLabel } from '../../lib/chatTranslationLanguages';
import { COMMON_COUNTRIES, countryCodeToFlag, normalizeCountryCode } from '../../lib/countryFlags';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Aydınlık', icon: <Sun className="w-4 h-4" /> },
  { value: 'dark', label: 'Karanlık', icon: <Moon className="w-4 h-4" /> },
  { value: 'system', label: 'Sistem', icon: <span className="text-caption font-black">A</span> },
];

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-micro text-app-muted uppercase tracking-wider px-1 mb-2">{children}</h4>
);

const ListRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  destructive?: boolean;
}> = ({ icon, label, value, onClick, destructive }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`w-full p-3.5 rounded-2xl bg-surface border border-app flex items-center justify-between shadow-soft ${
      onClick ? 'active:scale-[0.99] transition-transform' : ''
    }`}
  >
    <div className="flex items-center gap-3 min-w-0">
      <span className={destructive ? 'text-[#FF4B55]' : 'text-pink-500'}>{icon}</span>
      <span className={`text-body font-bold truncate ${destructive ? 'text-[#FF4B55]' : 'text-app'}`}>{label}</span>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      {value && <span className="text-caption text-app-muted normal-case">{value}</span>}
      {onClick && <ChevronRight className="w-4 h-4 text-app-muted" />}
    </div>
  </button>
);

const ToggleRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}> = ({ icon, label, checked, disabled, onChange }) => (
  <div className="w-full p-3.5 rounded-2xl bg-surface border border-app flex items-center justify-between shadow-soft">
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-pink-500">{icon}</span>
      <span className="text-body font-bold text-app truncate">{label}</span>
    </div>
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full shrink-0 transition-colors disabled:opacity-50 ${
        checked ? 'bg-brand-gradient' : 'bg-app-secondary'
      }`}
    >
      <motion.span
        animate={{ x: checked ? 20 : 0 }}
        transition={SPRING.snappy}
        className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-md"
      />
    </button>
  </div>
);

export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setUser = useAuthStore((s) => s.setUser);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isChatLanguageOpen, setIsChatLanguageOpen] = useState(false);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const notificationsMutation = useNotificationsPreferenceMutation();

  const pushEnabled = user?.pushNotificationsEnabled !== false;
  // Tier 2 of the chat-translation-language resolution chain (per-conversation override wins
  // when set; this is the fallback used across every conversation that hasn't overridden it).
  const chatLanguage = user?.chatLanguage || user?.languageCode || 'tr';
  const countryCode = normalizeCountryCode(user?.countryCode) || 'TR';

  const handleSelectChatLanguage = async (code: string) => {
    if (!user) return;
    const previous = user.chatLanguage;
    setUser({ ...user, chatLanguage: code });
    setIsChatLanguageOpen(false);
    try {
      await apiClient.put('/api/chat/language', { chatLanguage: code });
    } catch {
      setUser({ ...user, chatLanguage: previous });
      toast.error('Sohbet dili güncellenemedi.');
    }
  };

  const handleSelectCountry = async (code: string) => {
    if (!user) return;
    const previous = user.countryCode;
    setUser({ ...user, countryCode: code });
    setIsCountryOpen(false);
    try {
      await apiClient.put('/api/profile', { targetCountry: code });
    } catch {
      setUser({ ...user, countryCode: previous });
      toast.error('Ülke güncellenemedi.');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/auth');
  };

  const handleToggleNotifications = async (next: boolean) => {
    if (!user) return;
    const previous = pushEnabled;
    setUser({ ...user, pushNotificationsEnabled: next });
    try {
      await notificationsMutation.mutateAsync(next);
    } catch {
      setUser({ ...user, pushNotificationsEnabled: previous });
      toast.error('Bildirim tercihi güncellenemedi.');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app select-none overflow-hidden">
      <header className="pt-safe px-4 h-16 flex items-center gap-3 border-b border-app bg-surface/80 backdrop-blur-md z-sticky shrink-0">
        <IconButton aria-label="Geri" variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <AppLogo variant="icon" size="sm" />
        <h2 className="text-heading text-app">Ayarlar</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
        {/* Account */}
        <div>
          <SectionLabel>Hesap</SectionLabel>
          <div className="space-y-2.5">
            <ListRow icon={<Mail className="w-5 h-5" />} label="E-posta" value={user?.email} />
            <ListRow
              icon={<ShieldCheck className="w-5 h-5" />}
              label="Kimlik Doğrulama"
              value={user?.verified ? 'Doğrulandı' : 'Doğrulanmadı'}
              onClick={() => navigate('/verification')}
            />
          </div>
        </div>

        {/* Notifications & Support */}
        <div>
          <SectionLabel>Tercihler</SectionLabel>
          <div className="space-y-2.5">
            <ToggleRow
              icon={<Bell className="w-5 h-5" />}
              label="Bildirimler"
              checked={pushEnabled}
              disabled={notificationsMutation.isPending}
              onChange={handleToggleNotifications}
            />
            <ListRow icon={<LifeBuoy className="w-5 h-5" />} label="Destek" onClick={() => navigate('/support')} />
            <ListRow
              icon={<Languages className="w-5 h-5" />}
              label="Sohbet Dili"
              value={chatLanguageLabel(chatLanguage)}
              onClick={() => setIsChatLanguageOpen(true)}
            />
            <ListRow
              icon={<Flag className="w-5 h-5" />}
              label="Ülke"
              value={`${countryCodeToFlag(countryCode)} ${COMMON_COUNTRIES.find((c) => c.code === countryCode)?.name || countryCode}`}
              onClick={() => setIsCountryOpen(true)}
            />
          </div>
        </div>

        {/* Appearance */}
        <div>
          <SectionLabel>Görünüm</SectionLabel>
          <div className="p-1.5 rounded-2xl bg-surface border border-app flex items-center shadow-soft">
            {THEME_OPTIONS.map((opt) => {
              const isActive = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className="relative flex-1 h-11 rounded-xl flex items-center justify-center gap-1.5"
                >
                  {isActive && (
                    <motion.div
                      layoutId="theme-active-pill"
                      transition={SPRING.snappy}
                      className="absolute inset-0 bg-brand-gradient rounded-xl shadow-md shadow-pink-500/20"
                    />
                  )}
                  <span className={`relative z-10 flex items-center gap-1.5 text-caption font-bold ${isActive ? 'text-white' : 'text-app-muted'}`}>
                    {opt.icon}
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Privacy & Safety */}
        <div>
          <SectionLabel>Gizlilik ve Güvenlik</SectionLabel>
          <div className="space-y-2.5">
            <ListRow
              icon={<UserX className="w-5 h-5" />}
              label="Engellenen Kullanıcılar"
              onClick={() => navigate('/settings/blocked')}
            />
            <ListRow icon={<Shield className="w-5 h-5" />} label="Gizlilik Politikası" value="appryvo.online" />
          </div>
        </div>

        {/* Account actions. No "Hesabımı dondur" row: the users table has no paused/frozen
            state (only ACTIVE/BANNED/SUSPENDED), so a freeze toggle here would be a dead
            button — add the status value + discovery-visibility wiring first if this ships. */}
        <div>
          <SectionLabel>Hesap İşlemleri</SectionLabel>
          <div className="space-y-2.5">
            <ListRow icon={<LogOut className="w-5 h-5" />} label="Çıkış Yap" onClick={handleLogout} />
            <ListRow
              icon={<Trash2 className="w-5 h-5" />}
              label="Hesabı Sil"
              destructive
              onClick={() => setIsDeleteOpen(true)}
            />
          </div>
        </div>
      </div>

      <SafetyReportModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        type="delete_account"
        onSuccess={() => navigate('/auth')}
      />

      <Modal isOpen={isChatLanguageOpen} onClose={() => setIsChatLanguageOpen(false)}>
        <div className="space-y-4">
          <h3 className="text-heading text-app">Sohbet Dili</h3>
          <p className="text-micro text-app-muted normal-case">
            Konuşmalarda gelen mesajlar, bir sohbete özel dil seçmediğin sürece bu dile çevrilir.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CHAT_TRANSLATION_LANGUAGES.map((lang) => {
              const selected = lang.code === chatLanguage;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleSelectChatLanguage(lang.code)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-body font-semibold text-left ${
                    selected ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app'
                  }`}
                >
                  <span className="truncate">{lang.label}</span>
                  {selected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <Modal isOpen={isCountryOpen} onClose={() => setIsCountryOpen(false)}>
        <div className="space-y-4">
          <h3 className="text-heading text-app">Ülke</h3>
          <p className="text-micro text-app-muted normal-case">
            Profilinde gösterilecek ülke/uyruk bayrağı. Doğrulama rozetinden bağımsızdır.
          </p>
          <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto no-scrollbar">
            {COMMON_COUNTRIES.map((c) => {
              const selected = c.code === countryCode;
              return (
                <button
                  key={c.code}
                  onClick={() => handleSelectCountry(c.code)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-body font-semibold text-left ${
                    selected ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app'
                  }`}
                >
                  <span className="truncate flex items-center gap-2">
                    <span>{countryCodeToFlag(c.code)}</span>
                    <span className="truncate">{c.name}</span>
                  </span>
                  {selected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
};
