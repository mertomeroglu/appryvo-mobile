import React from 'react';
import { AppLogo } from './AppLogo';
import { useAppTranslation } from '../../i18n/appLocale';

interface LoadingStateProps {
  fullScreen?: boolean;
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  fullScreen = true,
  message,
}) => {
  const { t } = useAppTranslation();
  const resolvedMessage = message ?? t('loadingMessage');
  const content = (
    <div className="flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="relative">
        <AppLogo size="lg" variant="icon" />
        <div className="absolute -inset-2 rounded-full border-2 border-t-pink-500 border-r-purple-500 border-b-transparent border-l-transparent animate-spin" />
      </div>
      <p className="text-xs font-semibold text-app-muted tracking-wider uppercase">{resolvedMessage}</p>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-app">
        {content}
      </div>
    );
  }

  return content;
};
