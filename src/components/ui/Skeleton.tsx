import React from 'react';
import { cn } from '../../lib/utils';

type SkeletonVariant = 'avatar' | 'title' | 'text' | 'media' | 'card';

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  avatar: 'rounded-full w-14 h-14',
  title: 'h-6 w-40 rounded-md',
  text: 'h-4 w-full rounded-md',
  media: 'aspect-[4/5] w-full rounded-[24px]',
  card: 'h-32 w-full rounded-[24px]',
};

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
}

export const Skeleton: React.FC<SkeletonProps> = ({ variant = 'text', className, ...props }) => (
  <div
    className={cn('animate-pulse bg-app-secondary', VARIANT_CLASSES[variant], className)}
    {...props}
  />
);
