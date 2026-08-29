import type { AppMessageKey } from '../../i18n/appLocale';

export type SubscriptionTier = 'PLUS' | 'GOLD';
export type SubscriptionPeriod = 'WEEKLY' | 'MONTHLY' | 'THREE_MONTH' | 'SIX_MONTH';
export const MIN_MEANINGFUL_DISCOUNT_PERCENT = 5;

export interface SubscriptionProductConfig {
  tier: SubscriptionTier;
  period: SubscriptionPeriod;
  /** Canonical ID accepted by Ryvo's receipt-verification API. */
  productId: string;
  /** Storefront IDs are explicit even while both stores share today's configured IDs. */
  androidProductId: string;
  iosProductId: string;
  weeks: number;
}

export const PUBLIC_PLAN_NAMES: Record<SubscriptionTier, string> = {
  PLUS: 'Ryvo Plus',
  GOLD: 'Ryvo Gold',
};

/** Keeps old server/database tier values entitled while exposing only public names. */
export function normalizePublicTier(value: unknown): SubscriptionTier | 'FREE' {
  const tier = String(value || '').toUpperCase();
  if (tier === 'PLUS') return 'PLUS';
  if (tier === 'GOLD' || tier === 'VIP' || tier === 'PREMIUM_VIP') return 'GOLD';
  return 'FREE';
}

/** Feature list rendered on PremiumScreen. Each entry is either an AppMessageKey (translated
 * via t()) or the literal sentinel 'Passport' -- PremiumScreen swaps that one for
 * PASSPORT_LABELS[locale] instead, since the Passport feature's display name is itself already
 * a full per-locale label map (see appLocale.ts). */
export const PUBLIC_PLAN_FEATURES: Record<SubscriptionTier, readonly (AppMessageKey | 'Passport')[]> = {
  PLUS: [
    'planFeaturePlusUnlimitedLikes',
    'planFeaturePlusAdFree',
    'planFeaturePlusUnlimitedRewind',
    'filterAdvancedFiltersLabel',
    'Passport',
    'planFeaturePlusSuperLike',
    'planFeaturePlusBoost',
  ],
  GOLD: [
    'planFeatureGoldAllPlusFeatures',
    'planFeatureGoldSeeLikesInstantly',
    'planFeatureGoldPriorityRanking',
    'planFeatureGoldSuperLike',
    'planFeatureGoldBoost',
    'planFeatureGoldIncognito',
    'planFeatureGoldBadge',
  ],
};

export const SUBSCRIPTION_PRODUCTS: SubscriptionProductConfig[] = [
  { tier: 'PLUS', period: 'WEEKLY', productId: 'ryvo_plus_weekly', androidProductId: 'ryvo_plus_weekly', iosProductId: 'ryvo_plus_weekly', weeks: 1 },
  { tier: 'PLUS', period: 'MONTHLY', productId: 'ryvo_plus_monthly', androidProductId: 'ryvo_plus_monthly', iosProductId: 'ryvo_plus_monthly', weeks: 52 / 12 },
  { tier: 'PLUS', period: 'THREE_MONTH', productId: 'ryvo_plus_3m', androidProductId: 'ryvo_plus_3m', iosProductId: 'ryvo_plus_3m', weeks: 13 },
  { tier: 'PLUS', period: 'SIX_MONTH', productId: 'ryvo_plus_6m', androidProductId: 'ryvo_plus_6m', iosProductId: 'ryvo_plus_6m', weeks: 26 },
  { tier: 'GOLD', period: 'WEEKLY', productId: 'ryvo_vip_weekly', androidProductId: 'ryvo_vip_weekly', iosProductId: 'ryvo_vip_weekly', weeks: 1 },
  { tier: 'GOLD', period: 'MONTHLY', productId: 'ryvo_vip_monthly', androidProductId: 'ryvo_vip_monthly', iosProductId: 'ryvo_vip_monthly', weeks: 52 / 12 },
  { tier: 'GOLD', period: 'THREE_MONTH', productId: 'ryvo_vip_3m', androidProductId: 'ryvo_vip_3m', iosProductId: 'ryvo_vip_3m', weeks: 13 },
  { tier: 'GOLD', period: 'SIX_MONTH', productId: 'ryvo_vip_6m', androidProductId: 'ryvo_vip_6m', iosProductId: 'ryvo_vip_6m', weeks: 26 },
];

export function getSubscriptionProduct(tier: SubscriptionTier, period: SubscriptionPeriod) {
  return SUBSCRIPTION_PRODUCTS.find((product) => product.tier === tier && product.period === period)!;
}

export function getStoreProductId(product: SubscriptionProductConfig, store: 'android' | 'ios') {
  return store === 'ios' ? product.iosProductId : product.androidProductId;
}

export function calculateStoreDiscount(weeklyPrice: number, offerPrice: number, weeks: number) {
  if (![weeklyPrice, offerPrice, weeks].every((value) => Number.isFinite(value) && value > 0)) return 0;
  const baseline = weeklyPrice * weeks;
  return offerPrice < baseline ? Math.round((1 - offerPrice / baseline) * 100) : 0;
}
