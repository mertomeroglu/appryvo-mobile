import React, { Suspense, lazy, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { FloatingNavBar } from '../components/FloatingNavBar';
import { ToastHost } from '../components/ui/Toast';
import { useThemeStore } from '../theme/themeStore';
import { useAuthStore } from '../stores/useAuthStore';
import { SplashScreen } from '../components/ui/SplashScreen';
import { RealtimeSync } from '../components/RealtimeSync';
import { appLifecycleManager } from '../services/appLifecycle';
import { AppLanguagePicker } from '../components/AppLanguagePicker';
import { useKeyboardViewport } from '../hooks/useKeyboardViewport';
import { useCallStore } from '../stores/useCallStore';
import { ProfileFrameCatalogProvider } from '../components/ui/FramedAvatar';
import { VpnAccessGuard } from '../components/VpnAccessGuard';
import { preloadProfileExperience } from '../routes/routePreload';
import { nativeAdMob } from '../native/admob';
import { BillingService } from '../native/iap';

// Lazy-loaded: pulls in the WebRTC media layer (webrtcService/callService)
const CallOverlay = lazy(() => import('../components/CallOverlay').then((m) => ({ default: m.CallOverlay })));

const CallOverlayGate: React.FC = () => {
  const hasActiveCall = useCallStore((state) => state.activeCall !== null);
  if (!hasActiveCall) return null;
  return (
    <Suspense fallback={null}>
      <CallOverlay />
    </Suspense>
  );
};

export const AppShell: React.FC = () => {
  const initTheme = useThemeStore((s) => s.initTheme);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();
  useKeyboardViewport();

  useEffect(() => {
    initTheme();
    restoreSession();

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    appLifecycleManager.init().then((fn) => {
      if (cancelled) fn();
      else cleanup = fn;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [initTheme, restoreSession]);

  useEffect(() => {
    // Rewarded ads (Discover's daily-like exhaustion path) need the SDK + consent flow ready
    // before the first ad request; init is idempotent and never blocks app usage on failure.
    if (isAuthenticated) void nativeAdMob.initialize();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void BillingService.initialize().then((removeListeners) => {
      if (cancelled) removeListeners();
      else cleanup = removeListeners;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const requestIdle = (window as typeof window & {
      requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    if (requestIdle) {
      const id = requestIdle(() => void preloadProfileExperience(), { timeout: 2500 });
      return () => (window as typeof window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => void preloadProfileExperience(), 800);
    return () => window.clearTimeout(id);
  }, [isAuthenticated]);

  return (
    <ProfileFrameCatalogProvider>
    <div className="flex flex-col h-full w-full bg-app text-app overflow-hidden relative">
      {/* App bootstrap screen: logo + loader while theme/session hydrate */}
      <SplashScreen />

      {/* The trigger belongs on auth; the required first-run prompt is global so an existing
          session with an unsupported device language is never silently skipped. */}
      <AppLanguagePicker showTrigger={location.pathname.startsWith('/auth')} />

      {/* Realtime plumbing: socket connect/reconcile, push registration, resume reconciliation.
          Renders nothing -- see components/RealtimeSync.tsx. */}
      <RealtimeSync />

      {/* Main Screen Content View */}
      <main className="flex-1 min-h-0 overflow-y-auto relative no-scrollbar">
        <Outlet />
      </main>

      {/* Floating Bottom Navigation Bar */}
      <FloatingNavBar />

      {/* Global Call Overlay Modal */}
      <CallOverlayGate />

      {/* Global Toast Notifications */}
      <ToastHost />

      {/* Server-authoritative temporary network access restriction. */}
      <VpnAccessGuard />
    </div>
    </ProfileFrameCatalogProvider>
  );
};


