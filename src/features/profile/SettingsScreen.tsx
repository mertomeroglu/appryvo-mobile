import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  FileText,
  Languages,
  LifeBuoy,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Shield,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  UserX,
  Coins,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useThemeStore, type ThemeMode } from '../../theme/themeStore';
import { useMeQuery, useNotificationsPreferenceMutation, useUpdateProfileMutation, useWalletQuery } from '../../hooks/useQueries';
import { apiClient } from '../../services/api/apiClient';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { Modal } from '../../components/ui/Modal';
import { LegalModal } from '../../components/LegalModal';
import { SafetyReportModal } from '../../components/SafetyReportModal';
import { SPRING } from '../../motion/tokens';
import { toast } from '../../stores/useToastStore';
import { CHAT_TRANSLATION_LANGUAGES, getLocalizedChatLanguageLabel } from '../../lib/chatTranslationLanguages';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDocument } from '../../lib/legalContent';
import { CoinStoreSheet } from '../coins/CoinStoreSheet';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { localReengagement } from '../../services/notifications/localReengagement';
import {
  APP_LOCALE_LABELS,
  SUPPORTED_APP_LOCALES,
  useAppLocaleStore,
  useAppTranslation,
  type AppMessageKey,
} from '../../i18n/appLocale';

const THEME_OPTION_KEYS: { value: ThemeMode; labelKey: AppMessageKey; icon: React.ReactNode }[] = [
  { value: 'light', labelKey: 'settingsThemeLight', icon: <Sun className="w-4 h-4" /> },
  { value: 'dark', labelKey: 'settingsThemeDark', icon: <Moon className="w-4 h-4" /> },
  { value: 'system', labelKey: 'settingsThemeSystem', icon: <Smartphone className="w-4 h-4" /> },
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
  const [isAppLanguageOpen, setIsAppLanguageOpen] = useState(false);
  const [coinStoreOpen, setCoinStoreOpen] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);
  const notificationsMutation = useNotificationsPreferenceMutation();
  const { data: me } = useMeQuery();
  const { data: wallet } = useWalletQuery();
  const updateProfileMutation = useUpdateProfileMutation();
  const locale = useAppLocaleStore((state) => state.locale);
  const setLocale = useAppLocaleStore((state) => state.setLocale);
  const { t } = useAppTranslation();

  const mapVisible = me?.mapVisible === true;
  const hideFollowersFollowing = me?.hideFollowersFollowing === true;
  const isPremium = me?.isPremium === true;

  const handleToggleMapVisible = (next: boolean) => {
    if (!next) {
      updateProfileMutation.mutate({ mapVisible: false }, {
        onError: () => toast.error(t('settingsMapVisibilityFailedError')),
      });
      return;
    }
    // Turning visibility back on always requires a fresh manual check-in with a real location
    // fix from the map screen itself (see SocialMapScreen's checkInToMap) -- never a silent
    // settings toggle reusing old coordinates. This switch can only ever turn visibility off.
    navigate('/map');
  };

  const handleToggleFollowPrivacy = async (next: boolean) => {
    if (!isPremium && next) {
      navigate('/premium');
      return;
    }
    try {
      await apiClient.put('/api/follows/privacy', { hideFollowersFollowing: next });
      if (user) setUser({ ...user, hideFollowersFollowing: next });
    } catch (error: any) {
      toast.error(error?.message || t('settingsFollowPrivacyFailedError'));
    }
  };

  const pushEnabled = user?.pushNotificationsEnabled !== false;
  const verificationComplete = user?.verified === true || user?.verificationState === 'APPROVED';
  const verificationPending = user?.verificationState === 'PENDING';
  const verificationValue = verificationComplete
    ? t('settingsVerifiedLabel')
    : verificationPending
      ? t('settingsVerificationPendingLabel')
      : user?.verificationState === 'REJECTED' || user?.verificationState === 'REVERIFICATION_REQUIRED'
        ? t('settingsVerificationRetryLabel')
        : t('settingsNotVerifiedLabel');
  // Tier 2 of the chat-translation-language resolution chain (per-conversation override wins
  // when set; this is the fallback used across every conversation that hasn't overridden it).
  const chatLanguage = user?.chatLanguage || user?.languageCode || 'tr';

  const handleSelectChatLanguage = async (code: string) => {
    if (!user) return;
    const previous = user.chatLanguage;
    setUser({ ...user, chatLanguage: code });
    setIsChatLanguageOpen(false);
    try {
      await apiClient.put('/api/chat/language', { chatLanguage: code });
    } catch {
      setUser({ ...user, chatLanguage: previous });
      toast.error(t('settingsChatLanguageFailedError'));
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
    if (!next) await localReengagement.cancel();
    try {
      await notificationsMutation.mutateAsync(next);
    } catch {
      setUser({ ...user, pushNotificationsEnabled: previous });
      toast.error(t('settingsNotificationPrefFailedError'));
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app select-none overflow-hidden">
      <ScreenHeader
        leading={<><IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></IconButton><AppLogo variant="icon" size="sm" /></>}
        title={t('settings')}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
        {/* Account */}
        <div>
          <SectionLabel>{t('settingsAccountSectionLabel')}</SectionLabel>
          <div className="space-y-2.5">
            <ListRow icon={<Mail className="w-5 h-5" />} label={t('settingsEmailLabel')} value={user?.email} />
            <ListRow icon={<Coins className="w-5 h-5" />} label={t('giftCoinBalanceLabel')} value={`${Number(wallet?.balance || 0).toLocaleString(locale)} · ${t('giftBuyCoinsAction')}`} onClick={() => setCoinStoreOpen(true)} />
            <ListRow
              icon={<ShieldCheck className="w-5 h-5" />}
              label={t('verificationScreenTitle')}
              value={verificationValue}
              onClick={verificationComplete || verificationPending ? undefined : () => navigate('/verification')}
            />
          </div>
        </div>

        {/* Notifications & Support */}
        <div>
          <SectionLabel>{t('preferences')}</SectionLabel>
          <div className="space-y-2.5">
            <ToggleRow
              icon={<Bell className="w-5 h-5" />}
              label={t('notifications')}
              checked={pushEnabled}
              disabled={notificationsMutation.isPending}
              onChange={handleToggleNotifications}
            />
            <ListRow icon={<LifeBuoy className="w-5 h-5" />} label={t('support')} onClick={() => navigate('/support')} />
            <ListRow
              icon={<Languages className="w-5 h-5" />}
              label={t('appLanguage')}
              value={APP_LOCALE_LABELS[locale]}
              onClick={() => setIsAppLanguageOpen(true)}
            />
            <ListRow
              icon={<Languages className="w-5 h-5" />}
              label={t('chatLanguage')}
              value={getLocalizedChatLanguageLabel(chatLanguage, locale)}
              onClick={() => setIsChatLanguageOpen(true)}
            />
          </div>
        </div>

        {/* Appearance */}
        <div>
          <SectionLabel>{t('settingsAppearanceSectionLabel')}</SectionLabel>
          <div className="p-1.5 rounded-2xl bg-surface border border-app flex items-center shadow-soft">
            {THEME_OPTION_KEYS.map((opt) => {
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
                    {t(opt.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Privacy & Safety */}
        <div>
          <SectionLabel>{t('settingsPrivacySafetySectionLabel')}</SectionLabel>
          <div className="space-y-2.5">
            <ListRow
              icon={<UserX className="w-5 h-5" />}
              label={t('blockedUsersTitle')}
              onClick={() => navigate('/settings/blocked')}
            />
            <ToggleRow
              icon={<MapPin className="w-5 h-5" />}
              label={t('settingsShowOnMapLabel')}
              checked={mapVisible}
              disabled={updateProfileMutation.isPending}
              onChange={handleToggleMapVisible}
            />
            <ToggleRow
              icon={<Shield className="w-5 h-5" />}
              label={t('settingsHideFollowConnectionsLabel')}
              checked={hideFollowersFollowing}
              onChange={handleToggleFollowPrivacy}
            />
            <ListRow
              icon={<Shield className="w-5 h-5" />}
              label={t('privacyPolicyLabel')}
              value="appryvo.online"
              onClick={() => setLegalDoc(PRIVACY_POLICY)}
            />
            <ListRow
              icon={<FileText className="w-5 h-5" />}
              label={t('termsOfServiceLabel')}
              value="appryvo.online"
              onClick={() => setLegalDoc(TERMS_OF_SERVICE)}
            />
          </div>
        </div>

        {/* Account actions. No "Hesabımı dondur" row: the users table has no paused/frozen
            state (only ACTIVE/BANNED/SUSPENDED), so a freeze toggle here would be a dead
            button — add the status value + discovery-visibility wiring first if this ships. */}
        <div>
          <SectionLabel>{t('settingsAccountActionsSectionLabel')}</SectionLabel>
          <div className="space-y-2.5">
            <ListRow icon={<LogOut className="w-5 h-5" />} label={t('logout')} onClick={handleLogout} />
            <ListRow
              icon={<Trash2 className="w-5 h-5" />}
              label={t('deleteAccount')}
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

      <LegalModal document={legalDoc} onClose={() => setLegalDoc(null)} />
      <CoinStoreSheet isOpen={coinStoreOpen} onClose={() => setCoinStoreOpen(false)} />

      <Modal isOpen={isAppLanguageOpen} onClose={() => setIsAppLanguageOpen(false)}>
        <div className="space-y-4">
          <h3 className="text-heading text-app break-words">{t('appLanguage')}</h3>
          <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto no-scrollbar">
            {SUPPORTED_APP_LOCALES.map((code) => {
              const selected = code === locale;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => {
                    setLocale(code);
                    setIsAppLanguageOpen(false);
                  }}
                  className={`min-w-0 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-body font-semibold text-start ${
                    selected ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app'
                  }`}
                >
                  <span className="min-w-0 break-words">{APP_LOCALE_LABELS[code]}</span>
                  {selected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <Modal isOpen={isChatLanguageOpen} onClose={() => setIsChatLanguageOpen(false)}>
        <div className="space-y-4">
          <h3 className="text-heading text-app">{t('chatLanguage')}</h3>
          <p className="text-micro text-app-muted normal-case">
            {t('settingsChatLanguageDescription')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CHAT_TRANSLATION_LANGUAGES.map((lang) => {
              const selected = lang.code === chatLanguage;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleSelectChatLanguage(lang.code)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-body font-semibold text-start ${
                    selected ? 'border-pink-500 bg-pink-500/10 text-pink-500' : 'border-app bg-surface text-app'
                  }`}
                >
                  <span className="truncate">{getLocalizedChatLanguageLabel(lang.code, locale)}</span>
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
