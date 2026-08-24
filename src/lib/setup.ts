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
import { emptyCounts, FORMAT_ORDER, spreadCounts, totalOf, type ExamFormat } from './exam';
import { DEFAULT_MODE, MODES, type ExamMode } from './mode';

export interface ExamSetup {
  mode: ExamMode;
  /** The formats the student ticked. */
  picks: ExamFormat[];
  /** How many questions they asked for altogether. */
  target: number;
  /** True when the per-format amounts were typed by hand; `counts` then rules. */
  custom: boolean;
  counts: Record<ExamFormat, number>;
}

/** How long a first sitting on a subject is, before anyone has an opinion. */
export const FIRST_TARGET = 10;

const key = (deckId: string) => `exam_setup:${deckId}`;

/** A subject nobody has sat yet: a short multiple-choice paper. */
export function firstSetup(available: Record<ExamFormat, number>): ExamSetup {
  const opener =
    available.multiple_choice > 0
      ? 'multiple_choice'
      : FORMAT_ORDER.find((format) => available[format] > 0);
  const picks = opener ? [opener] : [];
  return {
    mode: DEFAULT_MODE,
    picks,
    target: FIRST_TARGET,
    custom: false,
    counts: spreadCounts(picks, FIRST_TARGET, available),
  };
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

  const mode: ExamMode = raw.mode && MODES[raw.mode] ? raw.mode : DEFAULT_MODE;
  const picks = FORMAT_ORDER.filter(
    (format) => raw.picks?.includes(format) && available[format] > 0
  );
  if (picks.length === 0) return null;

  if (raw.custom) {
    const counts = emptyCounts();
    for (const format of picks) {
      counts[format] = Math.min(whole(raw.counts?.[format]), available[format]);
    }
    const target = totalOf(counts);
    if (target === 0) return null;
    return {
      mode,
      picks: FORMAT_ORDER.filter((format) => counts[format] > 0),
      target,
      custom: true,
      counts,
    };
  }

  // Never fewer than one question per ticked format, however small the
  // remembered total was against however many types it was spread over.
  const target = Math.max(picks.length, whole(raw.target) || FIRST_TARGET);
  return { mode, picks, target, custom: false, counts: spreadCounts(picks, target, available) };
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
