import React from 'react';
import { AppButton } from './AppButton';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Bir Hata Oluştu',
  message = 'İstenen veriler yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.',
  onRetry,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center text-2xl font-bold mb-4">
        ⚠️
      </div>
      <h3 className="text-heading text-app mb-2">{title}</h3>
      <p className="text-caption text-app-muted normal-case mb-6">{message}</p>
      {onRetry && (
        <AppButton variant="secondary" size="md" onClick={onRetry}>
          Tekrar Dene
        </AppButton>
      )}
    </div>
  );
};
