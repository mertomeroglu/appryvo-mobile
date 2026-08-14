import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge doesn't know about this project's custom typography (text-display/title/
// heading/body/caption/micro) and shadow (shadow-soft/elevated/floating/premium) utility
// classes from globals.css. Without registering them, it silently lumped them into Tailwind's
// built-in `text-color`/`shadow-color` groups by prefix -- e.g. cn('text-white', 'text-heading')
// resolved to just 'text-heading', silently dropping the color and leaving text un-colored
// (confirmed on-device: this was why AppButton's primary-variant text rendered in the default
// body color instead of white). Declaring them as their own font-size/shadow groups here makes
// them conflict only with each other, not with unrelated color utilities.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': ['text-display', 'text-title', 'text-heading', 'text-body', 'text-caption', 'text-micro'],
      shadow: ['shadow-soft', 'shadow-elevated', 'shadow-floating', 'shadow-premium'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
