import React, { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GiftAsset } from './GiftAsset';
import type { GiftSnapshot } from './types';

export const GiftCelebrationOverlay: React.FC<{
  gift: GiftSnapshot | null;
  senderName?: string;
  onDone: () => void;
}> = ({ gift, senderName, onDone }) => {
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!gift) return;
    const timer = window.setTimeout(onDone, reducedMotion ? 700 : 1700);
    return () => window.clearTimeout(timer);
  }, [gift, onDone, reducedMotion]);

  return (
    <AnimatePresence>
      {gift && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-sticky grid place-items-center px-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={reducedMotion ? false : { scale: 0.55, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="w-full max-w-xs rounded-[30px] border border-[#F5B942]/60 bg-surface/95 p-6 text-center shadow-floating backdrop-blur-xl"
          >
            <GiftAsset gift={gift} eager className="mx-auto h-32 w-32 drop-shadow-xl" />
            <p className="mt-2 text-title text-app">{gift.name}</p>
            <p className="mt-1 text-caption normal-case text-app-muted">{senderName || 'Biri'} sana gönderdi</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

