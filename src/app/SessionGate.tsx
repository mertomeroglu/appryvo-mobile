import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';

/**
 * Route-level session gate. Enforces:
 *   no session    -> /auth
 *   authenticated -> app (redirected away from /auth if already logged in)
 */
export const SessionGate: React.FC = () => {
  const sessionChecked = useAuthStore((s) => s.sessionChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!sessionChecked) {
    // Top-level AppShell SplashScreen overlay covers the viewport until sessionChecked is true
    return null;
  }

  const isAuthRoute = location.pathname.startsWith('/auth');

  if (!isAuthenticated) {
    // Carry the originally-intended route (e.g. a shared-profile or match deep link tapped
    // while logged out) through the redirect so AuthScreen can resume it after a successful
    // login/registration instead of always landing on the default /discover -- see AuthScreen's
    // `resumeDestination`. `location.pathname`/`search` here can only ever be a same-origin
    // in-app path (this is our own router's location, never an external URL), so there's no
    // open-redirect risk in carrying it forward as-is.
    return isAuthRoute
      ? <Outlet />
      : <Navigate to="/auth" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  if (isAuthRoute) {
    return <Navigate to="/discover" replace />;
  }

  return <Outlet />;
};

