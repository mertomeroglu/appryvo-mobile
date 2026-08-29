import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Mail, Lock, Send } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { authService } from '../../services/auth/authService';
import { AppLogo } from '../../components/ui/AppLogo';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { LegalModal } from '../../components/LegalModal';
import { RegistrationWizard } from './RegistrationWizard';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDocument } from '../../lib/legalContent';
import { EASE } from '../../motion/tokens';
import { pageTransition } from '../../motion/variants';
import { useAppTranslation } from '../../i18n/appLocale';
import { nativeKeyboard } from '../../native/keyboard';
import { dismissKeyboardOnBackgroundPointerDown } from '../../hooks/useKeyboardViewport';

type Mode = 'welcome' | 'login' | 'register' | 'forgot' | 'reset-sent';

// Word order for "you agree to X and Y" differs by language (Turkish puts the verb last;
// English puts it first), so the translated string carries {terms}/{privacy} placeholders
// instead of a fixed prefix+button+and+button+suffix layout, and this splits it back into
// text/button segments to render.
function renderLegalConsent(
  template: string,
  termsLabel: string,
  privacyLabel: string,
  onTerms: () => void,
  onPrivacy: () => void,
): React.ReactNode[] {
  const buttonClass = 'relative z-10 underline underline-offset-2 py-3 -my-3 px-1 -mx-1 touch-manipulation';
  return template.split(/(\{terms\}|\{privacy\})/g).map((part, index) => {
    if (part === '{terms}') {
      return <button key={index} type="button" onClick={onTerms} className={buttonClass}>{termsLabel}</button>;
    }
    if (part === '{privacy}') {
      return <button key={index} type="button" onClick={onPrivacy} className={buttonClass}>{privacyLabel}</button>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

const inputClass =
  'w-full h-14 bg-input-app border border-app rounded-2xl ps-12 pe-4 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 focus-visible:ring-2 focus-visible:ring-pink-500/40 transition-colors';

export const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<Mode>('welcome');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);
  const loginPasswordRef = useRef<HTMLInputElement>(null);

  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useAppTranslation();

  // SessionGate stashes the route an unauthenticated user was actually trying to reach (e.g. a
  // shared-profile or match deep link) as router state before bouncing here -- resume it after
  // a successful login/registration instead of always dropping the user on /discover.
  const resumeDestination = (location.state as { from?: string } | null)?.from || '/discover';

  const goTo = (next: Mode) => {
    void nativeKeyboard.hide();
    setErrorMsg('');
    setDirection('forward');
    setMode(next);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await login({ identifier, password });
      await nativeKeyboard.hide();
      navigate(resumeDestination, { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || t('loginFailedMessage'));
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmittingForgot(true);
    try {
      await authService.forgotPassword(forgotEmail);
      await nativeKeyboard.hide();
      goTo('reset-sent');
    } catch (err: any) {
      setErrorMsg(err.message || t('requestFailedMessage'));
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  // Registration is a fully separate, self-chromed wizard (own header/back-button/progress) —
  // no account exists until its final step, so it doesn't share this screen's error banner or
  // page-transition stack with the shorter welcome/login/forgot flows below.
  if (mode === 'register') {
    return <RegistrationWizard onExit={() => goTo('welcome')} onComplete={() => navigate(resumeDestination, { replace: true })} />;
  }

  return (
    <div
      className="flex flex-col h-full min-h-0 w-full bg-app text-app relative overflow-hidden select-none"
      onPointerDown={dismissKeyboardOnBackgroundPointerDown}
    >
      {/* Cinematic ambient background */}
      <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -left-32 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

      {/* Keep the same official wordmark used by Welcome, compact enough to leave the
          language control unobstructed while preserving the native back affordance. */}
      {mode !== 'welcome' && (
        <header className="pt-safe px-5 pe-24 h-16 flex items-center gap-3 z-sticky">
          <IconButton aria-label={t('backButtonLabel')} variant="surface" size="md" onClick={() => goTo(mode === 'forgot' ? 'login' : 'welcome')}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
          <AppLogo variant="full" size="md" />
        </header>
      )}

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="mx-6 my-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center z-10">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            variants={pageTransition(direction)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="auth-keyboard-scroll absolute inset-0 flex flex-col justify-between p-6 z-10 overflow-y-auto no-scrollbar"
          >
            {/* WELCOME */}
            {mode === 'welcome' && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE.decelerate }}
                  className="my-auto py-8 text-center"
                >
                  <AppLogo size="2xl" className="mb-8 mx-auto" />
                  <h1 className="text-brand-gradient font-extrabold tracking-tight text-[22px] leading-[30px] break-words max-w-sm mx-auto">
                    {t('welcomeSlogan')}
                  </h1>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.12, ease: EASE.decelerate }}
                  className="space-y-3 mb-6"
                >
                  <AppButton variant="primary" size="lg" fullWidth onClick={() => goTo('register')}>
                    {t('createAccount')}
                  </AppButton>
                  <AppButton variant="secondary" size="lg" fullWidth onClick={() => goTo('login')}>
                    {t('loginButton')}
                  </AppButton>

                  <p className="text-micro text-app-muted text-center pt-3 normal-case font-medium">
                    {renderLegalConsent(
                      t('legalConsentTemplate'),
                      t('termsOfServiceLabel'),
                      t('privacyPolicyLabel'),
                      () => setLegalDoc(TERMS_OF_SERVICE),
                      () => setLegalDoc(PRIVACY_POLICY),
                    )}
                  </p>
                </motion.div>
              </>
            )}

            {/* LOGIN */}
            {mode === 'login' && (
              <>
                <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                  <div>
                    <h2 className="text-title text-app">{t('loginHeading')}</h2>
                    <p className="text-caption text-app-muted mt-1 normal-case">
                      {t('loginSubheading')}
                    </p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute start-4 top-4 w-5 h-5 text-app-muted" />
                      <input
                        type="text"
                        name="username"
                        required
                        autoCapitalize="none"
                        autoCorrect="off"
                        autoComplete="username"
                        enterKeyHint="next"
                        placeholder={t('emailHint')}
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            loginPasswordRef.current?.focus();
                          }
                        }}
                        className={inputClass}
                      />
                    </div>

                    <div className="relative">
                      <Lock className="absolute start-4 top-4 w-5 h-5 text-app-muted" />
                      <input
                        type="password"
                        ref={loginPasswordRef}
                        name="password"
                        required
                        autoComplete="current-password"
                        enterKeyHint="done"
                        placeholder={t('passwordHint')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputClass}
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => goTo('forgot')}
                        className="text-caption font-bold text-pink-500 hover:underline"
                      >
                        {t('forgotPassword')}
                      </button>
                    </div>

                    <AppButton type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>
                      {t('loginButton')}
                    </AppButton>
                  </form>
                </div>

                <div className="text-center pt-4">
                  <button
                    type="button"
                    onClick={() => goTo('register')}
                    className="text-caption font-bold text-pink-500 underline"
                  >
                    {t('noAccount')}
                  </button>
                </div>
              </>
            )}

            {/* FORGOT PASSWORD */}
            {mode === 'forgot' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app break-words">{t('forgotPassword')}</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">
                    {t('forgotPasswordSubheading')}
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute start-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="email"
                      name="email"
                      required
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="email"
                      enterKeyHint="send"
                      placeholder={t('emailHint')}
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <AppButton
                    type="submit"
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={isSubmittingForgot}
                    rightIcon={<Send className="w-4 h-4" />}
                  >
                    {t('sendResetLinkButton')}
                  </AppButton>
                </form>
              </div>
            )}

            {/* RESET LINK SENT */}
            {mode === 'reset-sent' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full text-center">
                <div className="w-20 h-20 rounded-full bg-brand-gradient mx-auto flex items-center justify-center shadow-elevated">
                  <Send className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-title text-app">{t('checkEmailHeading')}</h2>
                  <p className="text-caption text-app-muted mt-2 normal-case max-w-xs mx-auto leading-relaxed">
                    {t('resetLinkSentTemplate').replace('{email}', forgotEmail)}
                  </p>
                </div>
                <AppButton variant="secondary" size="lg" fullWidth onClick={() => goTo('login')}>
                  {t('loginButton')}
                </AppButton>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <LegalModal document={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
};
