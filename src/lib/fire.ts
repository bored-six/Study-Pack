/**
 * The streak fire. A number alone says little; a fire that visibly grows
 * says "this has been going a while" at a glance — and gives the streak
 * somewhere to go beyond incrementing.
 *
 * Tier names are deliberately warm rather than gamey: nobody is ranking
 * up, their fire is just getting bigger.
 */
import type { IconName } from '@/components/Icon';
import { colors } from '@/theme/tokens';

export interface FireTier {
  /** Smallest streak that reaches this tier. */
  from: number;
  name: string;
  icon: IconName;
  color: string;
  /** Said once, when the tier is first reached. */
  greeting: string;
}

/** Ordered smallest first. */
export const FIRE_TIERS: FireTier[] = [
  {
    from: 0,
    name: 'Unlit',
    icon: 'spark',
    color: colors.textFaint,
    greeting: 'Take a quiz to light it.',
  },
  {
    from: 1,
    name: 'Spark',
    icon: 'spark',
    color: '#C9A227',
    greeting: 'A spark. Everything starts here.',
  },
  {
    from: 3,
    name: 'Kindling',
    icon: 'flameSmall',
    color: colors.gold,
    greeting: 'Three days. It has caught.',
  },
  {
    from: 7,
    name: 'Steady burn',
    icon: 'flame',
    color: '#D9832B',
    greeting: 'A week of showing up. It burns on its own now.',
  },
  {
    from: 14,
    name: 'Roaring',
    icon: 'flameBig',
    color: colors.coral,
    greeting: 'Two weeks. This is a habit, not an effort.',
  },
  {
    from: 30,
    name: 'Blue flame',
    icon: 'flameBig',
    color: '#2E6FA3',
    greeting: 'A month. The fire went blue — that is the hottest part.',
  },
  {
    from: 100,
    name: 'Everlasting',
    icon: 'flameCrown',
    color: '#6C51A8',
    greeting: 'A hundred days. Hardly anyone gets here.',
  },
];

export function fireFor(streak: number): FireTier {
  let tier = FIRE_TIERS[0];
  for (const candidate of FIRE_TIERS) {
    if (streak >= candidate.from) tier = candidate;
  }
  return tier;
}

/** The tier reached by this streak but not the previous one, if any. */
export function newlyReachedTier(streak: number, previous: number): FireTier | null {
  const now = fireFor(streak);
  const before = fireFor(previous);
  return now.from > before.from ? now : null;
}

/** Days remaining until the fire grows again; null at the top tier. */
export function daysToNextTier(streak: number): number | null {
  const next = FIRE_TIERS.find((tier) => tier.from > streak);
  return next ? next.from - streak : null;
}
