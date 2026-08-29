/**
 * Native In-App Purchase & Subscriptions Abstraction
 * Wraps store receipt verification API contracts.
 */
import { Capacitor } from '@capacitor/core';
import { NativePurchases, PURCHASE_TYPE, type Product, type Transaction } from '@capgo/native-purchases';
import { getStoreProductId, SUBSCRIPTION_PRODUCTS } from '../features/premium/subscriptionProducts';
import { apiClient } from '../services/api/apiClient';
import type { CoinPack } from '../features/gifts/types';
import { translateSync } from '../i18n/appLocale';

export const BOOST_PRODUCT_ID = 'ryvo_boost_single';

export interface SubscriptionVerifyPayload {
  platform: 'android' | 'ios';
  purchaseToken: string;
  productId: string;
}

function platform(): 'android' | 'ios' {
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}

function verificationToken(transaction: Transaction) {
  return platform() === 'android' ? transaction.purchaseToken : transaction.transactionId;
}

let subscriptionProductCache: Product[] = [];

function storeIdentity(product: Product) {
  return product.planIdentifier || product.identifier;
}

function mergeStoreProducts(...groups: Product[][]) {
  const products = new Map<string, Product>();
  for (const product of groups.flat()) {
    const identity = storeIdentity(product);
    if (identity) products.set(identity, product);
  }
  return [...products.values()];
}

function matchesStoreId(product: Product, storeId: string) {
  return product.planIdentifier === storeId || product.identifier === storeId;
}

async function verifyTransaction(transaction: Transaction, expectedProductId = transaction.productIdentifier) {
  const purchaseToken = verificationToken(transaction);
  if (!purchaseToken) throw new Error(translateSync('iapVerificationTokenMissingError'));
  return apiClient.post('/api/subscriptions/verify', {
    platform: platform(),
    purchaseToken,
    purchaseId: transaction.transactionId,
    productId: expectedProductId,
  });
}

async function verifyCoinTransaction(transaction: Transaction, expectedProductId: string) {
  const purchaseToken = verificationToken(transaction);
  if (!purchaseToken) throw new Error(translateSync('iapVerificationTokenMissingError'));
  return apiClient.post('/api/coins/purchases/verify', {
    platform: platform(),
    purchaseToken,
    purchaseId: transaction.transactionId,
    productId: expectedProductId,
  });
}

export const nativeIap = {
  async getCoinProducts(packs: CoinPack[]): Promise<Product[]> {
    if (!Capacitor.isNativePlatform()) return [];
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) return [];
    const productIdentifiers = packs.map((pack) => platform() === 'ios' ? pack.iosProductId : pack.androidProductId);
    const result = await NativePurchases.getProducts({
      productIdentifiers,
      productType: PURCHASE_TYPE.INAPP,
    });
    return result.products;
  },

  async purchaseCoinPack(pack: CoinPack) {
    if (!Capacitor.isNativePlatform()) throw new Error(translateSync('giftCoinPurchaseNativeOnlyMessage'));
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) throw new Error(translateSync('iapBillingUnavailableError'));
    const productId = platform() === 'ios' ? pack.iosProductId : pack.androidProductId;
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
      isConsumable: true,
    });
    return verifyCoinTransaction(transaction, productId);
  },

  async getSubscriptionProducts(productIdentifiers?: string[]): Promise<Product[]> {
    if (!Capacitor.isNativePlatform()) return [];
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) {
      throw new Error('STORE_BILLING_UNAVAILABLE');
    }
    const identifiers = [...new Set(productIdentifiers?.length
      ? productIdentifiers
      : SUBSCRIPTION_PRODUCTS.map((product) => getStoreProductId(product, platform())))];

    let fetched: Product[] = [];
    let batchError: unknown = null;
    try {
      const result = await NativePurchases.getProducts({
        productIdentifiers: identifiers,
        productType: PURCHASE_TYPE.SUBS,
      });
      fetched = result.products;
    } catch (error) {
      batchError = error;
    }

    // A single inactive SKU/base-plan can make a mixed storefront query fail. Recover
    // healthy products individually so one bad mapping cannot blank every plan price.
    const missingIdentifiers = identifiers.filter((id) => !fetched.some((product) => matchesStoreId(product, id)));
    if (missingIdentifiers.length > 0) {
      const recovered = await Promise.allSettled(missingIdentifiers.map(async (productIdentifier) => {
        const result = await NativePurchases.getProducts({
          productIdentifiers: [productIdentifier],
          productType: PURCHASE_TYPE.SUBS,
        });
        return result.products;
      }));
      fetched = mergeStoreProducts(
        fetched,
        ...recovered.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
      );
    }

    if (fetched.length > 0) {
      subscriptionProductCache = mergeStoreProducts(subscriptionProductCache, fetched);
      return subscriptionProductCache.filter((product) => identifiers.some((id) => matchesStoreId(product, id)));
    }

    const cached = subscriptionProductCache.filter((product) => identifiers.some((id) => matchesStoreId(product, id)));
    if (cached.length > 0) return cached;
    if (batchError instanceof Error) throw batchError;
    throw new Error('STORE_PRODUCTS_NOT_CONFIGURED');
  },

  async purchaseSubscription(productId: string, storeProductId: string, storeProduct?: Product) {
    if (!Capacitor.isNativePlatform()) throw new Error(translateSync('iapPurchaseNativeOnlyError'));
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) throw new Error(translateSync('iapBillingUnavailableError'));

    // Android Product.identifier is the base-plan ID; Product.planIdentifier is
    // the subscription product ID. StoreKit returns its product ID as identifier.
    const storefrontProductId = platform() === 'android'
      ? storeProduct?.planIdentifier || storeProductId
      : storeProduct?.identifier || storeProductId;
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: storefrontProductId,
      planIdentifier: platform() === 'android' ? storeProduct?.identifier : undefined,
      productType: PURCHASE_TYPE.SUBS,
      quantity: 1,
    });
    return verifyTransaction(transaction, productId);
  },

  async getBoostProduct(): Promise<Product | null> {
    if (!Capacitor.isNativePlatform()) return null;
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) return null;
    const result = await NativePurchases.getProducts({
      productIdentifiers: [BOOST_PRODUCT_ID],
      productType: PURCHASE_TYPE.INAPP,
    });
    return result.products.find((product) => product.identifier === BOOST_PRODUCT_ID) || null;
  },

  async purchaseBoost() {
    if (!Capacitor.isNativePlatform()) throw new Error(translateSync('iapBoostPurchaseNativeOnlyError'));
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: BOOST_PRODUCT_ID,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
      isConsumable: true,
    });
    return verifyTransaction(transaction, BOOST_PRODUCT_ID);
  },

  async getFrameProduct(productId: string): Promise<Product | null> {
    if (!Capacitor.isNativePlatform()) return null;
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) return null;
    const result = await NativePurchases.getProducts({
      productIdentifiers: [productId],
      productType: PURCHASE_TYPE.INAPP,
    });
    return result.products.find((product) => matchesStoreId(product, productId)) || null;
  },

  async purchaseFrame(productId: string) {
    if (!Capacitor.isNativePlatform()) throw new Error(translateSync('iapFramePurchaseNativeOnlyError'));
    const support = await NativePurchases.isBillingSupported();
    if (!support.isBillingSupported) throw new Error(translateSync('iapBillingUnavailableError'));
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
      isConsumable: false,
    });
    const purchaseToken = verificationToken(transaction);
    if (!purchaseToken) throw new Error(translateSync('iapVerificationTokenMissingError'));
    return apiClient.post('/api/profile/frames/purchase/verify', {
      platform: platform(),
      purchaseToken,
      purchaseId: transaction.transactionId,
      productId,
    });
  },

  async verifyPurchase(payload: SubscriptionVerifyPayload) {
    return await apiClient.post('/api/subscriptions/verify', payload);
  },

  async restorePurchases() {
    if (Capacitor.isNativePlatform()) {
      await NativePurchases.restorePurchases();
      const { purchases } = await NativePurchases.getPurchases({
        productType: PURCHASE_TYPE.SUBS,
        onlyCurrentEntitlements: true,
      });
      const knownProducts = new Map(SUBSCRIPTION_PRODUCTS.map((product) => [getStoreProductId(product, platform()), product]));
      for (const transaction of purchases) {
        const transactionStoreId = transaction.planIdentifier || transaction.productIdentifier;
        const configuredProduct = knownProducts.get(transactionStoreId);
        if (configuredProduct) await verifyTransaction(transaction, configuredProduct.productId);
      }
    }
    return apiClient.get('/api/subscriptions/restore');
  },
};
