import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { apiClient, ApiException } from '../services/api/apiClient';
import { useAppTranslation } from '../i18n/appLocale';
import { VPN_BLOCKED_EVENT, VpnBlockedDetail } from '../services/security/vpnAccess';

export const VpnAccessGuard: React.FC = () => {
  const { locale, t } = useAppTranslation();
  // VpnBlockedDetail (server-sent) only ever carries tr/en variants -- fall back to English for
  // every other app locale rather than leaving the detail message blank.
  const language = locale === 'tr' ? 'tr' : 'en';
  const [blocked, setBlocked] = useState(false);
  const [detail, setDetail] = useState<VpnBlockedDetail>();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const onBlocked = (event: Event) => {
      setDetail((event as CustomEvent<VpnBlockedDetail>).detail);
      setBlocked(true);
      setChecking(false);
    };
    window.addEventListener(VPN_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(VPN_BLOCKED_EVENT, onBlocked);
  }, []);

  const retry = useCallback(async () => {
    setChecking(true);
    try {
      await apiClient.get('/api/auth/network-check', { skipAuth: true, timeoutMs: 7000 });
      setBlocked(false);
      setDetail(undefined);
    } catch (error) {
      if (!(error instanceof ApiException) || error.code !== 'VPN_NOT_ALLOWED') {
        // Keep the dedicated access message visible for transient provider/network failures.
        setBlocked(true);
      }
    } finally {
      setChecking(false);
    }
  }, []);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-5 backdrop-blur-md" role="alertdialog" aria-modal="true" aria-labelledby="vpn-block-title">
      <div className="w-full max-w-sm rounded-[28px] border border-amber-400/35 bg-[#111620] px-6 py-7 text-center shadow-2xl">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/10 text-amber-300">
          <ShieldAlert size={32} aria-hidden="true" />
        </div>
        <h2 id="vpn-block-title" className="mb-3 text-xl font-extrabold text-white">{t('vpnDetectedTitle')}</h2>
        <p className="mb-6 text-sm leading-6 text-slate-300">{detail?.[language] || t('vpnDetectedBody')}</p>
        <button
          type="button"
          onClick={retry}
          disabled={checking}
          className="min-h-12 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 px-5 font-bold text-slate-950 disabled:cursor-wait disabled:opacity-70"
        >
          {checking ? t('vpnCheckingLabel') : t('retryButton')}
        </button>
      </div>
    </div>
  );
};
