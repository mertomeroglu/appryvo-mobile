import { describe, expect, it } from 'vitest';
import {
  calculateStoreDiscount,
  normalizePublicTier,
  PLUS_PLAN_FEATURES,
  SELLABLE_TIER,
  SUBSCRIPTION_PRODUCTS,
} from '../src/features/premium/subscriptionProducts';

describe('public premium product system', () => {
  it('maps legacy paid tiers to Ryvo Gold without dropping entitlement', () => {
    expect(normalizePublicTier('VIP')).toBe('GOLD');
    expect(normalizePublicTier('PREMIUM_VIP')).toBe('GOLD');
    expect(normalizePublicTier('PLUS')).toBe('PLUS');
  });

  it('calculates discounts against the same tier weekly baseline', () => {
    expect(calculateStoreDiscount(100, 260, 4)).toBe(35);
    expect(calculateStoreDiscount(100, 410, 4)).toBe(0);
    expect(calculateStoreDiscount(0, 260, 4)).toBe(0);
  });

  it('sells only Ryvo Plus, listing real server-enforced benefits (no Super Like/Boost/Passport)', () => {
    expect(SELLABLE_TIER).toBe('PLUS');
    expect(PLUS_PLAN_FEATURES).toEqual([
      'premiumFeatureQuestions',
      'premiumFeatureConfessions',
      'premiumFeatureHideFollowLists',
      'premiumFeatureBadge',
    ]);
    expect(PLUS_PLAN_FEATURES.join(' ')).not.toMatch(/superlike|boost|passport|likes|rewind|incognito/i);
    // The app shows no ads to anyone (rewarded ads were only on the retired swipe deck), so
    // "ad-free" would be a benefit that does not exist.
    expect(PLUS_PLAN_FEATURES).not.toContain('premiumFeatureAdFree');
  });

  it('keeps Android and iOS storefront IDs explicit without developer fallback prices', () => {
    expect(SUBSCRIPTION_PRODUCTS).toHaveLength(8);
    expect(SUBSCRIPTION_PRODUCTS.every((product) => Boolean(product.googleProductId && product.appleProductId))).toBe(true);
    expect(SUBSCRIPTION_PRODUCTS.some((product) => 'fallbackTry' in product)).toBe(false);
  });
});
