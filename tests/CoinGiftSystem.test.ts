import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('Ryvo Coins and chat gifts', () => {
  it('keeps store prices localized and opens native consumable billing', () => {
    const shop = read('src/features/gifts/GiftShopSheet.tsx');
    const iap = read('src/native/iap.ts');
    expect(shop).toContain('product!.priceString');
    expect(shop).not.toMatch(/[₺$]\s*\d/);
    expect(iap).toContain('PURCHASE_TYPE.INAPP');
    expect(iap).toContain('isConsumable: true');
    expect(iap).toContain("'/api/coins/purchases/verify'");
  });

  it('uses catalogue-driven assets and isolates future Lottie rendering', () => {
    const asset = read('src/features/gifts/GiftAsset.tsx');
    expect(asset).toContain('gift.assetUrl');
    expect(asset).toContain("gift.assetType === 'LOTTIE'");
    expect(asset).toContain("loading={eager ? 'eager' : 'lazy'}");
  });

  it('preserves one idempotency key across a failed gift retry', () => {
    const shop = read('src/features/gifts/GiftShopSheet.tsx');
    expect(shop).toContain('pendingRequest.current?.giftId === selected.id');
    expect(shop).toContain('clientRequestId: current.id');
    expect(shop).toContain("error.code === 'INSUFFICIENT_COINS'");
  });

  it('renders gifts outside normal text bubbles with bounded celebration motion', () => {
    const bubble = read('src/features/chat/MessageBubble.tsx');
    const overlay = read('src/features/gifts/GiftCelebrationOverlay.tsx');
    expect(bubble).toContain('<GiftMessageCard');
    expect(overlay).toContain('useReducedMotion');
    expect(overlay).toContain('1700');
    expect(overlay).toContain('pointer-events-none');
  });
});

