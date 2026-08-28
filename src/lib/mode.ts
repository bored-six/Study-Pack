/**
 * Exam modes.
 *
 * A mode is really three dials — clock, feedback, repetition — set at once.
 * They are deliberately not exposed separately: six named presets read as a
 * game, three toggles read as a settings form, and nobody plays a settings
 * form. Everything here is pure so the rules can be tested without a screen.
 */

import type { IconName } from '@/components/Icon';
// Type-only, so the pure rules here never pull the audio stack into a test.
import type { SfxName } from './sfx';

import { availability, type ExamFormat, type ExamItem, type ExamRequest } from './exam';
import type { Question } from './types';

export type ExamMode =
  | 'relaxed'
  | 'mastery'
  | 'rapid'
  | 'simulation'
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

  // --- identity ---------------------------------------------------------
  // Everything below is how the mode looks and talks. It lives beside the
  // rules rather than in the screens because three screens render it and
  // they were drifting: the build screen said "Start exam" for a mode whose
  // paper never ends, and the run screen called a survival draw a "page".

  /** A deeper ink for borders and rules — `ink` is for text and glyphs. */
  edge: string;
  /** The stationery the stage is printed on. */
  paper: PaperStock;
  /** What one item is, in this mode's language. Singular. */
  unit: string;
  /** Plural of `unit`, because "pages" and "lives" don't share a rule. */
  units: string;
  /** The word on the button that begins the sitting. */
  verb: string;
  /** Stamped on the stage corner, so a screenshot says which game it was. */
  stamp: string;
  /** What "how many of each" buys you here. */
  countsHint: string;
  /** Which progress readout the run screen puts in the header. */
  hud: HudKind;
  /** Heading on the card at the end — a survival run is not a report card. */
  reportTitle: string;
  /** How the sitting closes, before the card arrives. */
  outro: OutroKind;
  /**
   * The note under the clunk as this cartridge seats.
   *
   * Every mode played the same click, which made the one animation that
   * exists to tell five games apart sound like one game.
   */
  loadSfx: SfxName;
}

/**
 * The last beat of a sitting.
 *
 * Every mode used to end the same way — the page tears upward and the
 * report card slides in — which made clearing a mastery pile feel exactly
 * like running out of lives. The ending is the most emotional half-second
 * in the app and it was the one part that did not know which game it was.
 */
export type OutroKind =
  /** The page tears off the pad. */
  | 'tear'
  /** The last card lifts off, and the pile is gone. */
  | 'pile'
  /** The fuse reaches the end. */
  | 'burnout'
  /** The paper is sealed and stamped. */
  | 'seal'
  /** The last heart breaks. */
  | 'lastheart';

/** The stage's stationery — what the paper under the question looks like. */
export type PaperStock = 'ruled' | 'grid' | 'ticket' | 'foolscap' | 'card';

/** The shape of the run screen's progress readout. */
export type HudKind = 'pages' | 'pile' | 'fuse' | 'paper' | 'lives';

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
    edge: '#38A75F',
    paper: 'ruled',
    unit: 'page',
    units: 'pages',
    verb: 'Start',
    stamp: 'NO CLOCK',
    countsHint: 'How many pages you sit, once each.',
    hud: 'pages',
    reportTitle: 'REPORT CARD',
    outro: 'tear',
    loadSfx: 'album_open',
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
    edge: '#4E7B2C',
    paper: 'card',
    unit: 'card',
    units: 'cards',
    verb: 'Build the pile',
    stamp: 'UNTIL IT STICKS',
    countsHint: 'How many go in the pile. Each one comes back until it sticks.',
    hud: 'pile',
    reportTitle: 'THE PILE',
    outro: 'pile',
    loadSfx: 'sticker_peel',
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
    edge: '#A0731A',
    paper: 'ticket',
    unit: 'ticket',
    units: 'tickets',
    verb: 'Light the fuse',
    stamp: 'ON THE CLOCK',
    countsHint: 'How many tickets. Each one has its own countdown.',
    hud: 'fuse',
    reportTitle: 'TIME SHEET',
    outro: 'burnout',
    loadSfx: 'tick',
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
    edge: '#2E6FA3',
    paper: 'foolscap',
    unit: 'question',
    units: 'questions',
    verb: 'Sit the paper',
    stamp: 'SEALED',
    countsHint: 'How long the paper is. You can go back and change answers.',
    hud: 'paper',
    reportTitle: 'MARKED PAPER',
    outro: 'seal',
    loadSfx: 'stamp',
    autoBuild: false,
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
    edge: '#A94050',
    paper: 'grid',
    unit: 'round',
    units: 'rounds',
    verb: 'Take the first hit',
    stamp: 'THREE LIVES',
    countsHint: 'Survival deals its own questions — nothing to choose.',
    hud: 'lives',
    reportTitle: 'HOW FAR YOU GOT',
    outro: 'lastheart',
    loadSfx: 'bell',
    autoBuild: true,
  },
};

/** Order shown in the picker — gentlest first, hardest last. */
export const MODE_ORDER: ExamMode[] = [
  'relaxed',
  'mastery',
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

// --- how long a sitting takes -------------------------------------------

/**
 * An unhurried answer, in seconds. The old build screen assumed this for
 * every mode and told a Beat-the-clock student "about 10 min" for a paper
 * the clock caps at two and a half — the estimate has to know the mode.
 */
export const UNHURRIED_SECONDS = 30;

/**
 * A perfect mastery run sees each card exactly RETIRE_AT times; a real one
 * misses some. Measured against runs of the queue rather than guessed.
 */
export const MASTERY_PASSES = 2.4;

/**
 * Roughly how long a paper of these counts takes in this mode.
 *
 * Null means "there is no answer": survival deals until you run out of
 * lives, and a number there would be a promise the mode cannot keep.
 */
export function estimateSeconds(
  mode: ExamMode,
  counts: Readonly<Partial<Record<ExamFormat, number>>>
): number | null {
  const formats = Object.keys(counts) as ExamFormat[];
  const questions = formats.reduce((sum, format) => sum + (counts[format] ?? 0), 0);
  if (questions === 0) return MODES[mode].repetition === 'until_out' ? null : 0;

  // What the per-question clock would allow, format by format.
  const clocked = formats.reduce(
    (sum, format) => sum + RAPID_SECONDS[format] * (counts[format] ?? 0),
    0
  );

  switch (MODES[mode].id) {
    case 'rapid':
      return clocked;
    case 'simulation':
      return Math.max(60, clocked * PAPER_GENEROSITY);
    case 'mastery':
      return Math.round(questions * UNHURRIED_SECONDS * MASTERY_PASSES);
    case 'survival':
      return null;
    default:
      return questions * UNHURRIED_SECONDS;
  }
}

/** "about 4 min", "about 40 sec", or null when the mode has no end. */
export function estimateLabel(
  mode: ExamMode,
  counts: Readonly<Partial<Record<ExamFormat, number>>>
): string | null {
  const seconds = estimateSeconds(mode, counts);
  if (seconds == null) return null;
  if (seconds === 0) return null;
  if (seconds < 90) return `about ${Math.max(10, Math.round(seconds / 10) * 10)} sec`;
  return `about ${Math.round(seconds / 60)} min`;
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
