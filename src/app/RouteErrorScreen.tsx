import React, { useEffect } from 'react';
import { useNavigate, useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { AppButton } from '../components/ui/AppButton';
import { crashReporting } from '../native/crashReporting';
import { useAppTranslation } from '../i18n/appLocale';

/**
 * Rendered when a route throws. React Router catches route-level errors itself, before they can
 * reach the React error boundary in main.tsx -- which is why a crash here used to show the
 * router's own developer screen ("Hey developer... provide your own ErrorBoundary") with a raw
 * stack trace, to real users, in English.
 *
 * Two ways out rather than one, because they fail differently: reloading fixes a transient render
 * error, going home fixes a screen that is broken every time it opens.
 */
export const RouteErrorScreen: React.FC = () => {
  const error = useRouteError();
  const navigate = useNavigate();
  const { t } = useAppTranslation();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : (error instanceof Error ? error.message : String(error ?? ''));

  useEffect(() => {
    console.error('[RouteError]', error);
    void crashReporting.recordException(
      error instanceof Error ? error : new Error(message || 'Unknown route error'),
      'RouteErrorScreen'
    );
  }, [error, message]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-app p-6 text-center text-app">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-white">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <p className="text-heading text-app">{t('somethingWentWrong')}</p>
      {message && (
        <p className="max-w-sm text-caption normal-case text-app-muted break-words">{message}</p>
      )}
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <AppButton variant="primary" size="md" fullWidth onClick={() => window.location.reload()}>
          {t('retryButton')}
        </AppButton>
        <AppButton variant="secondary" size="md" fullWidth onClick={() => { navigate('/', { replace: true }); }}>
          {t('map')}
        </AppButton>
      </div>
    </div>
  );
};
