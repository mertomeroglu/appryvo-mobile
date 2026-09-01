import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Product } from '@capgo/native-purchases';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Clock3, RefreshCw, X } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { IconButton } from '../../components/ui/IconButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { nativeIap } from '../../native/iap';
import { COIN_PRODUCTS } from '../../services/billing/catalog';
import { coinService } from '../../services/coins/coinService';
import { toast } from '../../stores/useToastStore';
import { QUERY_KEYS } from '../../hooks/useQueries';
import { useAppLocaleStore, useAppTranslation, translateSync } from '../../i18n/appLocale';
import { CoinIcon } from '../gifts/CoinIcon';
import type { CoinCatalogResponse, CoinLedgerEntry, CoinPack } from '../gifts/types';

function storeProductId(pack: CoinPack) {
  const product = COIN_PRODUCTS.find((item) => item.coinAmount === pack.coinAmount);
  if (!product) return '';
  return Capacitor.getPlatform() === 'ios' ? product.appleProductId : product.googleProductId;
}

function findStoreProduct(products: Product[], pack: CoinPack) {
  const id = storeProductId(pack);
  return products.find((product) => product.identifier === id || product.planIdentifier === id);
}

function historyLabel(entry: CoinLedgerEntry) {
  const locale = useAppLocaleStore.getState().locale;
  if (entry.type === 'PURCHASE') return `${entry.amount > 0 ? '+' : ''}${entry.amount.toLocaleString(locale)} Coin · ${translateSync('giftHistoryPurchaseLabel')}`;
  if (entry.type === 'GIFT_SENT') return `${entry.amount.toLocaleString(locale)} Coin · ${translateSync('giftHistorySentTemplate').replace('{giftName}', entry.metadata.giftName || translateSync('giftFallbackLabel'))}`;
  if (entry.type === 'REFUND_REVERSAL') return `${entry.amount.toLocaleString(locale)} Coin · ${translateSync('giftHistoryRefundLabel')}`;
  return `${entry.amount > 0 ? '+' : ''}${entry.amount.toLocaleString(locale)} Coin · ${translateSync('giftHistoryAdjustmentLabel')}`;
}

export const CoinStoreSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  catalog?: CoinCatalogResponse | null;
  onBalance?: (balance: number) => void;
}> = ({ isOpen, onClose, catalog: suppliedCatalog, onBalance }) => {
  const { t } = useAppTranslation();
  const locale = useAppLocaleStore((state) => state.locale);
  const queryClient = useQueryClient();
  const [catalog, setCatalog] = useState<CoinCatalogResponse | null>(suppliedCatalog || null);
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<CoinLedgerEntry[]>([]);
  const [balance, setBalance] = useState(suppliedCatalog?.wallet.balance || 0);
  const [loadingStore, setLoadingStore] = useState(false);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  const publishBalance = useCallback((next: number) => {
    setBalance(next);
    onBalance?.(next);
    queryClient.setQueryData(QUERY_KEYS.wallet, (current: any) => current ? { ...current, balance: next } : current);
  }, [onBalance, queryClient]);

  const load = useCallback(async () => {
    if (!isOpen) return;
    const currentCatalog = suppliedCatalog || await coinService.getCatalog().catch(() => null);
    if (!currentCatalog) return;
    setCatalog(currentCatalog);
    publishBalance(currentCatalog.wallet.balance);
    const walletPromise = coinService.getWallet().then((wallet) => {
      publishBalance(wallet.balance);
      setHistory(wallet.history);
      queryClient.setQueryData(QUERY_KEYS.wallet, wallet);
    }).catch(() => {});
    if (Capacitor.isNativePlatform()) {
      setLoadingStore(true);
      await Promise.all([
        walletPromise,
        nativeIap.getCoinProducts(currentCatalog.packs).then(setProducts).catch(() => setProducts([])),
      ]).finally(() => setLoadingStore(false));
    } else await walletPromise;
  }, [isOpen, publishBalance, queryClient, suppliedCatalog]);

  useEffect(() => { void load(); }, [load]);

  const buy = async (pack: CoinPack) => {
    if (!findStoreProduct(products, pack)) return toast.error(t('giftPriceLoadFailedToast'));
    setBuyingPack(pack.id);
    try {
      const response = await nativeIap.purchaseCoinPack(pack);
      publishBalance(Number(response?.data?.balance ?? balance));
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.wallet });
      await load();
      toast.success(t('giftCoinsAddedToastTemplate').replace('{amount}', pack.coinAmount.toLocaleString(locale)));
    } catch (error: any) {
      toast.error(error?.message || t('giftCoinPurchaseFailedError'));
    } finally { setBuyingPack(null); }
  };

  return <BottomSheet isOpen={isOpen} onClose={onClose} className="max-h-[92dvh] overflow-hidden">
    <div className="flex max-h-[88dvh] flex-col">
      <div className="flex items-center justify-between px-5 pb-3 pt-2"><div><p className="text-heading text-app">Ryvo Coins</p><p className="text-micro normal-case text-app-muted">{t('giftCoinShopSubtitle')}</p></div><IconButton aria-label={t('giftCloseCoinShopAriaLabel')} variant="ghost" size="sm" onClick={onClose}><X className="h-5 w-5" /></IconButton></div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
        <section className="relative overflow-hidden rounded-[26px] border border-[#F5B942]/45 bg-gradient-to-br from-[#FFF2B6]/70 via-surface to-pink-500/10 p-5 shadow-premium dark:from-[#F5B942]/15"><div className="flex items-center gap-2 text-caption font-extrabold text-[#9A6508]"><CoinIcon className="h-6 w-6" /> {t('giftCoinBalanceLabel')}</div><p className="mt-2 text-display tabular-nums text-app">{balance.toLocaleString(locale)}</p><p className="mt-1 text-micro normal-case text-app-muted">{t('giftCoinsNoExpiryNote')}</p></section>
        {catalog?.wallet.restricted && <p className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-caption normal-case text-amber-700">{t('giftWalletRestrictedMessage')}</p>}
        <div className="mt-5 flex items-center justify-between"><h3 className="text-heading text-app">{t('giftCoinPacksTitle')}</h3><button type="button" onClick={() => void load()} className="flex items-center gap-1 text-caption font-bold text-pink-500"><RefreshCw className="h-3.5 w-3.5" /> {t('giftRefreshAction')}</button></div>
        <div className="mt-3 grid grid-cols-2 gap-3">{(catalog?.packs || []).map((pack) => { const product = findStoreProduct(products, pack); const ready = Boolean(product?.priceString); return <button key={pack.id} type="button" onClick={() => void buy(pack)} disabled={!ready || !!buyingPack} className="rounded-3xl border border-app bg-surface p-4 text-start shadow-soft transition active:scale-[.98] disabled:opacity-60"><div className="flex items-center gap-2"><CoinIcon className="h-7 w-7" /><span className="text-heading font-black text-app">{pack.coinAmount.toLocaleString(locale)}</span></div><div className="mt-3 min-h-5">{loadingStore ? <Skeleton className="h-5 w-20" /> : ready ? <span className="text-caption font-extrabold text-pink-500">{product!.priceString}</span> : <span className="text-micro normal-case text-app-muted">{t('giftPriceUnavailableLabel')}</span>}</div>{buyingPack === pack.id && <span className="mt-2 block text-micro normal-case text-app-muted">{t('giftStoreOpeningLabel')}</span>}</button>; })}</div>
        {!Capacitor.isNativePlatform() && <p className="mt-3 rounded-2xl bg-app-secondary p-3 text-caption normal-case text-app-muted">{t('giftCoinPurchaseNativeOnlyMessage')}</p>}
        <div className="mt-6 flex items-center gap-2"><Clock3 className="h-4 w-4 text-app-muted" /><h3 className="text-heading text-app">{t('giftRecentTransactionsTitle')}</h3></div><div className="mt-3 overflow-hidden rounded-3xl border border-app bg-surface">{history.length === 0 ? <p className="p-4 text-caption normal-case text-app-muted">{t('giftNoTransactionsMessage')}</p> : history.slice(0, 12).map((entry) => <div key={entry.id} className="flex items-center gap-3 border-b border-app px-4 py-3 last:border-b-0"><span className={`grid h-9 w-9 place-items-center rounded-full ${entry.amount > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-pink-500/10 text-pink-500'}`}>{entry.amount > 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-caption font-bold text-app">{historyLabel(entry)}</p><p className="text-micro normal-case text-app-muted">{new Date(entry.createdAt).toLocaleDateString(locale)}</p></div></div>)}</div>
        <p className="mt-5 text-center text-micro normal-case leading-5 text-app-muted">{t('giftCoinsUsageDisclaimer')}</p>
      </div>
    </div>
  </BottomSheet>;
};
