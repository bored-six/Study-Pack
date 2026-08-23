/**
 * The streak fire. A number alone says little; a fire that visibly grows
 * says "this has been going a while" at a glance — and gives the streak
 * somewhere to go beyond incrementing.
 *
 * Nine stages, maxing out at a full year. Tier names are deliberately
 * warm rather than gamey: nobody is ranking up, their fire is just
 * getting bigger.
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
    from: 5,
    name: 'Ember',
    icon: 'flameSmall',
    color: colors.gold,
    greeting: 'Five days in. It glows on its own now.',
  },
  {
    from: 10,
    name: 'Kindling',
    icon: 'flame',
    color: '#D9832B',
    greeting: 'Ten days. The fire has properly caught.',
  },
  {
    from: 20,
    name: 'Steady burn',
    icon: 'flameBig',
    color: colors.coral,
    greeting: 'Twenty days. This is a habit, not an effort.',
  },
  {
    from: 50,
    name: 'Wildfire',
    icon: 'flameTall',
    color: '#A2322A',
    greeting: 'Fifty days. It spreads to everything you touch.',
  },
  {
    from: 100,
    name: 'Blue flame',
    icon: 'flameTall',
    color: '#2E6FA3',
    greeting: 'A hundred days. The fire went blue — that is the hottest part.',
  },
  {
    from: 200,
    name: 'White heat',
    icon: 'flameCrown',
    color: '#7E8CA0',
    greeting: 'Two hundred days. Hotter than any color now.',
  },
  {
    from: 300,
    name: 'Violet crown',
    icon: 'flameCrown',
    color: '#6C51A8',
    greeting: 'Three hundred days. Fire like this gets its own name in old stories.',
  },
  {
    from: 365,
    name: 'The eternal year',
    icon: 'flameYear',
    color: '#AC761C',
    greeting:
      'Three hundred and sixty-five. A whole year, every single day. This fire does not go out.',
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
