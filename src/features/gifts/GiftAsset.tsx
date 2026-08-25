import React, { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { API_BASE_URL } from '../../services/api/apiClient';
import type { GiftCatalogItem, GiftSnapshot } from './types';

function resolveGiftAssetUrl(assetUrl: string) {
  if (/^https?:\/\//i.test(assetUrl) || assetUrl.startsWith('data:') || assetUrl.startsWith('blob:')) return assetUrl;
  return `${API_BASE_URL}${assetUrl.startsWith('/') ? '' : '/'}${assetUrl}`;
}

export const GiftAsset: React.FC<{
  gift: GiftCatalogItem | GiftSnapshot;
  className?: string;
  eager?: boolean;
}> = ({ gift, className = 'h-16 w-16', eager = false }) => {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => resolveGiftAssetUrl(gift.assetUrl), [gift.assetUrl]);

  // SVG/PNG/WebP share the same safe catalogue-controlled image path. Lottie is
  // deliberately isolated here so a future renderer can replace only this branch,
  // without touching wallet, purchase, send, or message business logic.
  if (failed || gift.assetType === 'LOTTIE') {
    return (
      <span className={`${className} grid place-items-center rounded-2xl bg-pink-500/10 text-pink-500`} aria-label={gift.name}>
        <Sparkles className="h-1/2 w-1/2" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={gift.name}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`${className} object-contain`}
      onError={() => setFailed(true)}
    />
  );
};

