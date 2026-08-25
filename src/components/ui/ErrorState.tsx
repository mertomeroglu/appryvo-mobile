import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { AppButton } from './AppButton';
import { useAppTranslation } from '../../i18n/appLocale';

interface ErrorStateProps {
  icon?: React.ReactNode;
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  icon = <TriangleAlert className="h-8 w-8" aria-hidden="true" />,
  title,
  message,
  onRetry,
}) => {
  const { t } = useAppTranslation();
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
      <div className="w-20 h-20 rounded-3xl border border-red-500/20 bg-red-500/10 text-red-500 flex items-center justify-center shadow-soft mb-5">
        {icon}
      </div>
      <h3 className="text-heading text-app mb-2">{title ?? t('errorOccurredTitle')}</h3>
      <p className="text-caption text-app-muted normal-case mb-6">{message ?? t('errorOccurredMessage')}</p>
      {onRetry && (
        <AppButton variant="secondary" size="md" onClick={onRetry}>
          {t('retryButton')}
        </AppButton>
      )}
    </div>
  );
};
