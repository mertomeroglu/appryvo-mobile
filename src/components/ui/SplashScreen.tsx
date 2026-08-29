import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLogo } from './AppLogo';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppTranslation } from '../../i18n/appLocale';

interface SplashScreenProps {
  onDismiss?: () => void;
}

/**
 * App bootstrap screen: Ryvo logo + a small breathing-dot loader, nothing else. Shown while
 * theme/session hydration resolves the actual destination (auth vs main app). Dismisses the
 * instant `sessionChecked` is true -- there is no artificial minimum delay and no second
 * loading screen after this one.
 */
export const SplashScreen: React.FC<SplashScreenProps> = ({ onDismiss }) => {
  const { t } = useAppTranslation();
  const sessionChecked = useAuthStore((s) => s.sessionChecked);
  const restoreSession = useAuthStore((s) => s.restoreSession);

  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showErrorOverlay, setShowErrorOverlay] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeStartedRef = useRef(false);

  // Timeout for initialization failures (e.g. 12 seconds with no session response)
  useEffect(() => {
    if (!sessionChecked && !showErrorOverlay) {
      errorTimerRef.current = setTimeout(() => {
        if (!useAuthStore.getState().sessionChecked) {
          setShowErrorOverlay(true);
        }
      }, 12000);
    }
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [sessionChecked, showErrorOverlay]);

  // Guarded by a ref (not state) so this only ever fires once: setIsFadingOut below changes a
  // value that used to sit in this effect's own dependency array, which made React replay the
  // effect on the very next render -- and the replay's cleanup (clearTimeout) canceled the
  // dismiss timer before it could fire, leaving the fully-transparent overlay mounted (and its
  // pointer-events-auto / touch-action:none) forever, silently swallowing every tap in the app.
  useEffect(() => {
    if (!sessionChecked || fadeStartedRef.current) return;
    fadeStartedRef.current = true;
    setIsFadingOut(true);
    const timer = setTimeout(() => {
      setIsDismissed(true);
      onDismiss?.();
    }, 200);
    return () => clearTimeout(timer);
  }, [sessionChecked, onDismiss]);

  const handleRetry = async () => {
    setShowErrorOverlay(false);
    setIsRetrying(true);
    try {
      await restoreSession();
    } catch {
      setShowErrorOverlay(true);
    } finally {
      setIsRetrying(false);
    }
  };

  if (isDismissed) return null;

  return (
    <AnimatePresence>
      {!isDismissed && (
        <motion.div
          key="splash-overlay"
          initial={{ opacity: 1 }}
          animate={{ opacity: isFadingOut ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-app ${
            isFadingOut ? 'pointer-events-none' : 'pointer-events-auto'
          }`}
          style={{ touchAction: isFadingOut ? 'auto' : 'none' }}
        >
          <AppLogo size="xl" variant="full" />
          <BreathingDots />

          {showErrorOverlay && !sessionChecked && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-16 inset-x-6 z-10 flex flex-col items-center justify-center p-5 rounded-2xl bg-surface-90 backdrop-blur-md border border-app shadow-2xl text-center"
            >
              <p className="text-sm font-medium text-app mb-3">{t('splashConnectionFailedTitle')}</p>
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className="px-6 py-2.5 rounded-full bg-brand-gradient text-white text-xs font-semibold shadow-md active:scale-95 transition-transform"
              >
                {isRetrying ? t('splashRetryingLabel') : t('retryButton')}
              </button>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const BreathingDots: React.FC = () => (
  <div className="mt-8 flex items-center gap-1.5">
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="w-2 h-2 rounded-full bg-brand-gradient"
        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
      />
    ))}
  </div>
);
