import React from 'react';
import { cn } from '../../lib/utils';

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export const Surface: React.FC<SurfaceProps> = ({ elevated, className, children, ...props }) => (
  <div
    className={cn(elevated ? 'bg-surface-elevated' : 'bg-surface', className)}
    {...props}
  >
    {children}
  </div>
);

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({ elevated, padded = true, className, children, ...props }) => (
  <div
    className={cn(
      'rounded-[24px] border border-app shadow-soft',
      elevated ? 'bg-surface-elevated' : 'bg-surface',
      padded && 'p-4',
      className
    )}
    {...props}
  >
    {children}
  </div>
);
