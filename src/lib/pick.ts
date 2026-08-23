/**
 * Question picking: which questions a session should actually contain.
 *
 * Before this, every quiz served the whole deck in stored order — the same
 * questions in the same sequence forever, so the ones already known ate the
 * same time as the ones that never stick.
 *
 * The fix is the useful half of spaced repetition without its machinery:
 * weight each question by how badly it needs the practice, then sample.
 * Weighting rather than sorting matters — a strict weakest-first order turns
 * a quiz into the same punishing five questions every time, and a solid
 * question still deserves the occasional pass to prove it is still solid.
 *
 * Pure functions, no I/O. `random` is injected so tests are deterministic.
 */

import { questionMastery, byQuestion, type AnswerRecord } from './mastery';

/** Anything with an id can be picked; the quiz passes Questions. */
export interface Pickable {
  id: string;
}

/** Longest session we will ever serve, however big the deck grows. */
export const MAX_SESSION = 20;

/**
 * Floor weight for a perfectly known question. Never zero — everything stays
 * in the pool, or a question answered right twice would vanish forever and
 * the fade in mastery could never catch it slipping.
 */
const FLOOR_WEIGHT = 0.15;

/**
 * A question never answered even once. Ranked above every shaky one — you
 * cannot revise what you have not yet met, and new notes should show up
 * promptly — but below one just got wrong, which is the most urgent thing
 * there is.
 */
const UNSEEN_WEIGHT = 1.4;

/** Multiplier for a question whose most recent answer was wrong. */
const MISSED_LAST_BOOST = 1.5;

/**
 * How much a question wants to be asked. Higher is more urgent.
 * Range is FLOOR_WEIGHT (known cold) to UNSEEN_WEIGHT (never seen).
 */
export function weightFor(
  history: readonly AnswerRecord[],
  now = Date.now()
): number {
  const mastery = questionMastery(history, now);
  if (mastery.attempts === 0) return UNSEEN_WEIGHT;

  const weight = FLOOR_WEIGHT + (1 - mastery.score);
  return mastery.missedLast ? weight * MISSED_LAST_BOOST : weight;
}

export interface PickOptions {
  now?: number;
  /** Injectable so a seeded exam rebuilds identically. */
  random?: () => number;
}

/**
 * Every question, neediest first — a weighted shuffle rather than a sort.
 *
 * Uses Efraimidis–Spirakis keys: each item gets random^(1/weight), and a
 * heavier weight pushes that key towards 1. So a weak question usually leads
 * without ever being guaranteed to, which is what keeps a session varied
 * instead of drilling the same five items forever.
 *
 * Ranking the whole list rather than truncating it lets a caller that fills
 * several buckets — the exam builder, picking per format — walk one ordering
 * and still take the neediest questions for each.
 */
export function rankByNeed<T extends Pickable>(
  questions: readonly T[],
  answers: readonly AnswerRecord[],
  options: PickOptions = {}
): T[] {
  const { now = Date.now(), random = Math.random } = options;
  const grouped = byQuestion(answers);

  return questions
    .map((question) => {
      const weight = weightFor(grouped.get(question.id) ?? [], now);
      // random() can return exactly 0, and 0^(1/w) is 0 for every weight —
      // which would sort those items arbitrarily. Nudging keeps keys distinct.
      const roll = Math.max(random(), Number.MIN_VALUE);
      return { question, key: Math.pow(roll, 1 / weight) };
    })
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.question);
}

/** The first `size` of the ranking: one session's worth. */
export function pickQuestions<T extends Pickable>(
  questions: readonly T[],
  answers: readonly AnswerRecord[],
  options: PickOptions & { size?: number } = {}
): T[] {
  const { size = MAX_SESSION, ...rest } = options;
  const limit = Math.min(Math.max(0, size), questions.length);
  if (limit === 0) return [];
  return rankByNeed(questions, answers, rest).slice(0, limit);
}
