export type BillingPlatform = 'APPLE' | 'GOOGLE';
export type PurchaseType = 'COIN' | 'SUBSCRIPTION';
export type SubscriptionTier = 'PLUS' | 'GOLD';
export type SubscriptionPeriod = 'WEEKLY' | 'MONTHLY' | 'THREE_MONTH' | 'SIX_MONTH';

export interface CoinProductConfig {
  logicalId: `COINS_${100 | 250 | 500 | 1000 | 2500 | 5000}`;
  purchaseType: 'COIN';
  coinAmount: 100 | 250 | 500 | 1000 | 2500 | 5000;
  appleProductId: string;
  googleProductId: string;
}

export interface SubscriptionProductConfig {
  logicalId: `${SubscriptionTier}_${SubscriptionPeriod}`;
  purchaseType: 'SUBSCRIPTION';
  tier: SubscriptionTier;
  period: SubscriptionPeriod;
  appleProductId: string;
  googleProductId: 'ryvo_plus' | 'ryvo_gold';
  weeks: number;
}

const COIN_AMOUNTS = [100, 250, 500, 1000, 2500, 5000] as const;

export const COIN_PRODUCTS: readonly CoinProductConfig[] = COIN_AMOUNTS.map((coinAmount) => ({
  logicalId: `COINS_${coinAmount}` as CoinProductConfig['logicalId'],
  purchaseType: 'COIN',
  coinAmount,
  appleProductId: `com.appryvo.ryvo.coins${coinAmount}`,
  googleProductId: `ryvo_coins_${coinAmount}`,
}));

const PERIODS: readonly { period: SubscriptionPeriod; appleSuffix: string; weeks: number }[] = [
  { period: 'WEEKLY', appleSuffix: 'weekly', weeks: 1 },
  { period: 'MONTHLY', appleSuffix: 'monthly', weeks: 52 / 12 },
  { period: 'THREE_MONTH', appleSuffix: '3months', weeks: 13 },
  { period: 'SIX_MONTH', appleSuffix: '6months', weeks: 26 },
];

export const SUBSCRIPTION_PRODUCTS: readonly SubscriptionProductConfig[] = (['PLUS', 'GOLD'] as const).flatMap((tier) =>
  PERIODS.map(({ period, appleSuffix, weeks }) => ({
    logicalId: `${tier}_${period}` as SubscriptionProductConfig['logicalId'],
    purchaseType: 'SUBSCRIPTION' as const,
    tier,
    period,
    appleProductId: `com.appryvo.ryvo.${tier.toLowerCase()}.${appleSuffix}`,
    googleProductId: tier === 'PLUS' ? 'ryvo_plus' as const : 'ryvo_gold' as const,
    weeks,
  }))
);

export const GOOGLE_BASE_PLAN_ALIASES: Readonly<Record<string, SubscriptionPeriod>> = Object.freeze({
  weekly: 'WEEKLY',
  'weekly-1': 'WEEKLY',
  monthly: 'MONTHLY',
  'monthly-1': 'MONTHLY',
  '3-months': 'THREE_MONTH',
  '3-months-1': 'THREE_MONTH',
  'three-months': 'THREE_MONTH',
  '6-months': 'SIX_MONTH',
  '6-months-1': 'SIX_MONTH',
  'six-months': 'SIX_MONTH',
});

export function getSubscriptionProduct(tier: SubscriptionTier, period: SubscriptionPeriod) {
  const product = SUBSCRIPTION_PRODUCTS.find((item) => item.tier === tier && item.period === period);
  if (!product) throw new Error(`Unsupported subscription: ${tier}/${period}`);
  return product;
}

export function getStoreProductId(product: SubscriptionProductConfig, platform: 'ios' | 'android') {
  return platform === 'ios' ? product.appleProductId : product.googleProductId;
}

export function periodFromGoogleBasePlan(basePlanId: string | undefined): SubscriptionPeriod | null {
  return GOOGLE_BASE_PLAN_ALIASES[String(basePlanId || '').trim().toLowerCase()] || null;
}

export function tierFromGoogleProduct(productId: string | undefined): SubscriptionTier | null {
  if (productId === 'ryvo_plus') return 'PLUS';
  if (productId === 'ryvo_gold') return 'GOLD';
  return null;
}

export function coinProductForStoreId(platform: 'ios' | 'android', productId: string) {
  return COIN_PRODUCTS.find((product) => (platform === 'ios' ? product.appleProductId : product.googleProductId) === productId) || null;
}
