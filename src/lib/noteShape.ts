/**
 * A cheap read of what a block of notes looks like, for the paste box.
 *
 * The real parser is the only thing that decides what becomes a question,
 * and it is far too heavy to run on every keystroke. This is the shape of
 * the text rather than its meaning: how many lines are there, and how many
 * of them are even the right sort of line to ask about. It agrees with the
 * parser on the gates that are cheap to check — length, illustrations,
 * headings — and stays quiet about everything else.
 *
 * It exists because the old screen said nothing at all until you pressed
 * the button, and then said "no questions yet" — the one moment when the
 * advice is useless, because the notes are already pasted.
 */

import { ABBREVIATION, LIMITS } from './noteParser';
import { looksLikeIllustration, readsAsStatement } from './quizzable';

export interface NoteShape {
  /** Non-blank lines. */
  lines: number;
  /** Lines that look like something could be asked about them. */
  usable: number;
  /** Lines too short to carry a fact. */
  tooShort: number;
  /** Lines long enough to make an unreadable question on a phone. */
  tooLong: number;
  /** "For example: ..." — shows rather than tells, so nothing to ask. */
  illustrations: number;
  /** Lines shaped "Term: meaning", the format that parses best. */
  definitions: number;
}

const EMPTY: NoteShape = {
  lines: 0,
  usable: 0,
  tooShort: 0,
  tooLong: 0,
  illustrations: 0,
  definitions: 0,
};

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * A "Term: meaning" line. The term has to be short — a colon deep inside a
 * long sentence is punctuation, not a definition.
 */
const MAX_TERM_WORDS = 6;

export function looksLikeDefinition(line: string): boolean {
  // "ATP stands for adenosine triphosphate" is a definition without a colon,
  // and the parser builds a question from it, so the box has to see it too.
  if (ABBREVIATION.test(line)) return true;

  const at = line.indexOf(':');
  if (at <= 0 || at === line.length - 1) return false;
  const term = line.slice(0, at).trim();
  const meaning = line.slice(at + 1).trim();
  return (
    term.length > 0 &&
    words(term) <= MAX_TERM_WORDS &&
    words(meaning) >= 2
  );
}

export function readShape(raw: string): NoteShape {
  if (!raw.trim()) return EMPTY;

  const shape: NoteShape = { ...EMPTY };
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    shape.lines += 1;

    if (looksLikeIllustration(line)) {
      shape.illustrations += 1;
      continue;
    }

    const count = words(line);
    if (count < LIMITS.minWordsPerLine) {
      shape.tooShort += 1;
      continue;
    }
    if (count > LIMITS.maxSentenceWords) {
      shape.tooLong += 1;
      continue;
    }

    const definition = looksLikeDefinition(line);
    if (definition) shape.definitions += 1;
    if (definition || readsAsStatement(line)) shape.usable += 1;
  }

  return shape;
}

/**
 * One line of advice about the paste box, or null when there is nothing
 * worth saying. Ordered by what would actually help most: an empty box
 * needs an example, a box of headings needs full sentences.
 */
/**
 * Whether to offer a reading before any scan has run.
 *
 * Narrow on purpose. The first version of this offered whenever fewer than
 * half the lines looked usable, on the assumption that the parser is poor at
 * paragraphs. Measured, it is not: five prose lines with no definition in them
 * still produced three questions by cloze deletion. A shape read also counts
 * a prose sentence as usable, so it cannot see the `no_options` failure that
 * comes later — it is optimistic exactly where the guess would need to be
 * careful, and a wrong guess spends an allowance on questions Scan gives free.
 *
 * `usable === 0` is the one case it calls reliably, and it is the same case
 * the advice below currently answers by telling a student to rewrite their
 * notes as "Term: meaning" — the app asking the student to do its job.
 *
 * Everything softer than this belongs to the review screen, which offers
 * against the real parse instead of a prediction about it.
 */
export function shapeNeedsReader(shape: NoteShape): boolean {
  return shape.lines >= 2 && shape.usable === 0;
}

export function shapeAdvice(shape: NoteShape): string | null {
  if (shape.lines === 0) return null;
  if (shape.usable === 0) {
    return shape.tooShort > 0
      ? 'These lines are very short. A few more words each gives us something to ask about.'
      : 'Try writing these as "Term: meaning", or as full sentences.';
  }
  if (shape.tooLong > shape.usable) {
    return 'Long sentences make unreadable questions — try splitting them up.';
  }
  if (shape.illustrations > 0 && shape.illustrations >= shape.usable) {
    return 'Examples show rather than tell, so there is nothing in them to be right about.';
  }
  return null;
}
