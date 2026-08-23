/**
 * Moments: the app noticing, out loud, when something real happened.
 *
 * Not achievements in the badge sense. There are no points, no tiers to
 * climb, nothing to collect for its own sake. Studying alone is lonely
 * mostly because nobody sees it, and this is the part that sees it.
 *
 * Three rules keep it from turning into noise:
 *
 *   1. At most one per session. Rarity is what makes it land.
 *   2. Specific, or nothing. "Great job!" is worse than silence — it is
 *      obviously automatic. "Chemistry used to be the one you'd skip"
 *      could only be said to this person about this day.
 *   3. Bad days count too. Only ever celebrating wins is how praise starts
 *      to feel fake; sitting through a rough round deserves more notice
 *      than an easy perfect score.
 */
import type { IconName } from '@/components/Icon';

import { newlyReachedTier } from './fire';

export interface MomentContext {
  now: number;
  /** 0–23, local. */
  hourOfDay: number;
  streak: number;
  /** Streak before this session finished. */
  previousStreak: number;
  /** Lifetime quizzes finished, including this one. */
  totalAttempts: number;
  /** Whole days since the previous quiz; null if this is the first ever. */
  daysSinceLastStudy: number | null;
  score: number;
  total: number;
  deckId: string;
  deckName: string;
  /** Subject mastery percentages either side of this session. */
  masteryBefore: number | null;
  masteryAfter: number | null;
  /** Questions that were weak going in and are not any more. */
  weakFixed: number;
  /** True when this session was one the student had planned. */
  keptPlan: boolean;
}

export interface Moment {
  id: string;
  title: string;
  body: string;
  icon: IconName;
  at: number;
}

const COUNT_MILESTONES = [10, 25, 50, 100, 250];

function dayIndex(timestamp: number): number {
  const date = new Date(timestamp);
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function clockOf(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Candidates in descending emotional weight. The first one that both
 * applies and has not been said before is the one that gets said.
 */
function candidates(ctx: MomentContext): Moment[] {
  const day = dayIndex(ctx.now);
  const pct = ctx.total === 0 ? 0 : (ctx.score / ctx.total) * 100;
  const out: Moment[] = [];

  if (ctx.totalAttempts === 1) {
    out.push({
      id: 'first',
      title: "That's one.",
      body: 'The first one is always the hardest to start. You started.',
      icon: 'sprout',
      at: ctx.now,
    });
  }

  if (ctx.daysSinceLastStudy != null && ctx.daysSinceLastStudy >= 3) {
    const days = ctx.daysSinceLastStudy;
    out.push({
      id: `comeback:${day}`,
      title: 'You came back.',
      body: `${days} days away, and here you are anyway. Coming back is the part most people skip.`,
      icon: 'heart',
      at: ctx.now,
    });
  }

  if (pct < 50 && ctx.total >= 4) {
    out.push({
      id: `rough:${day}`,
      title: 'That was a rough one.',
      body: `You sat through all ${ctx.total} of them anyway. On the bad days it's the sitting down that counts, not the score.`,
      icon: 'heart',
      at: ctx.now,
    });
  }

  if (
    ctx.masteryBefore != null &&
    ctx.masteryAfter != null &&
    ctx.masteryBefore < 40 &&
    ctx.masteryAfter >= 60
  ) {
    out.push({
      id: `turned:${ctx.deckId}`,
      title: `${ctx.deckName} turned a corner.`,
      body: "It used to be the one you'd rather skip. It isn't that any more.",
      icon: 'sprout',
      at: ctx.now,
    });
  }

  if (ctx.weakFixed > 0) {
    out.push({
      id: `weak:${day}`,
      title: 'You got them.',
      body: `${ctx.weakFixed} ${plural(ctx.weakFixed, 'question that kept', 'questions that kept')} catching you out — not any more.`,
      icon: 'check',
      at: ctx.now,
    });
  }

  if (ctx.keptPlan) {
    out.push({
      id: `plan:${day}`,
      title: 'You said you would.',
      body: `You planned this one, and you showed up for it at ${clockOf(ctx.now)}. That's a promise kept to yourself.`,
      icon: 'clock',
      at: ctx.now,
    });
  }

  const tier = newlyReachedTier(ctx.streak, ctx.previousStreak);
  if (tier && ctx.streak > 0) {
    out.push({
      id: `fire:${tier.from}`,
      title: tier.name,
      body: tier.greeting,
      icon: tier.icon,
      at: ctx.now,
    });
  }

  if (ctx.hourOfDay >= 23 || ctx.hourOfDay < 5) {
    out.push({
      id: `late:${day}`,
      title: "It's late.",
      body: "Still going at this hour. Finish this one, then get some rest — you've done enough today.",
      icon: 'heart',
      at: ctx.now,
    });
  }

  if (ctx.score === ctx.total && ctx.total >= 5) {
    out.push({
      id: `perfect:${ctx.deckId}:${day}`,
      title: 'Every single one.',
      body: `${ctx.total} out of ${ctx.total}. You knew all of it.`,
      icon: 'star',
      at: ctx.now,
    });
  }

  const milestone = COUNT_MILESTONES.find((n) => n === ctx.totalAttempts);
  if (milestone) {
    out.push({
      id: `count:${milestone}`,
      title: `${milestone} quizzes in.`,
      body: 'Nobody else sees this bit — small sessions, one after another. That is what it actually takes.',
      icon: 'heart',
      at: ctx.now,
    });
  }

  return out;
}

/**
 * The single thing worth saying about this session, or null when the
 * honest answer is nothing. Silence is a valid outcome and keeps the
 * moments that do appear worth reading.
 */
export function detectMoment(
  ctx: MomentContext,
  alreadySeen: readonly string[]
): Moment | null {
  const seen = new Set(alreadySeen);
  return candidates(ctx).find((moment) => !seen.has(moment.id)) ?? null;
}

/** Newest first, capped so the log cannot grow without bound. */
export const MOMENT_LOG_LIMIT = 60;

export function appendMoment(log: readonly Moment[], moment: Moment): Moment[] {
  return [moment, ...log].slice(0, MOMENT_LOG_LIMIT);
}
