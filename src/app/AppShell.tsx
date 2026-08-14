import React, { Suspense, lazy, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { FloatingNavBar } from '../components/FloatingNavBar';
import { ToastHost } from '../components/ui/Toast';
import { useThemeStore } from '../theme/themeStore';
import { useAuthStore } from '../stores/useAuthStore';
import { SplashScreen } from '../components/ui/SplashScreen';
import { RealtimeSync } from '../components/RealtimeSync';
import { appLifecycleManager } from '../services/appLifecycle';

// Lazy-loaded: pulls in the WebRTC media layer (webrtcService/callService)
const CallOverlay = lazy(() => import('../components/CallOverlay').then((m) => ({ default: m.CallOverlay })));

export const AppShell: React.FC = () => {
  const initTheme = useThemeStore((s) => s.initTheme);
  const restoreSession = useAuthStore((s) => s.restoreSession);

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

  return (
    <div className="flex flex-col h-full w-full bg-app text-app overflow-hidden relative">
      {/* App bootstrap screen: logo + loader while theme/session hydrate */}
      <SplashScreen />

      {/* Realtime plumbing: socket connect/reconcile, push registration, resume reconciliation.
          Renders nothing -- see components/RealtimeSync.tsx. */}
      <RealtimeSync />

      {/* Main Screen Content View */}
      <main className="flex-1 overflow-y-auto relative no-scrollbar">
        <Outlet />
      </main>

      {/* Floating Bottom Navigation Bar */}
      <FloatingNavBar />

      {/* Global Call Overlay Modal */}
      <Suspense fallback={null}>
        <CallOverlay />
      </Suspense>

      {/* Global Toast Notifications */}
      <ToastHost />
    </div>
  );
};



