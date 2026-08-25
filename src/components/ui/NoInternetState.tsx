import React from 'react';
import { WifiOff } from 'lucide-react';
import { useAppTranslation } from '../../i18n/appLocale';

interface NoInternetStateProps {
  onRetry?: () => void;
}

export const NoInternetState: React.FC<NoInternetStateProps> = ({ onRetry }) => {
  const { t } = useAppTranslation();
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center bg-app">
      <div className="w-20 h-20 rounded-3xl bg-surface border border-app shadow-soft flex items-center justify-center text-brand-pink mb-6">
        <WifiOff className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="text-2xl font-extrabold text-app mb-2">{t('noInternetTitle')}</h2>
      <p className="text-sm text-app-muted max-w-xs mb-8">
        {t('noInternetMessage')}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="h-13 px-8 rounded-2xl bg-brand-gradient text-white font-extrabold text-sm shadow-md active:scale-95 transition-transform"
        >
          {t('refreshConnectionButton')}
        </button>
      )}
    </div>
  );
};
