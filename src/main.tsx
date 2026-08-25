import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { AppRouter } from './routes';
import { ErrorBoundary } from './app/ErrorBoundary';
import { crashReporting } from './native/crashReporting';
import './styles/globals.css';

// Keep one shared React tree while allowing the stylesheet to avoid Android WebView effects
// that allocate large off-screen render surfaces (notably backdrop-filter). This is a rendering
// capability hint, not a platform-specific component fork.
document.documentElement.dataset.platform = Capacitor.getPlatform();

// React's ErrorBoundary only catches errors thrown during render/lifecycle -- not inside event
// handlers, timers, or unawaited promises. These two catch everything else so a rejected
// fetch or a bug in a click handler doesn't crash silently with nothing in Crashlytics.
window.addEventListener('error', (event) => {
  void crashReporting.recordException(event.error || event.message, 'window.onerror');
});
window.addEventListener('unhandledrejection', (event) => {
  void crashReporting.recordException(event.reason, 'unhandledrejection');
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
