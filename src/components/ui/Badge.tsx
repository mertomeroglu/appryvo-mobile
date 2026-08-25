import React from 'react';
import { BadgeCheck, Crown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'error' | 'aqua';
}

const TONE_CLASSES: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-input-app text-app-muted',
  success: 'bg-[#32D583]/15 text-[#32D583]',
  error: 'bg-[#FF4B55]/15 text-[#FF4B55]',
  aqua: 'bg-[#25D9D0]/15 text-[#25D9D0]',
};

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className, children, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-micro',
      TONE_CLASSES[tone],
      className
    )}
    {...props}
  >
    {children}
  </span>
);

export const PremiumBadge: React.FC<{ className?: string; label?: string }> = ({
  className,
  label = 'Ryvo Gold',
}) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-micro font-bold text-[#3A2A05] bg-gradient-to-r from-[#F5B942] to-[#FBD98A] shadow-premium',
      className
    )}
  >
    <Crown className="w-3 h-3" fill="currentColor" />
    {label}
  </span>
);

export const VerifiedBadge: React.FC<{ className?: string; size?: number }> = ({ className, size = 16 }) => (
  <BadgeCheck
    width={size}
    height={size}
    className={cn('text-[#25D9D0] fill-[#25D9D0]/20 shrink-0', className)}
    aria-label="Verified"
  />
);
