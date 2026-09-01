import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gift, ShoppingBag, X } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Modal } from '../../components/ui/Modal';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../stores/useToastStore';
import { ApiException } from '../../services/api/apiClient';
import { coinService, type GiftSendResult } from '../../services/coins/coinService';
import { CoinIcon } from './CoinIcon';
import { GiftAsset } from './GiftAsset';
import type { CoinCatalogResponse, GiftCatalogItem } from './types';
import { useAppLocaleStore, useAppTranslation } from '../../i18n/appLocale';
import { CoinStoreSheet } from '../coins/CoinStoreSheet';

function requestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export const GiftShopSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  recipientName?: string;
  onGiftSent: (result: GiftSendResult) => void;
}> = ({ isOpen, onClose, matchId, recipientName, onGiftSent }) => {
  const { t } = useAppTranslation();
  const locale = useAppLocaleStore((state) => state.locale);
  const [catalog, setCatalog] = useState<CoinCatalogResponse | null>(null);
  const [selected, setSelected] = useState<GiftCatalogItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [coinShopOpen, setCoinShopOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingRequest = useRef<{ giftId: string; id: string } | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const next = await coinService.getCatalog();
      setCatalog(next);
      setSelected((current) => next.gifts.find((gift) => gift.id === current?.id) || next.gifts[0] || null);
    } catch {
      toast.error(t('giftCatalogLoadFailedToast'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isOpen) void loadCatalog(); }, [isOpen, loadCatalog]);

  const updateBalance = useCallback((balance: number) => {
    setCatalog((current) => {
      if (!current || current.wallet.balance === balance) return current;
      return { ...current, wallet: { ...current.wallet, balance } };
    });
  }, []);

  const sendSelected = async () => {
    if (!selected || !catalog) return;
    if (catalog.wallet.balance < selected.coinCost) {
      setCoinShopOpen(true);
      return;
    }
    const current = pendingRequest.current?.giftId === selected.id
      ? pendingRequest.current
      : { giftId: selected.id, id: requestId() };
    pendingRequest.current = current;
    setSending(true);
    try {
      const result = await coinService.sendGift({ matchId, giftId: selected.id, clientRequestId: current.id });
      pendingRequest.current = null;
      updateBalance(result.balance);
      setConfirmOpen(false);
      onGiftSent(result);
      toast.success(t('giftSentToastTemplate').replace('{name}', selected.name));
      onClose();
    } catch (error) {
      if (error instanceof ApiException && error.code === 'INSUFFICIENT_COINS') {
        const balance = Number(error.rawDetails?.data?.balance ?? catalog.wallet.balance);
        updateBalance(balance);
        setConfirmOpen(false);
        setCoinShopOpen(true);
      } else {
        toast.error(error instanceof Error ? error.message : t('giftSendFailedError'));
      }
    } finally {
      setSending(false);
    }
  };

  const requestSend = () => {
    if (!selected || !catalog) return;
    if (catalog.wallet.balance < selected.coinCost) return setCoinShopOpen(true);
    if (selected.coinCost >= 250 || selected.tier === 'EPIC') return setConfirmOpen(true);
    void sendSelected();
  };

  const insufficient = !!selected && !!catalog && catalog.wallet.balance < selected.coinCost;
  const walletRestricted = catalog?.wallet.restricted === true;
  return (
    <>
      <BottomSheet isOpen={isOpen} onClose={onClose} className="max-h-[86dvh] overflow-hidden">
        <div className="flex max-h-[82dvh] flex-col">
          <div className="flex items-center justify-between px-5 pb-3 pt-2">
            <div className="flex items-center gap-2"><Gift className="h-5 w-5 text-pink-500" /><h2 className="text-heading text-app">{t('giftsTitle')}</h2></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCoinShopOpen(true)} className="flex items-center gap-1.5 rounded-full border border-[#F5B942]/40 bg-[#F5B942]/10 px-3 py-1.5 text-caption font-black text-[#A86E08]"><CoinIcon className="h-4 w-4" />{(catalog?.wallet.balance || 0).toLocaleString(locale)}</button>
              <IconButton aria-label={t('giftsCloseAriaLabel')} variant="ghost" size="sm" onClick={onClose}><X className="h-5 w-5" /></IconButton>
            </div>
          </div>

          <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-3">
            {loading && !catalog ? (
              <div className="grid grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-3xl" />)}</div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {(catalog?.gifts || []).map((gift) => {
                  const active = selected?.id === gift.id;
                  return (
                    <button key={gift.id} type="button" onClick={() => setSelected(gift)} className={`relative flex min-h-32 flex-col items-center rounded-3xl border p-2.5 text-center transition active:scale-[.97] ${active ? 'border-pink-500 bg-pink-500/10 shadow-elevated' : 'border-app bg-surface shadow-soft'}`}>
                      {gift.tier === 'EPIC' && <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-[#F5B942] shadow-premium" />}
                      <GiftAsset gift={gift} eager={active} className="h-16 w-16" />
                      <span className="mt-1 line-clamp-1 text-caption font-extrabold text-app">{gift.name}</span>
                      <span className="mt-1 flex items-center gap-1 text-micro font-black text-[#A86E08]"><CoinIcon className="h-3.5 w-3.5" />{gift.coinCost}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-app bg-surface px-4 pb-[calc(var(--safe-bottom)+12px)] pt-3">
            <AppButton variant="primary" size="lg" fullWidth loading={sending} disabled={!selected || loading || walletRestricted} onClick={requestSend} className={insufficient ? 'bg-gradient-to-r from-[#F5B942] to-[#E79B21] text-[#4D3308]' : ''}>
              {walletRestricted ? t('giftWalletUnderReviewLabel') : insufficient ? <><ShoppingBag className="h-5 w-5" /> {t('giftBuyCoinsAction')}</> : <>{t('giftSendWithCostTemplate').replace('{cost}', String(selected?.coinCost || 0))}</>}
            </AppButton>
          </div>
        </div>
      </BottomSheet>

      <Modal isOpen={confirmOpen} onClose={() => !sending && setConfirmOpen(false)} showCloseButton={false}>
        {selected && <div className="text-center"><GiftAsset gift={selected} eager className="mx-auto h-28 w-28" /><h3 className="mt-2 text-heading text-app">{t('giftConfirmTitle')}</h3><p className="mt-2 text-body normal-case text-app-muted">{t('giftConfirmPromptPrefixTemplate').replace('{recipient}', recipientName || t('giftRecipientFallback')).replace('{giftName}', selected.name)} <strong className="text-app">{selected.coinCost} Coin</strong> {t('giftConfirmPromptSuffix')}</p><div className="mt-5 grid grid-cols-2 gap-2"><AppButton variant="secondary" onClick={() => setConfirmOpen(false)} disabled={sending}>{t('cancel')}</AppButton><AppButton variant="primary" onClick={() => void sendSelected()} loading={sending}>{t('sendAriaLabel')}</AppButton></div></div>}
      </Modal>

      <CoinStoreSheet isOpen={coinShopOpen} onClose={() => setCoinShopOpen(false)} catalog={catalog} onBalance={updateBalance} />
    </>
  );
};
