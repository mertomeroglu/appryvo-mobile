import type { SocialTextKey } from '../social/socialLocale';
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

/** The only plan on sale. */
export const SELLABLE_TIER: SubscriptionTier = 'PLUS';

/**
 * Ryvo Plus benefits rendered on PremiumScreen (socialLocale keys). Every entry maps to a
 * server-enforced entitlement -- nothing here is decorative:
 *  - question answers: FREE is limited to 10 new question interactions per rolling 24h;
 *  - confessions: FREE reads are limited to 10 per day;
 *  - hideFollowersFollowing: the profile setting is premium-gated server-side;
 *  - badge: premium badge shown on the profile.
 * Ryvo Gold is no longer sold; existing Gold members keep their benefits until the end of the
 * paid period (see goldLegacyNotice).
 */
export const PLUS_PLAN_FEATURES: readonly SocialTextKey[] = [
  'premiumFeatureQuestions',
  'premiumFeatureConfessions',
  'premiumFeatureHideFollowLists',
  'premiumFeatureBadge',
];

export function calculateStoreDiscount(weeklyPrice: number, offerPrice: number, weeks: number) {
  if (![weeklyPrice, offerPrice, weeks].every((value) => Number.isFinite(value) && value > 0)) return 0;
  const baseline = weeklyPrice * weeks;
  return offerPrice < baseline ? Math.round((1 - offerPrice / baseline) * 100) : 0;
}
