import { describe, expect, it } from 'vitest';
import {
  calculateStoreDiscount,
  normalizePublicTier,
  PUBLIC_PLAN_FEATURES,
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

  it('keeps exact Plus and Gold quota matrices', () => {
    expect(PUBLIC_PLAN_FEATURES.PLUS).toContain('3 Super Like / hafta');
    expect(PUBLIC_PLAN_FEATURES.PLUS).toContain('1 adet 30 dk Boost / ay');
    expect(PUBLIC_PLAN_FEATURES.GOLD).toContain('5 Super Like / hafta');
    expect(PUBLIC_PLAN_FEATURES.GOLD).toContain('2 adet 30 dk Boost / ay');
  });

  it('keeps Android and iOS storefront IDs explicit without developer fallback prices', () => {
    expect(SUBSCRIPTION_PRODUCTS).toHaveLength(8);
    expect(SUBSCRIPTION_PRODUCTS.every((product) => product.androidProductId && product.iosProductId)).toBe(true);
    expect(SUBSCRIPTION_PRODUCTS.some((product) => 'fallbackTry' in product)).toBe(false);
  });
});
