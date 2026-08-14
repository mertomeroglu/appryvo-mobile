import React from 'react';
import { cn } from '../../lib/utils';

export interface ScreenHeaderProps {
  title?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  transparent?: boolean;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  leading,
  trailing,
  className,
  transparent,
}) => {
  return (
    <header
      className={cn(
        'pt-safe px-4 h-16 flex items-center justify-between z-sticky',
        !transparent && 'border-b border-app bg-surface/80 backdrop-blur-md',
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">{leading}</div>
      {title && <div className="text-heading font-extrabold text-app truncate">{title}</div>}
      <div className="flex items-center gap-2">{trailing}</div>
    </header>
  );
};
