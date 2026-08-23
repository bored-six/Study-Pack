/**
 * Exam modes.
 *
 * A mode is really three dials — clock, feedback, repetition — set at once.
 * They are deliberately not exposed separately: six named presets read as a
 * game, three toggles read as a settings form, and nobody plays a settings
 * form. Everything here is pure so the rules can be tested without a screen.
 */

import type { IconName } from '@/components/Icon';

import { availability, type ExamFormat, type ExamItem, type ExamRequest } from './exam';
import { byQuestion, type AnswerRecord } from './mastery';
import { weightFor } from './pick';
import type { Question } from './types';

export type ExamMode =
  | 'relaxed'
  | 'mastery'
  | 'rapid'
  | 'simulation'
  | 'weak_spots'
  | 'survival';

/** Nothing, one timer for the whole paper, or a timer per question. */
export type Clock = 'none' | 'whole' | 'per_question';

/** Right/wrong as you go, or the whole paper back at the end. */
export type Feedback = 'instant' | 'deferred';

/** One pass, repeat until each item is retired, or go until you run out. */
export type Repetition = 'once' | 'until_retired' | 'until_out';

export interface ModeSpec {
  id: ExamMode;
  name: string;
  /** The deal, in one line. */
  tagline: string;
  icon: IconName;
  wash: string;
  ink: string;
  clock: Clock;
  feedback: Feedback;
  repetition: Repetition;
  /** The mode picks its own questions, so the format form is skipped. */
  autoBuild: boolean;
}

export const MODES: Record<ExamMode, ModeSpec> = {
  relaxed: {
    id: 'relaxed',
    name: 'Take your time',
    tagline: 'No clock. Answer, see how you did, move on.',
    icon: 'leaf',
    wash: '#DDF3DC',
    ink: '#2C8A4A',
    clock: 'none',
    feedback: 'instant',
    repetition: 'once',
    autoBuild: false,
  },
  mastery: {
    id: 'mastery',
    name: 'Mastery',
    tagline: "Miss one and it comes back. Get it right twice and it's gone.",
    icon: 'sprout',
    wash: '#CFEBBD',
    ink: '#4E7B2C',
    clock: 'none',
    feedback: 'instant',
    repetition: 'until_retired',
    autoBuild: false,
  },
  rapid: {
    id: 'rapid',
    name: 'Beat the clock',
    tagline: 'Seconds per question. Run out and it counts as missed.',
    icon: 'bolt',
    wash: '#FCEBC0',
    ink: '#A0731A',
    clock: 'per_question',
    feedback: 'instant',
    repetition: 'once',
    autoBuild: false,
  },
  simulation: {
    id: 'simulation',
    name: 'Exam simulation',
    tagline: 'One timer for the whole paper. No answers until you submit.',
    icon: 'note',
    wash: '#DBEEFB',
    ink: '#2E6FA3',
    clock: 'whole',
    feedback: 'deferred',
    repetition: 'once',
    autoBuild: false,
  },
  weak_spots: {
    id: 'weak_spots',
    name: 'Weak spots',
    tagline: 'Only the ones you keep getting wrong.',
    icon: 'alert',
    wash: '#FBD5CC',
    ink: '#B24A38',
    clock: 'none',
    feedback: 'instant',
    repetition: 'once',
    autoBuild: true,
  },
  survival: {
    id: 'survival',
    name: 'Survival',
    tagline: "Questions keep coming. Three misses and it's over.",
    icon: 'heart',
    wash: '#F7CFD3',
    ink: '#A94050',
    clock: 'none',
    feedback: 'instant',
    repetition: 'until_out',
    autoBuild: true,
  },
};

/** Order shown in the picker — gentlest first, hardest last. */
export const MODE_ORDER: ExamMode[] = [
  'relaxed',
  'mastery',
  'weak_spots',
  'rapid',
  'simulation',
  'survival',
];

export const DEFAULT_MODE: ExamMode = 'relaxed';

// --- clocks -------------------------------------------------------------

/**
 * Seconds a format gets under a per-question clock. Tuned to be tight but
 * fair: enough to read and answer, not enough to look anything up.
 */
export const RAPID_SECONDS: Record<ExamFormat, number> = {
  multiple_choice: 15,
  true_false: 10,
  modified_true_false: 35,
  identification: 20,
  fill_blank: 20,
  matching: 50,
  enumeration: 50,
};

export function questionSeconds(format: ExamFormat): number {
  return RAPID_SECONDS[format];
}

/** A whole paper gets the sprint allowance doubled: exam pace, not sprint pace. */
export const PAPER_GENEROSITY = 2;

export function paperSeconds(items: readonly ExamItem[]): number {
  const total = items.reduce((sum, item) => sum + RAPID_SECONDS[item.format], 0);
  return Math.max(60, total * PAPER_GENEROSITY);
}

// --- mastery queue ------------------------------------------------------

export interface QueueEntry {
  itemId: string;
  /** Consecutive correct answers since the last miss. */
  streak: number;
}

/** Right twice in a row and it leaves the pile — once could be a lucky guess. */
export const RETIRE_AT = 2;

/** A missed item comes back soon, a half-learned one comes back later. */
const GAP_AFTER_MISS = 2;
const GAP_AFTER_FIRST = 5;

export function startQueue(items: readonly ExamItem[]): QueueEntry[] {
  return items.map((item) => ({ itemId: item.id, streak: 0 }));
}

/**
 * Retires or reinserts the item at the head of the pile.
 *
 * The gap is the whole point: dropping a miss straight back in front of you
 * tests short-term memory, and dropping it at the very end means you have
 * forgotten it again by the time it arrives.
 */
export function advanceQueue(queue: readonly QueueEntry[], correct: boolean): QueueEntry[] {
  const [head, ...rest] = queue;
  if (!head) return [];

  const streak = correct ? head.streak + 1 : 0;
  if (streak >= RETIRE_AT) return rest;

  const gap = correct ? GAP_AFTER_FIRST : GAP_AFTER_MISS;
  const at = Math.min(gap, rest.length);
  return [...rest.slice(0, at), { itemId: head.itemId, streak }, ...rest.slice(at)];
}

// --- survival -----------------------------------------------------------

export const SURVIVAL_STRIKES = 3;

/** Every item the deck can produce, for modes that want maximum variety. */
export function fullRequests(questions: readonly Question[]): ExamRequest[] {
  const counts = availability([...questions]);
  return (Object.keys(counts) as ExamFormat[])
    .filter((format) => counts[format] > 0)
    .map((format) => ({ format, count: counts[format] }));
}

// --- weak spots ---------------------------------------------------------

export const WEAK_SPOT_LIMIT = 15;

/**
 * The questions most worth drilling, worst first.
 *
 * Same notion of need as an ordinary session — `weightFor` already knows
 * that a question just missed beats one never tried, which beats one you
 * know cold. The difference is the ordering: a session samples by weight so
 * it stays varied, while this mode was chosen precisely to be punishing, so
 * it sorts. Ties keep deck order, which makes the drill reproducible.
 */
export function weakestQuestions(
  questions: readonly Question[],
  answers: readonly AnswerRecord[],
  limit = WEAK_SPOT_LIMIT,
  now = Date.now()
): Question[] {
  const grouped = byQuestion(answers);
  return [...questions]
    .map((question) => ({
      question,
      weight: weightFor(grouped.get(question.id) ?? [], now),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((entry) => entry.question);
}
