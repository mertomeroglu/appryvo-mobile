import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import type { Product } from '@capgo/native-purchases';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Compass, Crown, Eye, Heart, RotateCcw, ShieldOff, SlidersHorizontal, Sparkles, Star, TrendingUp, Zap } from 'lucide-react';
import { nativeIap } from '../../native/iap';
import { apiClient } from '../../services/api/apiClient';
import { useEntitlementsQuery } from '../../hooks/useQueries';
import { AppButton } from '../../components/ui/AppButton';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { Skeleton } from '../../components/ui/Skeleton';
import { toast } from '../../stores/useToastStore';
import { DURATION, EASE } from '../../motion/tokens';
import { calculateStoreDiscount, getStoreProductId, getSubscriptionProduct, MIN_MEANINGFUL_DISCOUNT_PERCENT, PUBLIC_PLAN_FEATURES, PUBLIC_PLAN_NAMES, SUBSCRIPTION_PRODUCTS, type SubscriptionPeriod, type SubscriptionTier } from './subscriptionProducts';
import { PASSPORT_LABELS, useAppLocaleStore, useAppTranslation } from '../../i18n/appLocale';
import { LegalModal } from '../../components/LegalModal';
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDocument } from '../../lib/legalContent';

const FEATURE_ICONS = [Heart, ShieldOff, RotateCcw, SlidersHorizontal, Compass, Star, Zap];
const GOLD_FEATURE_ICONS = [Sparkles, Eye, TrendingUp, Star, Zap, ShieldOff, Crown];

interface SubscriptionCatalogItem {
  tier: SubscriptionTier;
  period: SubscriptionPeriod;
  productId: string;
  androidProductId: string;
  iosProductId: string;
}

function findStoreProduct(products: Product[], productId: string) {
  const normalizedId = productId.trim().toLowerCase();
  return products.find((product) =>
    product.planIdentifier?.trim().toLowerCase() === normalizedId
    || product.identifier?.trim().toLowerCase() === normalizedId
  );
}

function hasStorePrice(product?: Product): product is Product {
  return Boolean(product?.priceString && Number.isFinite(product.price) && product.price > 0 && product.currencyCode);
}

function formatLocalizedAmount(value: number, currencyCode: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value);
}

export const PremiumScreen: React.FC = () => {
  const locale = useAppLocaleStore((state) => state.locale);
  const { t } = useAppTranslation();
  const PERIODS: Array<{ id: SubscriptionPeriod; label: string; suffix: string }> = useMemo(() => [
    { id: 'WEEKLY', label: t('periodWeeklyLabel'), suffix: t('periodWeeklySuffix') },
    { id: 'MONTHLY', label: t('periodMonthlyLabel'), suffix: t('periodMonthlySuffix') },
    { id: 'THREE_MONTH', label: t('periodThreeMonthLabel'), suffix: t('periodThreeMonthSuffix') },
    { id: 'SIX_MONTH', label: t('periodSixMonthLabel'), suffix: t('periodSixMonthSuffix') },
  ], [t]);
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<SubscriptionPeriod>('MONTHLY');
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('GOLD');
  const [storeProducts, setStoreProducts] = useState<Product[]>([]);
  const [subscriptionCatalog, setSubscriptionCatalog] = useState<SubscriptionCatalogItem[]>([]);
  const [storeLoadIssue, setStoreLoadIssue] = useState<string | null>(null);
  const [isStoreLoading, setIsStoreLoading] = useState(Capacitor.isNativePlatform());
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const selectedPeriodRef = useRef(selectedPeriod);
  const navigate = useNavigate();
  const { data: entitlements, isLoading, refetch } = useEntitlementsQuery();
  const storePlatform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';

  const catalogProductFor = useCallback((tier: SubscriptionTier, period: SubscriptionPeriod) =>
    subscriptionCatalog.find((product) => product.tier === tier && product.period === period),
  [subscriptionCatalog]);

  const storefrontIdFor = useCallback((tier: SubscriptionTier, period: SubscriptionPeriod) => {
    const serverProduct = catalogProductFor(tier, period);
    if (serverProduct) return storePlatform === 'ios' ? serverProduct.iosProductId : serverProduct.androidProductId;
    return getStoreProductId(getSubscriptionProduct(tier, period), storePlatform);
  }, [catalogProductFor, storePlatform]);

  const loadStoreProducts = useCallback(async () => {
    setIsStoreLoading(true);
    setStoreLoadIssue(null);
    try {
      let catalog: SubscriptionCatalogItem[] = [];
      try {
        const response = await apiClient.get('/api/subscriptions/catalog');
        catalog = Array.isArray(response?.data) ? response.data : [];
        setSubscriptionCatalog(catalog);
      } catch {
        // A transient API failure must not prevent the native store from using the
        // compiled mapping. The server catalog wins whenever it is reachable.
      }
      const compiledIds = SUBSCRIPTION_PRODUCTS.map((product) => getStoreProductId(product, storePlatform));
      const catalogIds = catalog.map((product) => storePlatform === 'ios' ? product.iosProductId : product.androidProductId);
      const productIds = [...new Set([...compiledIds, ...catalogIds].filter(Boolean))];
      const products = await nativeIap.getSubscriptionProducts(productIds);
      setStoreProducts((current) => products.length > 0 ? products : current);
    } catch (error) {
      setStoreLoadIssue(error instanceof Error ? error.message : 'STORE_LOAD_FAILED');
    } finally {
      setIsStoreLoading(false);
    }
  }, [storePlatform]);

  useEffect(() => { void loadStoreProducts(); }, [loadStoreProducts]);
  useEffect(() => { selectedPeriodRef.current = selectedPeriod; }, [selectedPeriod]);

  const periodConfig = PERIODS.find((period) => period.id === selectedPeriod)!;
  const selectedProduct = getSubscriptionProduct(selectedTier, selectedPeriod);
  const selectedCatalogProduct = catalogProductFor(selectedTier, selectedPeriod);
  const selectedStoreProductId = storefrontIdFor(selectedTier, selectedPeriod);
  const storeProduct = findStoreProduct(storeProducts, selectedStoreProductId);
  const priceAvailable = hasStorePrice(storeProduct);
  const missingPriceCopy = !Capacitor.isNativePlatform()
    ? t('missingStorePriceNonNative')
    : storeLoadIssue === 'STORE_BILLING_UNAVAILABLE'
      // Real, common causes: sideloaded via `adb install` instead of a Play testing track, no
      // Play Store account signed in on this device/emulator, or Play Services is missing —
      // never a fake/placeholder price, so be explicit about why nothing can be shown.
      ? t('missingStorePriceBillingUnavailable')
      : storeLoadIssue === 'STORE_PRODUCTS_NOT_CONFIGURED' || !storeLoadIssue
        ? t('missingStorePriceLoading')
        : t('missingStorePriceReconnecting');
  const offer = useMemo(() => {
    const weeklyStore = findStoreProduct(storeProducts, storefrontIdFor(selectedTier, 'WEEKLY'));
    if (hasStorePrice(weeklyStore) && hasStorePrice(storeProduct) && weeklyStore.currencyCode === storeProduct.currencyCode) {
      return {
        discount: calculateStoreDiscount(weeklyStore.price, storeProduct.price, selectedProduct.weeks),
        weeklyLabel: formatLocalizedAmount(storeProduct.price / selectedProduct.weeks, storeProduct.currencyCode),
      };
    }
    return { discount: 0, weeklyLabel: null };
  }, [selectedProduct, selectedTier, storeProduct, storeProducts, storefrontIdFor]);

  const periodOffers = useMemo(() => PERIODS.map((period) => {
    const config = getSubscriptionProduct(selectedTier, period.id);
    const product = findStoreProduct(storeProducts, storefrontIdFor(selectedTier, period.id));
    const weekly = findStoreProduct(storeProducts, storefrontIdFor(selectedTier, 'WEEKLY'));
    const discount = hasStorePrice(product) && hasStorePrice(weekly) && product.currencyCode === weekly.currencyCode
      ? calculateStoreDiscount(weekly.price, product.price, config.weeks)
      : 0;
    return { ...period, config, product, discount };
  }), [selectedTier, storeProducts, storefrontIdFor, PERIODS]);

  const bestPeriod = periodOffers.reduce<(typeof periodOffers)[number] | null>((best, item) =>
    item.discount >= MIN_MEANINGFUL_DISCOUNT_PERCENT && (!best || item.discount > best.discount) ? item : best, null);

  const scrollPeriodIntoCenter = useCallback((period: SubscriptionPeriod, behavior: 'auto' | 'smooth' = 'smooth') => {
    const carousel = carouselRef.current;
    const card = carousel?.querySelector<HTMLElement>(`[data-period="${period}"]`);
    if (!carousel || !card) return;
    carousel.scrollTo({
      left: card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2,
      behavior,
    });
  }, []);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => scrollPeriodIntoCenter(selectedPeriodRef.current, 'auto'));
    return () => cancelAnimationFrame(animationFrame);
    // Recenter the current period when the tier changes without introducing a leading spacer.
  }, [scrollPeriodIntoCenter, selectedTier]);

  const selectPeriod = (period: SubscriptionPeriod, shouldScroll = true) => {
    setSelectedPeriod(period);
    if (shouldScroll) scrollPeriodIntoCenter(period);
  };

  const handleCarouselScroll = () => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const center = carousel.getBoundingClientRect().left + carousel.clientWidth / 2;
    const closest = periodOffers.reduce<{ id: SubscriptionPeriod; distance: number } | null>((current, period) => {
      const card = carousel.querySelector<HTMLElement>(`[data-period="${period.id}"]`);
      if (!card) return current;
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - center);
      return !current || distance < current.distance ? { id: period.id, distance } : current;
    }, null);
    if (closest && closest.id !== selectedPeriod) setSelectedPeriod(closest.id);
  };

  const handlePurchase = async () => {
    if (Capacitor.isNativePlatform() && !storeProduct) {
      toast.error(missingPriceCopy);
      return;
    }
    setIsPurchasing(true);
    try {
      await nativeIap.purchaseSubscription(selectedCatalogProduct?.productId || selectedProduct.productId, selectedStoreProductId, storeProduct);
      await refetch();
      toast.success(t('purchaseVerifiedToast'));
    } catch (err: any) {
      toast.error(err.message || t('purchaseFailedError'));
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      await nativeIap.restorePurchases();
      await refetch();
      toast.success(t('purchasesCheckedToast'));
    } catch (err: any) {
      toast.error(err.message || t('restoreFailedError'));
    } finally {
      setIsRestoring(false);
    }
  };

  const featureIcons = selectedTier === 'GOLD' ? GOLD_FEATURE_ICONS : FEATURE_ICONS;
  const features = PUBLIC_PLAN_FEATURES[selectedTier].map((label, index) => ({
    label: label === 'Passport' ? PASSPORT_LABELS[locale] : label,
    icon: featureIcons[index],
  }));
  return (
    <div className="h-full w-full overflow-y-auto bg-app text-app no-scrollbar select-none">
      <header className="pt-safe mx-4 my-2 flex items-center justify-between">
        <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></IconButton>
        <div className="flex items-center gap-1.5"><AppLogo size="sm" variant="icon" /><h3 className="text-heading text-app">{t('premium')}</h3></div>
        <div className="w-9" />
      </header>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DURATION.emphasis, ease: EASE.decelerate }} className="px-4 pb-[calc(var(--safe-bottom)+2rem)]">
        <div className="py-5 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-[#F5B942] to-[#FBD98A] shadow-premium"><Crown className="h-8 w-8 fill-current text-[#3A2A05]" /></div>
          <h1 className="text-title text-app">{t('choosePlanTitle')}</h1>
          <p className="mt-1 text-caption normal-case text-app-muted">{t('planSwitchHint')}</p>
        </div>

        {entitlements?.isPremium === true && <div className="mb-4 rounded-2xl border border-[#F5B942]/40 bg-[#F5B942]/10 p-3 text-center text-caption font-bold text-[#B57A08]">{t('activeMembershipTemplate').replace('{tier}', entitlements?.subscriptionTier === 'PLUS' ? PUBLIC_PLAN_NAMES.PLUS : PUBLIC_PLAN_NAMES.GOLD)}</div>}

        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-app bg-surface p-1.5 shadow-soft">
          {(['PLUS', 'GOLD'] as const).map((tier) => <button key={tier} type="button" onClick={() => setSelectedTier(tier)} className={`rounded-xl px-3 py-3 text-caption font-extrabold ${selectedTier === tier ? tier === 'GOLD' ? 'bg-[#F5B942] text-[#3A2A05]' : 'bg-brand-gradient text-white' : 'text-app-muted'}`}>{PUBLIC_PLAN_NAMES[tier]}</button>)}
        </div>

        <div ref={carouselRef} onScroll={handleCarouselScroll} aria-label={t('subscriptionPeriodAriaLabel')} className="-me-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto py-3 pe-[15%] no-scrollbar">
          {periodOffers.map(({ id, label, product, discount }) => {
            const selected = selectedPeriod === id;
            const priced = hasStorePrice(product);
            return <button data-period={id} aria-pressed={selected} key={id} type="button" onClick={() => selectPeriod(id)} className={`relative min-h-32 w-[78%] shrink-0 snap-center rounded-3xl border px-4 py-4 text-start transition-[transform,border-color,background-color,opacity,box-shadow] ${selected ? selectedTier === 'GOLD' ? 'scale-100 border-[#F5B942] bg-[#F5B942]/10 shadow-premium' : 'scale-100 border-pink-500 bg-pink-500/10 shadow-elevated' : 'scale-[0.94] border-app bg-surface opacity-70 shadow-soft'}`}>
              <span className="text-caption font-extrabold text-app">{label}</span>
              <div className="mt-3">
                {isStoreLoading ? <Skeleton className="h-7 w-24" /> : priced ? <span className="text-heading font-black text-app">{product.priceString}</span> : <span className="text-micro font-bold normal-case text-amber-600">{missingPriceCopy}</span>}
              </div>
              {id !== 'WEEKLY' && priced && <span className="mt-1 block text-micro normal-case text-app-muted">{t('totalLabel')}</span>}
              {discount >= MIN_MEANINGFUL_DISCOUNT_PERCENT && <span className="absolute end-3 top-3 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-600">{t('discountBadgeTemplate').replace('{discount}', String(discount))}</span>}
              {bestPeriod?.id === id && <span className="absolute bottom-3 end-3 text-[10px] font-black uppercase tracking-wide text-[#B57A08]">{t('bestOfferLabel')}</span>}
            </button>;
          })}
        </div>

        <div className={`mt-4 rounded-3xl border p-5 ${selectedTier === 'GOLD' ? 'border-[#F5B942] bg-gradient-to-br from-[#F5B942]/20 via-surface to-[#FBD98A]/10 shadow-premium' : 'border-pink-500 bg-pink-500/5 shadow-elevated'}`}>
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2">{selectedTier === 'GOLD' ? <Crown className="h-5 w-5 fill-current text-[#F5B942]" /> : <Sparkles className="h-5 w-5 text-pink-500" />}<h2 className="text-heading text-app">{PUBLIC_PLAN_NAMES[selectedTier]}</h2></div><p className="mt-1 text-micro normal-case text-app-muted">{t('periodSubscriptionTemplate').replace('{period}', periodConfig.label)}</p></div>
            {offer.discount >= MIN_MEANINGFUL_DISCOUNT_PERCENT && <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-micro font-black text-emerald-600">{t('discountBadgeTemplate').replace('{discount}', String(offer.discount))}</span>}
          </div>
          <div className="mt-4 flex min-h-10 items-center">{isStoreLoading ? <Skeleton className="h-9 w-36" /> : priceAvailable ? <><span className="text-title font-black text-app">{storeProduct.priceString}</span><span className="ms-1 text-micro font-semibold text-app-muted">{periodConfig.suffix}</span></> : <div><p className="text-caption font-bold text-amber-600">{missingPriceCopy}</p><button type="button" onClick={() => void loadStoreProducts()} className="mt-1 text-caption font-extrabold text-pink-500 underline">{t('refreshPricesAction')}</button></div>}</div>
          {selectedPeriod !== 'WEEKLY' && offer.weeklyLabel && <p className="mt-1 text-caption normal-case text-app-muted">{t('weeklyEquivalentTemplate').replace('{amount}', offer.weeklyLabel)}</p>}
          <div className="mt-4 grid gap-2">
            {features.map(({ icon: Icon, label }) => <div key={label} className="flex items-center gap-2.5 text-caption font-semibold text-app"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${selectedTier === 'GOLD' ? 'bg-[#F5B942]/15 text-[#C58A13]' : 'bg-pink-500/10 text-pink-500'}`}><Icon className="h-3.5 w-3.5" /></span><span>{label}</span><Check className="ms-auto h-4 w-4 text-emerald-500" /></div>)}
          </div>
        </div>

        <AppButton onClick={handlePurchase} loading={isPurchasing} disabled={isStoreLoading || !priceAvailable} variant="primary" size="lg" fullWidth className={selectedTier === 'GOLD' ? 'mt-5 bg-gradient-to-r from-[#F5B942] via-[#F0A93E] to-[#FBD98A] text-[#3A2A05] shadow-premium' : 'mt-5'}>{priceAvailable ? t('switchToTierTemplate').replace('{tier}', PUBLIC_PLAN_NAMES[selectedTier]).replace('{price}', storeProduct.priceString) : isStoreLoading ? t('pricesLoadingLabel') : t('refreshPricesAction')}</AppButton>
        <button onClick={handleRestore} disabled={isRestoring || isLoading} className="mt-3 w-full text-caption font-bold text-app-muted underline disabled:opacity-50">{isRestoring ? t('checkingEllipsisLabel') : t('restorePurchases')}</button>
        <p className="mt-4 text-micro normal-case leading-relaxed text-app-muted">
          {t('subscriptionAutoRenewDisclosure')}{' '}
          <button type="button" onClick={() => setLegalDoc(TERMS_OF_SERVICE)} className="font-bold underline">{TERMS_OF_SERVICE.title}</button>
          {' · '}
          <button type="button" onClick={() => setLegalDoc(PRIVACY_POLICY)} className="font-bold underline">{PRIVACY_POLICY.title}</button>
        </p>
      </motion.div>
      <LegalModal document={legalDoc} onClose={() => setLegalDoc(null)} />
    </div>
  );
};
