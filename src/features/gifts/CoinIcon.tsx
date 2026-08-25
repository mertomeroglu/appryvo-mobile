import React from 'react';
import { cn } from '../../lib/utils';

export const CoinIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={cn('h-5 w-5', className)} viewBox="0 0 40 40" aria-hidden="true">
    <defs>
      <linearGradient id="ryvo-coin" x1="5" y1="3" x2="34" y2="37" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFF0A6" />
        <stop offset="0.52" stopColor="#F5B942" />
        <stop offset="1" stopColor="#D48810" />
      </linearGradient>
    </defs>
    <circle cx="20" cy="20" r="17" fill="url(#ryvo-coin)" stroke="#B86E0D" strokeWidth="2" />
    <circle cx="20" cy="20" r="12.5" fill="none" stroke="#FFF4BE" strokeWidth="1.5" opacity=".8" />
    <path d="M14 12.5h7.4c4.3 0 7 2.3 7 6 0 3.1-1.8 5.2-4.8 5.8l5.2 5.2h-5l-6.5-7v7H14v-17Zm3.3 3.2v5.5h3.8c2.4 0 3.8-.9 3.8-2.8 0-1.8-1.4-2.7-3.8-2.7h-3.8Z" fill="#5F3A08" />
  </svg>
);

