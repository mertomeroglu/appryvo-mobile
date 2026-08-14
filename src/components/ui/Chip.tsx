import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { PRESS_SCALE, SPRING } from '../../motion/tokens';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'brand' | 'overlay';
}

const TONE_CLASSES: Record<NonNullable<ChipProps['tone']>, string> = {
  neutral: 'bg-input-app text-app border border-app',
  brand: 'bg-brand-gradient text-white',
  overlay: 'bg-white/15 backdrop-blur-md text-white border border-white/10',
};

export const Chip: React.FC<ChipProps> = ({ tone = 'neutral', className, children, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 px-3 py-1 rounded-full text-caption font-semibold',
      TONE_CLASSES[tone],
      className
    )}
    {...props}
  >
    {children}
  </span>
);

export interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export const FilterChip: React.FC<FilterChipProps> = ({ selected, className, children, ...props }) => (
  <motion.button
    type="button"
    whileTap={{ scale: PRESS_SCALE }}
    transition={SPRING.snappy}
    className={cn(
      'px-4 py-2 rounded-full text-caption font-bold border transition-colors',
      selected
        ? 'bg-brand-gradient text-white border-transparent'
        : 'bg-surface text-app-muted border-app',
      className
    )}
    aria-pressed={selected}
    {...props}
  >
    {children}
  </motion.button>
);
