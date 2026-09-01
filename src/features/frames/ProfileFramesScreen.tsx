import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Frame as FrameIcon } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type { Product } from '@capgo/native-purchases';
import { QUERY_KEYS, useFrameOwnershipQuery, useFramesQuery } from '../../hooks/useQueries';
import { apiClient } from '../../services/api/apiClient';
import { nativeIap } from '../../native/iap';
import { getPhotoUrl } from '../../services/media/mediaService';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { AppLogo } from '../../components/ui/AppLogo';
import { ProfileAvatarFrame } from '../../components/ui/FramedAvatar';
import { Badge } from '../../components/ui/Badge';
import { PRESS_SCALE, SPRING } from '../../motion/tokens';
import { toast } from '../../stores/useToastStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppTranslation } from '../../i18n/appLocale';

export const ProfileFramesScreen: React.FC = () => {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const { data: frames, isLoading } = useFramesQuery();
  const { data: ownership } = useFrameOwnershipQuery();
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);
  const [storeProducts, setStoreProducts] = useState<Record<string, Product>>({});
  const openedAtRef = useRef(typeof performance !== 'undefined'
    ? performance.getEntriesByName('ryvo:frames:navigation-start').at(-1)?.startTime ?? performance.now()
    : 0);
  const shellReadyRef = useRef(false);
  const catalogReadyRef = useRef(false);
  const firstArtworkReadyRef = useRef(false);

  const activeFrameId = selectedFrameId ?? ownership?.activeFrameId ?? user?.activeFrameId ?? null;
  const photoUrl = getPhotoUrl(user?.photos?.[0]) || user?.photoUrl;

  const handlePurchaseFrame = async (frame: any) => {
    if (isPurchasing) return;
    if (!Capacitor.isNativePlatform()) {
      toast.show(t('frameNativeOnlyMessage'), 'neutral');
      return;
    }
    if (!frame.productId) {
      toast.show(t('frameNotPurchasableMessage'), 'neutral');
      return;
    }
    setIsPurchasing(frame.id);
    try {
      const response: any = await nativeIap.purchaseFrame(frame.productId);
      const ownedFrameIds = response?.data?.ownedFrameIds;
      if (Array.isArray(ownedFrameIds)) {
        queryClient.setQueryData(QUERY_KEYS.frameOwnership, (current: any) => current ? { ...current, ownedFrameIds } : current);
      }
      toast.success(t('framePurchasedToast'));
    } catch (err: any) {
      // Store cancellations resolve/reject without a useful message -- only surface real errors.
      if (err?.message && !/cancel/i.test(err.message)) {
        toast.error(err.message || t('framePurchaseFailedMessage'));
      }
    } finally {
      setIsPurchasing(null);
    }
  };

  const handleSelectFrame = async (frameId: string) => {
    const ownedFrameIds: string[] = Array.isArray(ownership?.ownedFrameIds) ? ownership.ownedFrameIds : ['standard'];
    if (!ownedFrameIds.includes(frameId)) return;
    const previous = activeFrameId;
    setSelectedFrameId(frameId);
    setIsSaving(frameId);
    try {
      // Real, existing profile-update contract — there is no dedicated frame-equip endpoint.
      await apiClient.put('/api/profile', { targetFrame: frameId });
      if (user) setUser({ ...user, activeFrameId: frameId });
      queryClient.setQueryData(QUERY_KEYS.me, (current: any) => current ? { ...current, activeFrameId: frameId } : current);
      queryClient.setQueryData(QUERY_KEYS.frameOwnership, (current: any) => current ? { ...current, activeFrameId: frameId } : current);
      toast.success(t('frameAppliedToast'));
    } catch {
      setSelectedFrameId(previous);
      toast.error(t('frameSelectFailedMessage'));
    } finally {
      setIsSaving(null);
    }
  };

  const frameList: any[] = Array.isArray(frames?.frames) ? frames.frames : [];

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || frameList.length === 0) return;
    let cancelled = false;
    void Promise.all(frameList.filter((frame) => frame.productId && frame.id !== 'standard').map(async (frame) => {
      const product = await nativeIap.getFrameProduct(frame.productId).catch(() => null);
      return [frame.productId, product] as const;
    })).then((entries) => {
      if (!cancelled) setStoreProducts(Object.fromEntries(entries.filter((entry): entry is readonly [string, Product] => Boolean(entry[1]))));
    });
    return () => { cancelled = true; };
  }, [frames]);

  useEffect(() => {
    if (shellReadyRef.current || typeof performance === 'undefined') return;
    const animationFrame = requestAnimationFrame(() => {
      if (shellReadyRef.current) return;
      shellReadyRef.current = true;
      performance.measure('ryvo:frames:shell-ready', { start: openedAtRef.current, end: performance.now() });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (catalogReadyRef.current || isLoading || frames === undefined || typeof performance === 'undefined') return;
    catalogReadyRef.current = true;
    performance.measure('ryvo:frames:catalog-ready', { start: openedAtRef.current, end: performance.now() });
  }, [frames, isLoading]);

  const reportFirstArtworkReady = () => {
    if (firstArtworkReadyRef.current || typeof performance === 'undefined') return;
    firstArtworkReadyRef.current = true;
    performance.measure('ryvo:frames:first-artwork-ready', { start: openedAtRef.current, end: performance.now() });
  };

  return (
    <div className="flex flex-col h-full w-full bg-app text-app p-4 overflow-y-auto no-scrollbar select-none">
      {/* Top Bar */}
      <header className="pt-safe flex items-center justify-between my-2">
        <IconButton aria-label={t('backButtonLabel')} variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </IconButton>
        <div className="flex items-center gap-1.5">
          <AppLogo size="sm" variant="icon" />
          <h3 className="text-heading text-app">{t('profileFramesTitle')}</h3>
        </div>
        <div className="w-9" />
      </header>

      <p className="text-caption text-app-muted text-center mb-6 normal-case">
        {t('profileFramesSubtitle')}
      </p>

      {isLoading && frameList.length === 0 ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="avatar" className="w-20 h-20 mx-auto" />
          ))}
        </div>
      ) : frameList.length === 0 ? (
        <div className="my-auto py-12">
          <EmptyState
            icon={<FrameIcon className="w-7 h-7" />}
            title={t('noFramesTitle')}
            subtitle={t('noFramesSubtitle')}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {frameList.map((f: any, index: number) => {
            const isSelected = activeFrameId === f.id;
            const isOwned = Array.isArray(ownership?.ownedFrameIds) && ownership.ownedFrameIds.includes(f.id);

            return (
              <motion.button
                key={f.id}
                whileTap={{ scale: PRESS_SCALE }}
                transition={SPRING.snappy}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '190px' }}
                onClick={() => (isOwned ? handleSelectFrame(f.id) : handlePurchaseFrame(f))}
                disabled={isSaving === f.id || isPurchasing === f.id}
                className={`p-4 rounded-2xl bg-surface border flex flex-col items-center text-center space-y-3 transition-colors ${
                  isSelected ? 'border-pink-500 bg-pink-500/10 shadow-elevated' : 'border-app shadow-soft'
                }`}
              >
                {/* Same ProfileAvatarFrame used everywhere the equipped frame renders, so the
                    preview here matches reality instead of drifting out of sync with it. */}
                <div className="w-24 h-24 flex items-center justify-center">
                  <ProfileAvatarFrame
                    photoUrl={photoUrl}
                    name={user?.name}
                    activeFrameId={f.id}
                    frame={f}
                    size="lg"
                    preferPreview
                    eager={index < 4}
                    onFrameLoad={reportFirstArtworkReady}
                  />
                </div>

                <span className="text-caption font-extrabold text-app">{f.name || t('frameFallbackLabel')}</span>

                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  {isSelected && (
                    <span className="px-2.5 py-0.5 rounded-full bg-pink-500 text-white text-micro font-black flex items-center gap-1">
                      <Check className="w-3 h-3" /> {t('selectedLabel')}
                    </span>
                  )}
                  {!isSelected && isOwned && <Badge tone="aqua">{t('useLabel')}</Badge>}
                  {!isOwned && (
                    <Badge tone="neutral">
                      {isPurchasing === f.id
                        ? t('purchasingLabel')
                        : storeProducts[f.productId]?.priceString
                          ? storeProducts[f.productId].priceString
                          : t('lockedLabel')}
                    </Badge>
                  )}
                  {f.badge && !isSelected && <Badge tone="aqua">{f.badge}</Badge>}
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
};
