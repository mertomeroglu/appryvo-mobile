import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils';
import { PRESS_SCALE, SPRING } from '../../motion/tokens';

type IconButtonVariant = 'surface' | 'ghost' | 'gradient' | 'overlay';
type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref'> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  'aria-label': string;
}

const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  surface: 'bg-surface border border-app text-app shadow-soft',
  ghost: 'bg-transparent text-app-muted hover:text-app',
  gradient: 'bg-brand-gradient text-white shadow-elevated shadow-pink-500/30',
  overlay: 'bg-black/40 text-white backdrop-blur-md',
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  // Visual size stays a compact 36px chip (dense contexts rely on that), but `relative` plus the
  // invisible ::before pad the actual tappable area out to the ~44dp minimum mobile touch target
  // without growing the icon or shifting sibling layout.
  sm: "relative w-9 h-9 before:absolute before:-inset-1 before:content-['']",
  md: 'w-11 h-11',
  lg: 'w-14 h-14',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'surface', size = 'md', disabled, className, children, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileTap={disabled ? undefined : { scale: PRESS_SCALE }}
        transition={SPRING.snappy}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-full select-none disabled:opacity-50 disabled:pointer-events-none',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className
        )}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);

IconButton.displayName = 'IconButton';
