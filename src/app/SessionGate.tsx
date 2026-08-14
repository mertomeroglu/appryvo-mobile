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
    return isAuthRoute ? <Outlet /> : <Navigate to="/auth" replace />;
  }

  if (isAuthRoute) {
    return <Navigate to="/discover" replace />;
  }

  return <Outlet />;
};

