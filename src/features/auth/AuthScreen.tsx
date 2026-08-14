import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

type Mode = 'welcome' | 'login' | 'register' | 'forgot' | 'reset-sent';

const inputClass =
  'w-full h-14 bg-input-app border border-app rounded-2xl pl-12 pr-4 text-body font-semibold text-app placeholder:text-app-muted focus:outline-none focus:border-pink-500 transition-colors';

export const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<Mode>('welcome');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmittingForgot, setIsSubmittingForgot] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);

  const login = useAuthStore((s) => s.login);
  const isLoading = useAuthStore((s) => s.isLoading);
  const navigate = useNavigate();

  const goTo = (next: Mode) => {
    setErrorMsg('');
    setDirection('forward');
    setMode(next);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      await login({ identifier, password });
      navigate('/discover');
    } catch (err: any) {
      setErrorMsg(err.message || 'Giriş yapılamadı.');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmittingForgot(true);
    try {
      await authService.forgotPassword(forgotEmail);
      goTo('reset-sent');
    } catch (err: any) {
      setErrorMsg(err.message || 'İstek gönderilemedi.');
    } finally {
      setIsSubmittingForgot(false);
    }
  };

  // Registration is a fully separate, self-chromed wizard (own header/back-button/progress) —
  // no account exists until its final step, so it doesn't share this screen's error banner or
  // page-transition stack with the shorter welcome/login/forgot flows below.
  if (mode === 'register') {
    return <RegistrationWizard onExit={() => goTo('welcome')} onComplete={() => navigate('/discover')} />;
  }

  return (
    <div className="flex flex-col h-full w-full bg-app text-app relative overflow-hidden select-none">
      {/* Cinematic ambient background */}
      <div className="absolute -top-32 -right-20 w-96 h-96 rounded-full bg-pink-500/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -left-32 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

      {/* Header bar: just a Back button when not on welcome -- the logo lives in the welcome
          headline column below, not pinned to a top bar (it reads as a stray brand mark up
          there, disconnected from the "Tanış. Keşfet. Bağlan." copy it belongs with). */}
      {mode !== 'welcome' && (
        <header className="pt-safe px-5 h-16 flex items-center gap-3 z-sticky">
          <IconButton aria-label="Geri" variant="surface" size="md" onClick={() => goTo(mode === 'forgot' ? 'login' : 'welcome')}>
            <ArrowLeft className="w-5 h-5" />
          </IconButton>
          <AppLogo variant="icon" size="sm" />
        </header>
      )}

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="mx-6 my-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 text-caption font-bold text-center z-10">
          {errorMsg}
        </div>
      )}

      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            variants={pageTransition(direction)}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 flex flex-col justify-between p-6 z-10 overflow-y-auto no-scrollbar"
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
                  <h1 className="text-brand-gradient font-extrabold tracking-tight text-[22px] leading-[28px] whitespace-nowrap">
                    Tanış. Keşfet. Bağlan.
                  </h1>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.12, ease: EASE.decelerate }}
                  className="space-y-3 mb-6"
                >
                  <AppButton variant="primary" size="lg" fullWidth onClick={() => goTo('register')}>
                    Hesap Oluştur
                  </AppButton>
                  <AppButton variant="secondary" size="lg" fullWidth onClick={() => goTo('login')}>
                    Giriş Yap
                  </AppButton>

                  <p className="text-micro text-app-muted text-center pt-3 normal-case font-medium">
                    Devam ederek{' '}
                    <button
                      type="button"
                      onClick={() => setLegalDoc(TERMS_OF_SERVICE)}
                      className="relative z-10 underline underline-offset-2 py-3 -my-3 px-1 -mx-1 touch-manipulation"
                    >
                      Kullanım Koşulları
                    </button>{' '}
                    ve{' '}
                    <button
                      type="button"
                      onClick={() => setLegalDoc(PRIVACY_POLICY)}
                      className="relative z-10 underline underline-offset-2 py-3 -my-3 px-1 -mx-1 touch-manipulation"
                    >
                      Gizlilik Politikasını
                    </button>{' '}
                    kabul edersin.
                  </p>
                </motion.div>
              </>
            )}

            {/* LOGIN */}
            {mode === 'login' && (
              <>
                <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                  <div>
                    <h2 className="text-title text-app">Hoş Geldin!</h2>
                    <p className="text-caption text-app-muted mt-1 normal-case">
                      Hesabına erişmek için bilgilerini gir.
                    </p>
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                      <input
                        type="text"
                        required
                        autoCapitalize="none"
                        placeholder="E-posta veya kullanıcı adı"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        className={inputClass}
                      />
                    </div>

                    <div className="relative">
                      <Lock className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                      <input
                        type="password"
                        required
                        placeholder="Şifre"
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
                        Şifremi Unuttum?
                      </button>
                    </div>

                    <AppButton type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>
                      Giriş Yap
                    </AppButton>
                  </form>
                </div>

                <div className="text-center pt-4">
                  <p className="text-caption text-app-muted normal-case">
                    Hesabın yok mu?{' '}
                    <button onClick={() => goTo('register')} className="font-extrabold text-pink-500 underline">
                      Kayıt Ol
                    </button>
                  </p>
                </div>
              </>
            )}

            {/* FORGOT PASSWORD */}
            {mode === 'forgot' && (
              <div className="space-y-6 my-auto max-w-sm mx-auto w-full">
                <div>
                  <h2 className="text-title text-app">Şifremi Unuttum</h2>
                  <p className="text-caption text-app-muted mt-1 normal-case">
                    E-posta adresini gir, sana sıfırlama bağlantısı gönderelim.
                  </p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-4 w-5 h-5 text-app-muted" />
                    <input
                      type="email"
                      required
                      placeholder="E-posta Adresi"
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
                    Sıfırlama Bağlantısı Gönder
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
                  <h2 className="text-title text-app">E-postanı Kontrol Et</h2>
                  <p className="text-caption text-app-muted mt-2 normal-case max-w-xs mx-auto leading-relaxed">
                    {forgotEmail} adresine bir şifre sıfırlama bağlantısı gönderdik. Gelen kutunu kontrol et.
                  </p>
                </div>
                <AppButton variant="secondary" size="lg" fullWidth onClick={() => goTo('login')}>
                  Girişe Dön
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
