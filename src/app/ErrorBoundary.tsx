import React from 'react';
import { AppButton } from '../components/ui/AppButton';
import { crashReporting } from '../native/crashReporting';
import { translateSync } from '../i18n/appLocale';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    void crashReporting.recordException(error, 'ErrorBoundary');
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col h-full w-full bg-app text-app items-center justify-center p-6 text-center gap-4">
          <p className="text-heading text-app">{translateSync('somethingWentWrong')}</p>
          <p className="text-caption text-app-muted normal-case break-all">{this.state.error.message}</p>
          <AppButton variant="primary" size="md" onClick={() => this.setState({ error: null })}>
            {translateSync('retryButton')}
          </AppButton>
        </div>
      );
    }
    return this.props.children;
  }
}
