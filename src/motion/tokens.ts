/**
 * Shared Motion timing/spring tokens for Appryvo.
 * See .claude/skills/appryvo-mobile-ui-motion/SKILL.md for when to use which category.
 */

export const DURATION = {
  micro: 0.18,
  standard: 0.28,
  emphasis: 0.48,
  /** Boost radar ring pulse cycle — the app's one approved continuous decorative loop. */
  radarCycle: 2.6,
} as const;

export const EASE = {
  standard: [0.4, 0, 0.2, 1],
  decelerate: [0, 0, 0.2, 1],
  accelerate: [0.4, 0, 1, 1],
} as const;

export const SPRING = {
  snappy: { type: 'spring', stiffness: 500, damping: 35, mass: 0.9 },
  soft: { type: 'spring', stiffness: 300, damping: 30, mass: 1 },
  swipeCard: { type: 'spring', stiffness: 400, damping: 32, mass: 1 },
} as const;

export const PRESS_SCALE = 0.97;
