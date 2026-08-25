import React from 'react';

export type ZodiacSign =
  | 'ARIES'
  | 'TAURUS'
  | 'GEMINI'
  | 'CANCER'
  | 'LEO'
  | 'VIRGO'
  | 'LIBRA'
  | 'SCORPIO'
  | 'SAGITTARIUS'
  | 'CAPRICORN'
  | 'AQUARIUS'
  | 'PISCES';

// Hand-drawn line icons (no emoji, no Unicode glyphs, no raster images) — the single shared
// vector source every zodiac surface (edit-profile chips, full profile, profile preview) draws
// from. viewBox/stroke conventions match the rest of the app's line-icon set (lucide-react).
const ZODIAC_ICON_PATHS: Record<ZodiacSign, React.ReactNode> = {
  ARIES: (
    <>
      <path d="M12 21V10" />
      <path d="M12 10C12 6.5 9.8 3.5 6.5 3.5C4 3.5 2.5 5.2 2.5 7.4C2.5 9.1 3.3 10.5 4.8 11.6" />
      <path d="M12 10C12 6.5 14.2 3.5 17.5 3.5C20 3.5 21.5 5.2 21.5 7.4C21.5 9.1 20.7 10.5 19.2 11.6" />
    </>
  ),
  TAURUS: (
    <>
      <circle cx="12" cy="14" r="5.5" />
      <path d="M7.5 8.8C5 7.9 3.5 5.8 3.5 3.5" />
      <path d="M16.5 8.8C19 7.9 20.5 5.8 20.5 3.5" />
    </>
  ),
  GEMINI: (
    <>
      <path d="M7 4V20M17 4V20" />
      <path d="M5 5.5C9 3.5 15 3.5 19 5.5" />
      <path d="M5 18.5C9 20.5 15 20.5 19 18.5" />
    </>
  ),
  CANCER: (
    <>
      <path d="M4.5 8.5C7 5.5 12 4.5 16 6" />
      <path d="M19.5 15.5C17 18.5 12 19.5 8 18" />
      <circle cx="8" cy="9" r="2.2" />
      <circle cx="16" cy="15" r="2.2" />
    </>
  ),
  LEO: (
    <>
      <circle cx="8" cy="13" r="3.5" />
      <path d="M11.5 13C13 8 14 4 17 4C19.5 4 21 5.7 21 7.8C21 10 19.4 11.4 17.4 12.2C14.9 13.2 13.7 14.6 13.7 16.5C13.7 18.5 15.2 20 17.2 20C18.3 20 19.2 19.7 20 19" />
    </>
  ),
  VIRGO: (
    <path d="M4 5V15C4 18 8 18 8 15V7C8 4.3 12 4.3 12 7V15C12 18 16 18 16 15V7C16 4.5 19.5 4.2 20 6.5C20.4 8.3 19.5 10.5 18 12.5L15 16.5L20 20" />
  ),
  LIBRA: (
    <>
      <path d="M5 13H19M3 18H21" />
      <path d="M8 13C8 10 9.7 8 12 8C14.3 8 16 10 16 13" />
    </>
  ),
  SCORPIO: (
    <>
      <path d="M4 5V15C4 18 8 18 8 15V7C8 4.3 12 4.3 12 7V15C12 18 16 18 16 15V7C16 4.5 20 4.5 20 7V17" />
      <path d="M17 15L20 18L23 15" />
    </>
  ),
  SAGITTARIUS: (
    <>
      <path d="M5 19L19 5" />
      <path d="M11 5H19V13" />
      <path d="M7 11L13 17" />
    </>
  ),
  CAPRICORN: (
    <path d="M4 6V14C4 17 8 17 8 14V9C8 6.5 12 6.5 12 9V16C12 18.5 14 20 16.2 20C18.8 20 21 18 21 15.8C21 13.7 19.2 12.2 17.2 12.2C15.3 12.2 14 13.3 14 14.8C14 16 15 17 16.2 17" />
  ),
  AQUARIUS: (
    <>
      <polyline points="3,9 7,6 10,9 14,6 17,9 21,6" />
      <polyline points="3,16 7,13 10,16 14,13 17,16 21,13" />
    </>
  ),
  PISCES: (
    <>
      <path d="M7 4C10 7 10 17 7 20" />
      <path d="M17 4C14 7 14 17 17 20" />
      <path d="M4 12H20" />
    </>
  ),
};

/** Unselected-chip accent colors -- overridden by the chip's own high-contrast text color once selected. */
export const ZODIAC_ACCENT_CLASSES: Record<ZodiacSign, string> = {
  ARIES: 'text-[#FF6B57]',
  TAURUS: 'text-[#7BC67E]',
  GEMINI: 'text-[#F5C445]',
  CANCER: 'text-[#7FD3E8]',
  LEO: 'text-[#F5A623]',
  VIRGO: 'text-[#9CC97E]',
  LIBRA: 'text-[#F7A6C4]',
  SCORPIO: 'text-[#C0435F]',
  SAGITTARIUS: 'text-[#B98CE8]',
  CAPRICORN: 'text-[#8FA6B8]',
  AQUARIUS: 'text-[#4FB8E8]',
  PISCES: 'text-[#5EC9C3]',
};

export interface ZodiacIconProps {
  sign: string;
  className?: string;
  size?: number;
}

export const ZodiacIcon: React.FC<ZodiacIconProps> = ({ sign, className, size = 17 }) => {
  const paths = ZODIAC_ICON_PATHS[sign as ZodiacSign];
  if (!paths) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
};
