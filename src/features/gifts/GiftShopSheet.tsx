import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Product } from '@capgo/native-purchases';
import { ArrowDownLeft, ArrowUpRight, Clock3, Gift, RefreshCw, ShoppingBag, X } from 'lucide-react';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Modal } from '../../components/ui/Modal';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../stores/useToastStore';
import { nativeIap } from '../../native/iap';
import { ApiException } from '../../services/api/apiClient';
import { coinService, type GiftSendResult } from '../../services/coins/coinService';
import { CoinIcon } from './CoinIcon';
import { GiftAsset } from './GiftAsset';
import type { CoinCatalogResponse, CoinLedgerEntry, CoinPack, GiftCatalogItem } from './types';
import { useAppLocaleStore } from '../../i18n/appLocale';

function requestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

function storeProductId(pack: CoinPack) {
  return Capacitor.getPlatform() === 'ios' ? pack.iosProductId : pack.androidProductId;
}

function findStoreProduct(products: Product[], pack: CoinPack) {
  const id = storeProductId(pack);
  return products.find((product) => product.identifier === id || product.planIdentifier === id);
}

function historyLabel(entry: CoinLedgerEntry) {
  const locale = useAppLocaleStore.getState().locale;
  if (entry.type === 'PURCHASE') return `${entry.amount > 0 ? '+' : ''}${entry.amount.toLocaleString(locale)} Coin · Mağaza satın alımı`;
  if (entry.type === 'GIFT_SENT') return `${entry.amount.toLocaleString(locale)} Coin · ${entry.metadata.giftName || 'Hediye'} gönderildi`;
  if (entry.type === 'REFUND_REVERSAL') return `${entry.amount.toLocaleString(locale)} Coin · İade düzeltmesi`;
  return `${entry.amount > 0 ? '+' : ''}${entry.amount.toLocaleString(locale)} Coin · Bakiye düzenlemesi`;
}

const CoinShop: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  catalog: CoinCatalogResponse | null;
  onBalance: (balance: number) => void;
}> = ({ isOpen, onClose, catalog, onBalance }) => {
  const locale = useAppLocaleStore((state) => state.locale);
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<CoinLedgerEntry[]>([]);
  const [balance, setBalance] = useState(catalog?.wallet.balance || 0);
  const [loadingStore, setLoadingStore] = useState(false);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOpen || !catalog) return;
    setBalance(catalog.wallet.balance);
    const walletPromise = coinService.getWallet().then((wallet) => {
      setBalance(wallet.balance);
      setHistory(wallet.history);
      onBalance(wallet.balance);
    }).catch(() => {});
    if (Capacitor.isNativePlatform()) {
      setLoadingStore(true);
      await Promise.all([
        walletPromise,
        nativeIap.getCoinProducts(catalog.packs).then(setProducts).catch(() => setProducts([])),
      ]).finally(() => setLoadingStore(false));
    } else {
      await walletPromise.catch(() => {});
    }
  }, [catalog, isOpen, onBalance]);

  useEffect(() => { void load(); }, [load]);

  const buy = async (pack: CoinPack) => {
    if (!findStoreProduct(products, pack)) {
      toast.error('Fiyat bilgisi yüklenemedi. Tekrar dene.');
      return;
    }
    setBuyingPack(pack.id);
    try {
      const response = await nativeIap.purchaseCoinPack(pack);
      const nextBalance = Number(response?.data?.balance ?? balance);
      setBalance(nextBalance);
      onBalance(nextBalance);
      await load();
      toast.success(`${pack.coinAmount.toLocaleString(locale)} Coin bakiyene eklendi.`);
    } catch (error: any) {
      toast.error(error?.message || 'Coin satın alma tamamlanamadı.');
    } finally {
      setBuyingPack(null);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} className="max-h-[92dvh] overflow-hidden">
      <div className="flex max-h-[88dvh] flex-col">
        <div className="flex items-center justify-between px-5 pb-3 pt-2">
          <div>
            <p className="text-heading text-app">Ryvo Coins</p>
            <p className="text-micro normal-case text-app-muted">Dijital hediyeler için güvenli bakiye</p>
          </div>
          <IconButton aria-label="Coin mağazasını kapat" variant="ghost" size="sm" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-6">
          <section className="relative overflow-hidden rounded-[26px] border border-[#F5B942]/45 bg-gradient-to-br from-[#FFF2B6]/70 via-surface to-pink-500/10 p-5 shadow-premium dark:from-[#F5B942]/15">
            <div className="flex items-center gap-2 text-caption font-extrabold text-[#9A6508]"><CoinIcon className="h-6 w-6" /> Ryvo Coin Bakiyesi</div>
            <p className="mt-2 text-display tabular-nums text-app">{balance.toLocaleString(locale)}</p>
            <p className="mt-1 text-micro normal-case text-app-muted">Coinlerin zaman aşımına uğramaz.</p>
          </section>
          {catalog?.wallet.restricted && <p className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-caption normal-case text-amber-700">Mağaza iadesi incelemesi nedeniyle hediye harcamaları geçici olarak kısıtlandı.</p>}

          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-heading text-app">Coin Paketleri</h3>
            <button type="button" onClick={() => void load()} className="flex items-center gap-1 text-caption font-bold text-pink-500"><RefreshCw className="h-3.5 w-3.5" /> Yenile</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(catalog?.packs || []).map((pack) => {
              const product = findStoreProduct(products, pack);
              const priceReady = Boolean(product?.priceString);
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => void buy(pack)}
                  disabled={!priceReady || !!buyingPack}
                  className="rounded-3xl border border-app bg-surface p-4 text-start shadow-soft transition active:scale-[.98] disabled:opacity-60"
                >
                  <div className="flex items-center gap-2"><CoinIcon className="h-7 w-7" /><span className="text-heading font-black text-app">{pack.coinAmount.toLocaleString(locale)}</span></div>
                  <div className="mt-3 min-h-5">
                    {loadingStore ? <Skeleton className="h-5 w-20" /> : priceReady ? <span className="text-caption font-extrabold text-pink-500">{product!.priceString}</span> : <span className="text-micro normal-case text-app-muted">Fiyat yüklenemedi</span>}
                  </div>
                  {buyingPack === pack.id && <span className="mt-2 block text-micro normal-case text-app-muted">Mağaza açılıyor...</span>}
                </button>
              );
            })}
          </div>
          {!Capacitor.isNativePlatform() && <p className="mt-3 rounded-2xl bg-app-secondary p-3 text-caption normal-case text-app-muted">Coin satın alma yalnızca Ryvo iOS veya Android uygulamasında kullanılabilir.</p>}

          <div className="mt-6 flex items-center gap-2"><Clock3 className="h-4 w-4 text-app-muted" /><h3 className="text-heading text-app">Son İşlemler</h3></div>
          <div className="mt-3 overflow-hidden rounded-3xl border border-app bg-surface">
            {history.length === 0 ? <p className="p-4 text-caption normal-case text-app-muted">Henüz Coin işlemin bulunmuyor.</p> : history.slice(0, 12).map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 border-b border-app px-4 py-3 last:border-b-0">
                <span className={`grid h-9 w-9 place-items-center rounded-full ${entry.amount > 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-pink-500/10 text-pink-500'}`}>
                  {entry.amount > 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1"><p className="truncate text-caption font-bold text-app">{historyLabel(entry)}</p><p className="text-micro normal-case text-app-muted">{new Date(entry.createdAt).toLocaleDateString('tr-TR')}</p></div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-center text-micro normal-case leading-5 text-app-muted">Ryvo Coins yalnızca Ryvo içindeki dijital öğelerde kullanılır; nakde çevrilemez, devredilemez ve çekilemez.</p>
        </div>
      </div>
    </BottomSheet>
  );
};

export const GiftShopSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  recipientName?: string;
  onGiftSent: (result: GiftSendResult) => void;
}> = ({ isOpen, onClose, matchId, recipientName, onGiftSent }) => {
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
      toast.error('Hediye kataloğu yüklenemedi.');
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
      toast.success(`${selected.name} gönderildi.`);
      onClose();
    } catch (error) {
      if (error instanceof ApiException && error.code === 'INSUFFICIENT_COINS') {
        const balance = Number(error.rawDetails?.data?.balance ?? catalog.wallet.balance);
        updateBalance(balance);
        setConfirmOpen(false);
        setCoinShopOpen(true);
      } else {
        toast.error(error instanceof Error ? error.message : 'Hediye gönderilemedi. Tekrar deneyebilirsin.');
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
            <div className="flex items-center gap-2"><Gift className="h-5 w-5 text-pink-500" /><h2 className="text-heading text-app">Hediyeler</h2></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCoinShopOpen(true)} className="flex items-center gap-1.5 rounded-full border border-[#F5B942]/40 bg-[#F5B942]/10 px-3 py-1.5 text-caption font-black text-[#A86E08]"><CoinIcon className="h-4 w-4" />{(catalog?.wallet.balance || 0).toLocaleString(locale)}</button>
              <IconButton aria-label="Hediyeleri kapat" variant="ghost" size="sm" onClick={onClose}><X className="h-5 w-5" /></IconButton>
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
              {walletRestricted ? 'Cüzdan İnceleniyor' : insufficient ? <><ShoppingBag className="h-5 w-5" /> Coin Satın Al</> : <>Gönder · {selected?.coinCost || 0} Coin</>}
            </AppButton>
          </div>
        </div>
      </BottomSheet>

      <Modal isOpen={confirmOpen} onClose={() => !sending && setConfirmOpen(false)} showCloseButton={false}>
        {selected && <div className="text-center"><GiftAsset gift={selected} eager className="mx-auto h-28 w-28" /><h3 className="mt-2 text-heading text-app">Hediyeyi onayla</h3><p className="mt-2 text-body normal-case text-app-muted">{recipientName || 'Bu kişiye'} {selected.name} hediyesini <strong className="text-app">{selected.coinCost} Coin</strong> karşılığında göndermek istiyor musun?</p><div className="mt-5 grid grid-cols-2 gap-2"><AppButton variant="secondary" onClick={() => setConfirmOpen(false)} disabled={sending}>İptal</AppButton><AppButton variant="primary" onClick={() => void sendSelected()} loading={sending}>Gönder</AppButton></div></div>}
      </Modal>

      <CoinShop isOpen={coinShopOpen} onClose={() => setCoinShopOpen(false)} catalog={catalog} onBalance={updateBalance} />
    </>
  );
};
