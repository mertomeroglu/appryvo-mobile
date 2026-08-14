import React from 'react';

interface NoInternetStateProps {
  onRetry?: () => void;
}

export const NoInternetState: React.FC<NoInternetStateProps> = ({ onRetry }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center bg-app">
      <div className="w-20 h-20 rounded-3xl bg-surface border border-app shadow-md flex items-center justify-center text-4xl mb-6">
        📡
      </div>
      <h2 className="text-2xl font-extrabold text-app mb-2">İnternet Bağlantısı Yok</h2>
      <p className="text-sm text-app-muted max-w-xs mb-8">
        Lütfen ağ bağlantınızı kontrol edip tekrar deneyin.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="h-13 px-8 rounded-2xl bg-brand-gradient text-white font-extrabold text-sm shadow-md active:scale-95 transition-transform"
        >
          Bağlantıyı Yenile
        </button>
      )}
    </div>
  );
};
