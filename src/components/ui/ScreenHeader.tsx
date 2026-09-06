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
        'shrink-0 z-sticky',
        !transparent && 'border-b border-app bg-surface-80 backdrop-blur-md',
        className
      )}
    >
      <div className="pt-safe">
        <div className="flex min-h-14 items-center gap-3 px-4">
          <div className="flex shrink-0 items-center gap-2">{leading}</div>
          {title && <div className="min-w-0 flex-1 truncate text-heading font-extrabold text-app">{title}</div>}
          <div className="flex shrink-0 items-center gap-2">{trailing}</div>
        </div>
      </div>
    </header>
  );
};
