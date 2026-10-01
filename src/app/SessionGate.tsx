import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { AGE_VERIFICATION_REQUIRED_EVENT } from '../services/security/ageVerification';
import { AgeVerificationScreen } from '../features/auth/AgeVerificationScreen';

/**
 * Route-level session gate. Enforces:
 *   no session    -> /auth
 *   authenticated -> app (redirected away from /auth if already logged in)
 *   authenticated without a birth date on file -> AgeVerificationScreen (18+ gate), nothing else
 */
export const SessionGate: React.FC = () => {
  const sessionChecked = useAuthStore((s) => s.sessionChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const ageVerificationRequired = useAuthStore((s) => s.user?.ageVerificationRequired === true);
  const location = useLocation();

  // Any API call answered with AGE_VERIFICATION_REQUIRED flips the gate on, even if the cached
  // profile predates the server-side state.
  useEffect(() => {
    const onRequired = () => {
      const { user, setUser } = useAuthStore.getState();
      if (user && user.ageVerificationRequired !== true) setUser({ ...user, ageVerificationRequired: true });
    };
    window.addEventListener(AGE_VERIFICATION_REQUIRED_EVENT, onRequired);
    return () => window.removeEventListener(AGE_VERIFICATION_REQUIRED_EVENT, onRequired);
  }, []);

  if (!sessionChecked) {
    // Top-level AppShell SplashScreen overlay covers the viewport until sessionChecked is true
    return null;
  }

  const isAuthRoute = location.pathname.startsWith('/auth');

  if (!isAuthenticated) {
    // Carry the originally-intended route (e.g. a shared-profile or match deep link tapped
    // while logged out) through the redirect so AuthScreen can resume it after a successful
    // login/registration instead of always landing on the default /map -- see AuthScreen's
    // `resumeDestination`. `location.pathname`/`search` here can only ever be a same-origin
    // in-app path (this is our own router's location, never an external URL), so there's no
    // open-redirect risk in carrying it forward as-is.
    return isAuthRoute
      ? <Outlet />
      : <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  if (ageVerificationRequired) {
    return <AgeVerificationScreen />;
  }

  if (isAuthRoute) {
    return <Navigate to="/map" replace />;
  }

  return <Outlet />;
};

