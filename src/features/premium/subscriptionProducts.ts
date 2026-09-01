import type { AppMessageKey } from '../../i18n/appLocale';
import {
  SUBSCRIPTION_PRODUCTS,
  getStoreProductId,
  getSubscriptionProduct,
  type SubscriptionPeriod,
  type SubscriptionProductConfig,
  type SubscriptionTier,
} from '../../services/billing/catalog';

export type { SubscriptionPeriod, SubscriptionProductConfig, SubscriptionTier };
export { SUBSCRIPTION_PRODUCTS, getStoreProductId, getSubscriptionProduct };
export const MIN_MEANINGFUL_DISCOUNT_PERCENT = 5;

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

export function calculateStoreDiscount(weeklyPrice: number, offerPrice: number, weeks: number) {
  if (![weeklyPrice, offerPrice, weeks].every((value) => Number.isFinite(value) && value > 0)) return 0;
  const baseline = weeklyPrice * weeks;
  return offerPrice < baseline ? Math.round((1 - offerPrice / baseline) * 100) : 0;
}
