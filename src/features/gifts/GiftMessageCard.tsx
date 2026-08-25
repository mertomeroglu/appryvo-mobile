import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GiftAsset } from './GiftAsset';
import type { GiftSnapshot } from './types';

export const GiftMessageCard: React.FC<{
  gift: GiftSnapshot;
  isMe: boolean;
  senderName?: string;
  animate?: boolean;
}> = ({ gift, isMe, senderName, animate = false }) => {
  const reducedMotion = useReducedMotion();
  const premium = gift.tier !== 'STANDARD';
  return (
    <motion.div
      initial={animate && !reducedMotion ? { opacity: 0, scale: 0.72, y: 12 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 330, damping: 22 }}
      className={`relative min-w-[210px] overflow-hidden rounded-3xl border p-4 shadow-elevated ${
        premium
          ? 'border-[#F5B942]/60 bg-gradient-to-br from-[#F5B942]/20 via-surface to-pink-500/10'
          : 'border-pink-500/25 bg-surface'
      }`}
    >
      {animate && !reducedMotion && (
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0.3, 1.1, 1.5], rotate: [0, 20, 35] }}
          transition={{ duration: 1.1 }}
          className="pointer-events-none absolute right-5 top-4 text-xl text-[#F5B942]"
        >
          ✦
        </motion.span>
      )}
      <div className="flex items-center gap-3">
        <GiftAsset gift={gift} eager={animate} className="h-20 w-20 shrink-0 drop-shadow-md" />
        <div className="min-w-0">
          <p className="text-heading font-black text-app">{gift.name}</p>
          <p className="mt-1 text-caption normal-case leading-5 text-app-muted">
            {isMe ? 'Bu hediyeyi sen gönderdin' : `${senderName || 'Biri'} sana bir hediye gönderdi`}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

