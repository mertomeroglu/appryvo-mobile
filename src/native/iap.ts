import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { NativePurchases, PRORATION_MODE, PURCHASE_TYPE, type Product, type Transaction } from '@capgo/native-purchases';
import { apiClient } from '../services/api/apiClient';
import type { CoinPack } from '../features/gifts/types';
import { translateSync } from '../i18n/appLocale';
import { useAuthStore } from '../stores/useAuthStore';
import {
  COIN_PRODUCTS,
  SUBSCRIPTION_PRODUCTS,
  coinProductForStoreId,
  getSubscriptionProduct,
  periodFromGoogleBasePlan,
  tierFromGoogleProduct,
  type SubscriptionPeriod,
  type SubscriptionTier,
} from '../services/billing/catalog';

export const BOOST_PRODUCT_ID = 'ryvo_boost_single';

export interface SubscriptionVerifyPayload {
  platform: 'APPLE' | 'GOOGLE';
  purchaseToken: string;
  productId: string;
  purchaseId?: string;
  signedTransaction?: string;
  basePlanId?: string;
}

function nativePlatform(): 'ios' | 'android' {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

function billingPlatform(): 'APPLE' | 'GOOGLE' {
  return nativePlatform() === 'ios' ? 'APPLE' : 'GOOGLE';
}

function verificationToken(transaction: Transaction) {
  return nativePlatform() === 'android' ? transaction.purchaseToken : transaction.transactionId;
}

function canVerify(transaction: Transaction) {
  return nativePlatform() !== 'android' || transaction.purchaseState === undefined || transaction.purchaseState === '1';
}

function storeIdentity(product: Product) {
  return `${product.planIdentifier || ''}:${product.identifier}:${product.offerToken || ''}`;
}

function mergeStoreProducts(...groups: Product[][]) {
  const products = new Map<string, Product>();
  for (const product of groups.flat()) products.set(storeIdentity(product), product);
  return [...products.values()];
}

function hasNativePrice(product: Product) {
  return Boolean(product.priceString && product.currencyCode && Number.isFinite(product.price) && product.price > 0);
}

function productIdForCoinPack(pack: CoinPack) {
  const compiled = COIN_PRODUCTS.find((item) => item.coinAmount === pack.coinAmount);
  if (!compiled) throw new Error('UNSUPPORTED_COIN_PACKAGE');
  return nativePlatform() === 'ios' ? compiled.appleProductId : compiled.googleProductId;
}

function appAccountToken() {
  const id = useAuthStore.getState().user?.id;
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id : undefined;
}

function verificationPayload(transaction: Transaction, productId: string, basePlanId?: string): SubscriptionVerifyPayload {
  const purchaseToken = verificationToken(transaction);
  if (!purchaseToken) throw new Error(translateSync('iapVerificationTokenMissingError'));
  return {
    platform: billingPlatform(),
    purchaseToken,
    purchaseId: transaction.transactionId,
    signedTransaction: transaction.jwsRepresentation,
    productId,
    basePlanId,
  };
}

async function markCompleted(transaction: Transaction, endpoint: string) {
  const token = verificationToken(transaction);
  if (!token) return;
  if (nativePlatform() === 'android' && transaction.productType === PURCHASE_TYPE.INAPP) {
    await NativePurchases.consumePurchase({ purchaseToken: token });
  } else {
    await NativePurchases.acknowledgePurchase({ purchaseToken: token });
  }
  await apiClient.post(endpoint, {
    platform: billingPlatform(),
    productId: transaction.productIdentifier,
    purchaseToken: token,
  }).catch(() => undefined);
}

async function verifySubscriptionTransaction(transaction: Transaction, basePlanId?: string) {
  if (!canVerify(transaction)) return null;
  const response = await apiClient.post('/api/subscriptions/verify', verificationPayload(
    transaction,
    transaction.productIdentifier,
    basePlanId,
  ));
  await markCompleted(transaction, '/api/subscriptions/complete');
  return response;
}

async function verifyCoinTransaction(transaction: Transaction, expectedProductId: string) {
  if (!canVerify(transaction)) return null;
  const response = await apiClient.post('/api/coins/purchases/verify', verificationPayload(transaction, expectedProductId));
  await markCompleted(transaction, '/api/coins/purchases/complete');
  return response;
}

let subscriptionProductCache: Product[] = [];
let initializePromise: Promise<() => void> | null = null;

export function findSubscriptionStoreProduct(products: Product[], tier: SubscriptionTier, period: SubscriptionPeriod) {
  const config = getSubscriptionProduct(tier, period);
  if (nativePlatform() === 'ios') return products.find((product) => product.identifier === config.appleProductId);
  return products.find((product) =>
    product.planIdentifier === config.googleProductId
    && periodFromGoogleBasePlan(product.identifier) === period
    && Boolean(product.offerToken)
  );
}

async function reconcileTransactions() {
  if (!Capacitor.isNativePlatform()) return;
  const [inAppResult, subsResult] = await Promise.allSettled([
    NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP }),
    NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS }),
  ]);
  if (inAppResult.status === 'fulfilled') {
    for (const transaction of inAppResult.value.purchases) {
      if (canVerify(transaction) && coinProductForStoreId(nativePlatform(), transaction.productIdentifier)) {
        await verifyCoinTransaction(transaction, transaction.productIdentifier).catch(() => undefined);
      }
    }
  }
  if (subsResult.status === 'fulfilled') {
    for (const transaction of subsResult.value.purchases) {
      const known = nativePlatform() === 'android'
        ? Boolean(tierFromGoogleProduct(transaction.productIdentifier))
        : SUBSCRIPTION_PRODUCTS.some((item) => item.appleProductId === transaction.productIdentifier);
      if (known) await verifySubscriptionTransaction(transaction).catch(() => undefined);
    }
  }
}

export const BillingService = {
  async initialize(): Promise<() => void> {
    if (!Capacitor.isNativePlatform()) return () => undefined;
    if (initializePromise) return initializePromise;
    initializePromise = (async () => {
      const handles: PluginListenerHandle[] = [];
      if (nativePlatform() === 'ios') {
        handles.push(await NativePurchases.addListener('transactionUpdated', (transaction) => {
          const coin = coinProductForStoreId('ios', transaction.productIdentifier);
          if (coin) void verifyCoinTransaction(transaction, coin.appleProductId).catch(() => undefined);
          else if (SUBSCRIPTION_PRODUCTS.some((item) => item.appleProductId === transaction.productIdentifier)) {
            void verifySubscriptionTransaction(transaction).catch(() => undefined);
          }
        }));
      }
      await reconcileTransactions();
      return () => {
        handles.forEach((handle) => void handle.remove());
        initializePromise = null;
      };
    })();
    return initializePromise;
  },

  async getCoinProducts(packs?: CoinPack[]): Promise<Product[]> {
    if (!Capacitor.isNativePlatform()) return [];
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) return [];
    const allowedAmounts = packs?.length ? new Set(packs.map((pack) => pack.coinAmount)) : null;
    const productIdentifiers = COIN_PRODUCTS
      .filter((product) => !allowedAmounts || allowedAmounts.has(product.coinAmount))
      .map((product) => nativePlatform() === 'ios' ? product.appleProductId : product.googleProductId);
    const result = await NativePurchases.getProducts({ productIdentifiers, productType: PURCHASE_TYPE.INAPP });
    return result.products.filter(hasNativePrice);
  },

  async purchaseCoin(pack: CoinPack) {
    if (!Capacitor.isNativePlatform()) throw new Error(translateSync('giftCoinPurchaseNativeOnlyMessage'));
    const productId = productIdForCoinPack(pack);
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
      isConsumable: false,
      autoAcknowledgePurchases: false,
      appAccountToken: appAccountToken(),
    });
    return verifyCoinTransaction(transaction, productId);
  },

  async getSubscriptionProducts(): Promise<Product[]> {
    if (!Capacitor.isNativePlatform()) return [];
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) throw new Error('STORE_BILLING_UNAVAILABLE');
    const identifiers = nativePlatform() === 'ios'
      ? SUBSCRIPTION_PRODUCTS.map((product) => product.appleProductId)
      : ['ryvo_plus', 'ryvo_gold'];
    const result = await NativePurchases.getProducts({
      productIdentifiers: [...new Set(identifiers)],
      productType: PURCHASE_TYPE.SUBS,
    });
    const products = result.products.filter((product) => hasNativePrice(product) && (
      nativePlatform() === 'ios'
      || (Boolean(product.offerToken) && Boolean(periodFromGoogleBasePlan(product.identifier)))
    ));
    subscriptionProductCache = mergeStoreProducts(subscriptionProductCache, products);
    return subscriptionProductCache;
  },

  async purchaseSubscription(tier: SubscriptionTier, period: SubscriptionPeriod, storeProduct: Product) {
    if (!Capacitor.isNativePlatform()) throw new Error(translateSync('iapPurchaseNativeOnlyError'));
    const config = getSubscriptionProduct(tier, period);
    const isAndroid = nativePlatform() === 'android';
    if (isAndroid && (
      storeProduct.planIdentifier !== config.googleProductId
      || periodFromGoogleBasePlan(storeProduct.identifier) !== period
      || !storeProduct.offerToken
    )) throw new Error('SELECTED_GOOGLE_OFFER_UNAVAILABLE');

    let oldPurchaseToken: string | undefined;
    let replacementMode: PRORATION_MODE | undefined;
    if (isAndroid) {
      const current = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.SUBS });
      const active = current.purchases.find((purchase) => purchase.purchaseState === '1' && purchase.purchaseToken);
      oldPurchaseToken = active?.purchaseToken;
      if (active && active.productIdentifier !== config.googleProductId) {
        replacementMode = active.productIdentifier === 'ryvo_gold'
          ? PRORATION_MODE.DEFERRED
          : PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION;
      } else if (active) replacementMode = PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION;
    }

    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: isAndroid ? config.googleProductId : config.appleProductId,
      planIdentifier: isAndroid ? storeProduct.identifier : undefined,
      offerToken: isAndroid ? storeProduct.offerToken : undefined,
      oldPurchaseToken,
      replacementMode,
      productType: PURCHASE_TYPE.SUBS,
      quantity: 1,
      autoAcknowledgePurchases: false,
      appAccountToken: appAccountToken(),
    });
    return verifySubscriptionTransaction(transaction, isAndroid ? storeProduct.identifier : undefined);
  },

  async restorePurchases() {
    if (Capacitor.isNativePlatform()) {
      await NativePurchases.restorePurchases();
      await reconcileTransactions();
    }
    return apiClient.get('/api/subscriptions/restore');
  },

  async getBoostProduct(): Promise<Product | null> {
    if (!Capacitor.isNativePlatform()) return null;
    const result = await NativePurchases.getProducts({ productIdentifiers: [BOOST_PRODUCT_ID], productType: PURCHASE_TYPE.INAPP });
    return result.products.find((product) => product.identifier === BOOST_PRODUCT_ID) || null;
  },

  async purchaseBoost() {
    const transaction = await NativePurchases.purchaseProduct({ productIdentifier: BOOST_PRODUCT_ID, productType: PURCHASE_TYPE.INAPP, quantity: 1, isConsumable: false, autoAcknowledgePurchases: false, appAccountToken: appAccountToken() });
    const response = await apiClient.post('/api/subscriptions/verify', verificationPayload(transaction, BOOST_PRODUCT_ID));
    await markCompleted(transaction, '/api/subscriptions/complete');
    return response;
  },

  async getFrameProduct(productId: string): Promise<Product | null> {
    if (!Capacitor.isNativePlatform()) return null;
    const result = await NativePurchases.getProducts({ productIdentifiers: [productId], productType: PURCHASE_TYPE.INAPP });
    return result.products.find((product) => product.identifier === productId) || null;
  },

  async purchaseFrame(productId: string) {
    const transaction = await NativePurchases.purchaseProduct({ productIdentifier: productId, productType: PURCHASE_TYPE.INAPP, quantity: 1, isConsumable: false, autoAcknowledgePurchases: false, appAccountToken: appAccountToken() });
    const payload = verificationPayload(transaction, productId);
    const response = await apiClient.post('/api/profile/frames/purchase/verify', payload);
    await markCompleted(transaction, '/api/subscriptions/complete');
    return response;
  },

  async verifyPurchase(payload: SubscriptionVerifyPayload) {
    return apiClient.post('/api/subscriptions/verify', payload);
  },
};

export const nativeIap = { ...BillingService, purchaseCoinPack: BillingService.purchaseCoin };
