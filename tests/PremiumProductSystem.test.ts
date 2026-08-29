import { describe, expect, it } from 'vitest';
import {
  calculateStoreDiscount,
  normalizePublicTier,
  PUBLIC_PLAN_FEATURES,
  SUBSCRIPTION_PRODUCTS,
} from '../src/features/premium/subscriptionProducts';
import { messages } from '../src/i18n/appLocale';

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

  it('keeps exact Plus and Gold quota matrices', () => {
    // PUBLIC_PLAN_FEATURES now holds AppMessageKeys (translated via t() on render) rather than
    // literal display strings -- assert on the key names, and cross-check their `tr` copy still
    // matches what used to be hardcoded here.
    expect(PUBLIC_PLAN_FEATURES.PLUS).toContain('planFeaturePlusSuperLike');
    expect(PUBLIC_PLAN_FEATURES.PLUS).toContain('planFeaturePlusBoost');
    expect(PUBLIC_PLAN_FEATURES.GOLD).toContain('planFeatureGoldSuperLike');
    expect(PUBLIC_PLAN_FEATURES.GOLD).toContain('planFeatureGoldBoost');
    expect(messages.tr.planFeaturePlusSuperLike).toBe('3 Super Like / hafta');
    expect(messages.tr.planFeaturePlusBoost).toBe('1 adet 30 dk Boost / ay');
    expect(messages.tr.planFeatureGoldSuperLike).toBe('5 Super Like / hafta');
    expect(messages.tr.planFeatureGoldBoost).toBe('2 adet 30 dk Boost / ay');
  });

  it('keeps Android and iOS storefront IDs explicit without developer fallback prices', () => {
    expect(SUBSCRIPTION_PRODUCTS).toHaveLength(8);
    expect(SUBSCRIPTION_PRODUCTS.every((product) => product.androidProductId && product.iosProductId)).toBe(true);
    expect(SUBSCRIPTION_PRODUCTS.some((product) => 'fallbackTry' in product)).toBe(false);
  });
});
