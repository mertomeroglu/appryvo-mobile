/**
 * Shared Motion variants for common transition patterns.
 * See .claude/skills/appryvo-mobile-ui-motion/SKILL.md for choreography rules.
 */
import type { Variants } from 'framer-motion';
import { DURATION, EASE } from './tokens';

/** Forward navigation: subtle x + opacity. Reverse for back navigation by flipping x sign. */
export const pageTransition = (direction: 'forward' | 'back' = 'forward'): Variants => {
  const sign = direction === 'forward' ? 1 : -1;
  return {
    initial: { opacity: 0, x: 24 * sign },
    animate: { opacity: 1, x: 0, transition: { duration: DURATION.standard, ease: EASE.decelerate } },
    exit: { opacity: 0, x: -24 * sign, transition: { duration: DURATION.micro, ease: EASE.accelerate } },
  };
};

/** Generic fade for content swaps (skeleton -> content, tab bodies). */
export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.standard, ease: EASE.standard } },
  exit: { opacity: 0, transition: { duration: DURATION.micro, ease: EASE.accelerate } },
};

/** Scale/fade for centered dialogs (Modal). */
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.94 },
};

/** Bottom-sheet slide-in; pair with a spring transition, not this variant's own timing. */
export const sheetVariants: Variants = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
};

/** Staggered list/grid entrance (Likes grid, Frames gallery, Premium feature list). */
export const staggerContainer = (staggerChildren = 0.05): Variants => ({
  animate: { transition: { staggerChildren } },
});

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE.decelerate } },
};
