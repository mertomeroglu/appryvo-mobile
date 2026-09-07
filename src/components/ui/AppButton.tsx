import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PRESS_SCALE, SPRING } from '../../motion/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends Omit<HTMLMotionProps<'button'>, 'ref' | 'children'> {
  // motion widens children to ReactNode | MotionValue; this button only ever renders nodes.
  children?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-gradient text-white shadow-elevated shadow-pink-500/20',
  secondary: 'bg-surface text-app border border-app',
  ghost: 'bg-transparent text-app hover:bg-surface',
  danger: 'bg-[#FF4B55] text-white',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-caption rounded-[14px] gap-1.5',
  md: 'h-12 px-5 text-body font-bold rounded-[18px] gap-2',
  lg: 'h-14 px-6 text-heading rounded-[20px] gap-2',
};

export const AppButton = React.forwardRef<HTMLButtonElement, AppButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth,
      loading,
      leftIcon,
      rightIcon,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <motion.button
        ref={ref}
        whileTap={disabled || loading ? undefined : { scale: PRESS_SCALE }}
        transition={SPRING.snappy}
        disabled={disabled || loading}
        className={cn(
          'inline-flex min-w-0 items-center justify-center text-center leading-tight break-words font-semibold select-none disabled:opacity-50 disabled:pointer-events-none',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-[1.1em] h-[1.1em] animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!loading && rightIcon}
      </motion.button>
    );
  }
);

AppButton.displayName = 'AppButton';
