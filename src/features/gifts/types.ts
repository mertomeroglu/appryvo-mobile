export type GiftAssetType = 'SVG' | 'PNG' | 'WEBP' | 'LOTTIE';
export type GiftTier = 'STANDARD' | 'PREMIUM' | 'EPIC';

export interface CoinPack {
  id: string;
  coinAmount: number;
  androidProductId: string;
  iosProductId: string;
  enabled: boolean;
  sortOrder: number;
}

export interface GiftCatalogItem {
  id: string;
  slug: string;
  name: string;
  localizedNames: { tr: string; en: string };
  coinCost: number;
  assetType: GiftAssetType;
  assetUrl: string;
  animationType: string;
  tier: GiftTier;
  fulfillmentType: 'VISUAL_GIFT' | 'FRAME_ENTITLEMENT';
  enabled: boolean;
  sortOrder: number;
}

export type GiftSnapshot = Omit<GiftCatalogItem, 'enabled' | 'sortOrder'>;

export interface CoinLedgerEntry {
  id: string;
  type: 'PURCHASE' | 'GIFT_SENT' | 'ADMIN_ADJUSTMENT' | 'REFUND_REVERSAL';
  amount: number;
  balanceAfter: number;
  referenceType: string;
  platform?: 'ANDROID' | 'IOS' | 'INTERNAL';
  metadata: { coinPackId?: string; giftId?: string; giftName?: string };
  createdAt: string;
}

export interface CoinCatalogResponse {
  wallet: { balance: number; debtBalance: number; restricted: boolean; updatedAt: string | null };
  packs: CoinPack[];
  gifts: GiftCatalogItem[];
}

export interface CoinWalletResponse {
  balance: number;
  debtBalance: number;
  restricted: boolean;
  updatedAt: string | null;
  history: CoinLedgerEntry[];
  coinsExpire: false;
}
