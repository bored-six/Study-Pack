/**
 * Remembering how a subject was last sat.
 *
 * The build step used to open the same way every time — ten multiple choice —
 * so a student who always sits true/false had to zero the multiple choice
 * before they could ask for anything else. What they started last time is a
 * far better guess than a constant, and it costs one settings row.
 *
 * The trimming matters as much as the remembering: notes get edited between
 * sittings, so a remembered paper is cut down to what the questions can still
 * produce, and falls back to a first sitting when nothing survives.
 */

import { readSetting, writeSetting } from './db';
import { emptyCounts, FORMAT_ORDER, totalOf, type ExamFormat } from './exam';
import { DEFAULT_MODE, MODES, type ExamMode } from './mode';

export interface ExamSetup {
  mode: ExamMode;
  /** How many of each format. A format at zero is one the student left off. */
  counts: Record<ExamFormat, number>;
}

/** What a format is worth when it's first ticked, or on a first sitting. */
export const DEFAULT_PER_TYPE = 10;

const key = (deckId: string) => `exam_setup:${deckId}`;

/** The formats with questions in them, in the order they're shown. */
export function picksIn(counts: Record<ExamFormat, number>): ExamFormat[] {
  return FORMAT_ORDER.filter((format) => counts[format] > 0);
}

/** A subject nobody has sat yet: a short multiple-choice paper. */
export function firstSetup(available: Record<ExamFormat, number>): ExamSetup {
  const opener =
    available.multiple_choice > 0
      ? 'multiple_choice'
      : FORMAT_ORDER.find((format) => available[format] > 0);
  const counts = emptyCounts();
  if (opener) counts[opener] = Math.min(DEFAULT_PER_TYPE, available[opener]);
  return { mode: DEFAULT_MODE, counts };
}

function whole(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * The remembered setup, cut down to what the notes can still produce.
 *
 * Returns null when nothing usable survives — a subject whose matching
 * questions have all been deleted should open on a fresh paper, not on an
 * empty one the student has to work out how to fill.
 */
export function trimSetup(
  saved: unknown,
  available: Record<ExamFormat, number>
): ExamSetup | null {
  if (!saved || typeof saved !== 'object') return null;
  const raw = saved as Partial<ExamSetup>;

  const counts = emptyCounts();
  for (const format of FORMAT_ORDER) {
    counts[format] = Math.min(whole(raw.counts?.[format]), available[format]);
  }
  if (totalOf(counts) === 0) return null;

  return { mode: raw.mode && MODES[raw.mode] ? raw.mode : DEFAULT_MODE, counts };
}

/** The raw remembered setup, or null. Trimming is the caller's job. */
export async function readSavedSetup(deckId: string): Promise<unknown | null> {
  try {
    const raw = await readSetting(key(deckId));
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    // A setup we can't read is no reason to refuse the exam.
    return null;
  }
}

export async function saveSetup(deckId: string, setup: ExamSetup): Promise<void> {
  try {
    await writeSetting(key(deckId), JSON.stringify(setup));
  } catch {
    // Forgetting is survivable; failing to start the exam is not.
  }
}
