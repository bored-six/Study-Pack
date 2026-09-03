/**
 * Which of Nib's questions he ought to admit he is unsure about.
 *
 * The review screen used to ask a student to read all eighteen, which nobody
 * does properly — eighteen near-identical cards is a wall, and a wall gets
 * scrolled past. So the screen leads with a verdict instead, and this is what
 * produces it.
 *
 * Every rule here is decided from the question and the line it came from.
 * Nothing asks the model anything: a second opinion from the thing that made
 * the mistake is not a check, and it would cost a student pages to run.
 *
 * These are suspicions, never verdicts. A flagged question is still saved
 * unless the student bins it — the flag only decides what gets read first.
 */
import type { ParsedQuestion } from './noteParser';

export type FlagReason =
  | 'decoy_also_true'
  | 'twin_options'
  | 'short_list'
  | 'thin_source'
  | 'long_answer';

export interface Flag {
  reason: FlagReason;
  /** What he says about it, in his own voice. Shown on the card. */
  says: string;
  /** The option to point at, when the flag is about one. */
  culprit?: string;
}

/**
 * How badly each one misleads, worst first.
 *
 * The top three make a question unanswerable or wrong. The bottom two only
 * make it weak — a real question that is harder than it should be. The
 * screen reads this to decide what a student meets first, because in a pile
 * of five the order is most of the value.
 */
const SEVERITY: Record<FlagReason, number> = {
  decoy_also_true: 0,
  twin_options: 1,
  short_list: 2,
  thin_source: 3,
  long_answer: 4,
};

/** Lower is worse. For sorting a pile of flagged questions. */
export function severityOf(flag: Flag): number {
  return SEVERITY[flag.reason];
}

/**
 * A source line this short was padded rather than tested.
 *
 * Eight words is where the parser's own examples stop reading like facts:
 * "Osmosis is the movement of water" is seven and already thin.
 */
const THIN_WORDS = 8;

/** Under three items, a list is a fragment of the real list. */
const SHORTEST_LIST = 3;

/** How alike two options may be before one of them is redundant. */
const TWIN_RATIO = 0.82;

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Lower-cased, punctuation-stripped, single-spaced — for comparing meaning. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein, two rows rather than a full matrix. Options are short. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** 1 when identical, 0 when nothing in common. */
function likeness(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - distance(a, b) / longest;
}

/**
 * Every correct answer in the batch, mapped to the question that owns it.
 *
 * This is the one rule needing the whole draft rather than one question.
 *
 * It is deliberately narrow, and the first version was not: it flagged any
 * decoy that was a true answer somewhere in the notes, which on real notes
 * flagged 85% of a batch. That is because borrowing other answers is how
 * options get built at all — both the offline parser and Nib have nothing
 * else to draw from. A decoy being true *elsewhere* is what makes it a
 * plausible decoy, not what makes it broken.
 *
 * It is only broken when the other question is effectively this question,
 * so its answer would be correct here too. That needs the prompts to match,
 * not just the strings.
 */
function truthsIn(all: ParsedQuestion[]): Map<string, number> {
  const truths = new Map<string, number>();
  all.forEach((q, i) => {
    const key = normalise(q.correctAnswer);
    if (key.length > 0 && !truths.has(key)) truths.set(key, i);
  });
  return truths;
}

/**
 * How alike two prompts must be before they are asking the same thing.
 *
 * Below this they are different questions, and sharing an answer between
 * them is ordinary. At or above it, one question's answer is the other's,
 * and offering it as wrong makes the question unanswerable.
 */
const SAME_QUESTION = 0.75;

/**
 * The one thing worth saying about this question, or nothing.
 *
 * Ordered by how badly it misleads. A decoy that is true makes the question
 * unanswerable; an answer that runs long is only awkward. One flag per card,
 * because a card wearing three warnings is a card nobody reads.
 */
export function flagFor(
  question: ParsedQuestion,
  index: number,
  all: ParsedQuestion[],
  truths: Map<string, number> = truthsIn(all)
): Flag | null {
  // A question the student wrote themselves is theirs. He does not get to
  // second-guess it, and he did not make it.
  if (question.sourceLine == null) return null;

  const right = normalise(question.correctAnswer);
  const listed = question.kind === 'enumeration';

  if (!listed) {
    const asked = normalise(question.prompt);
    for (const answer of question.answers) {
      const decoy = normalise(answer);
      if (decoy === right || decoy.length === 0) continue;
      const owner = truths.get(decoy);
      if (owner == null || owner === index) continue;
      // The decoy belongs to another question. Only a problem when that
      // question is asking the same thing this one is.
      if (likeness(asked, normalise(all[owner].prompt)) >= SAME_QUESTION) {
        return {
          reason: 'decoy_also_true',
          says: 'One of my wrong answers is also true here. Sorry.',
          culprit: answer,
        };
      }
    }
  }

  for (let i = 0; i < question.answers.length; i += 1) {
    for (let j = i + 1; j < question.answers.length; j += 1) {
      const a = normalise(question.answers[i]);
      const b = normalise(question.answers[j]);
      if (a.length === 0 || b.length === 0) continue;
      if (likeness(a, b) >= TWIN_RATIO) {
        return {
          reason: 'twin_options',
          says: 'Two of these say nearly the same thing.',
          culprit: question.answers[j],
        };
      }
    }
  }

  if (listed && question.answers.length < SHORTEST_LIST) {
    return {
      reason: 'short_list',
      says: 'Your notes only gave me two of these. There might be more.',
    };
  }

  if (words(question.sourceLine) < THIN_WORDS) {
    return {
      reason: 'thin_source',
      says: 'I built this off one short line. It might be thin.',
    };
  }

  // A list is marked on completeness, so a long one is correct, not unfair.
  if (!listed && words(question.correctAnswer) > words(question.prompt)) {
    return {
      reason: 'long_answer',
      says: 'This answer is a whole sentence. Bit unfair to remember.',
    };
  }

  return null;
}

/** The same, for a whole draft. Positions line up with the draft's. */
export function flagsFor(all: ParsedQuestion[]): (Flag | null)[] {
  const truths = truthsIn(all);
  return all.map((q, i) => flagFor(q, i, all, truths));
}
