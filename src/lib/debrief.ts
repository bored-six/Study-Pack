/**
 * The debrief: the note a good marker writes at the bottom of a paper.
 *
 * A score says how much went wrong. It never says *what* went wrong, and a
 * student staring at 11/20 has no idea whether that was four blanks, three
 * misspellings and a bad run at the end, or eleven things they simply do
 * not know yet — which are four completely different evenings of work.
 *
 * So this reads the sitting back three ways:
 *
 *   - how the marks were lost (blank, spelling, half a list, the clock),
 *   - what held up and what did not, by format and against past sittings,
 *   - the one thing worth doing next.
 *
 * Same rules as moments: specific or silent. Every line here has to be
 * something only this paper could have said. Nothing is invented to fill a
 * section — an empty section is the honest answer and the screen hides it.
 *
 * Pure functions over plain data, so the whole read is testable without a
 * screen, a database, or a sitting.
 */

import { hasAnswer, type DraftValue } from './draft';
import { FORMAT_LABEL, type ExamFormat, type ExamItem } from './exam';
import { checkAnswer, checkEnumeration } from './grade';
import { byQuestion, questionMastery, type AnswerRecord } from './mastery';
import { MODES, type ExamMode } from './mode';

// --- how a mark was lost ------------------------------------------------

/**
 * The shape of a wrong answer. Recorded when the answer is given, because
 * by the end of a mastery sitting the same question has been answered
 * again and the draft that lost the mark is long gone.
 */
export type SlipKind =
  /** Nothing written down at all. */
  | 'blank'
  /** The clock took it. */
  | 'timeout'
  /** Right answer, wrong letters. */
  | 'spelling'
  /** Some of a list or some of the pairs, not all. */
  | 'partial'
  /** Caught that the statement was false, but not the word that made it. */
  | 'halfway'
  /** A straight miss — a gap, not a slip. */
  | 'wrong';

/**
 * Reads a wrong answer and says how it was wrong. Only ever called for
 * misses; a correct answer has nothing to classify.
 */
export function classifyMiss(
  item: ExamItem,
  draft: DraftValue | null,
  timedOut = false
): SlipKind {
  if (timedOut) return 'timeout';
  if (!hasAnswer(item, draft) || !draft) return 'blank';

  switch (item.format) {
    case 'identification':
    case 'fill_blank':
      return draft.kind === 'typed' && checkAnswer(draft.text, item.correctAnswer).nearMiss
        ? 'spelling'
        : 'wrong';

    case 'modified_true_false': {
      if (draft.kind !== 'mtf') return 'wrong';
      // Calling a false statement false is the hard half of this format.
      // Getting that right and the word wrong is not the same mistake as
      // reading the whole thing as true.
      if (item.isTrue || draft.saidTrue !== false) return 'wrong';
      if (draft.wordIndex !== item.falseWordIndex) return 'halfway';
      return checkAnswer(draft.typed, item.correctWord).nearMiss ? 'spelling' : 'halfway';
    }

    case 'enumeration': {
      if (draft.kind !== 'enum') return 'wrong';
      const check = checkEnumeration(draft.entries, item.items, item.ordered);
      return check.matchedCount > 0 ? 'partial' : 'wrong';
    }

    case 'matching': {
      if (draft.kind !== 'matching') return 'wrong';
      const right = item.terms.filter((_, i) => draft.pairs[i] === item.correctIndexFor[i]);
      return right.length > 0 ? 'partial' : 'wrong';
    }

    default:
      return 'wrong';
  }
}

// --- the debrief --------------------------------------------------------

/** One line of the note. */
export interface DebriefNote {
  id: string;
  text: string;
  /** Ranks it against the other candidates for the same line. */
  weight: number;
}

/** What the button under "do this next" should start. */
export type NextAction = 'format' | 'relaxed' | 'none';

export interface NextStep {
  title: string;
  body: string;
  action: NextAction;
  /** The format a `format` action should drill, when that is the advice. */
  format: ExamFormat | null;
  actionLabel: string | null;
}

/**
 * One line each, and often none.
 *
 * An earlier version said everything it could prove — three lines a section,
 * nine in all — and the whole thing stopped being read. A student finishing
 * a paper will read one line about what went wrong, one about what didn't,
 * and one instruction. So each section keeps only its strongest line.
 */
export interface Debrief {
  /** The line at the top. Earned, never a participation trophy. */
  headline: string;
  /** How the marks were lost. */
  wrong: DebriefNote[];
  /** What held up. */
  strengths: DebriefNote[];
  /** What did not. */
  weaknesses: DebriefNote[];
  next: NextStep;
}

/** One graded answer, as the exam store records it. */
export interface SittingResult {
  itemId: string;
  format: ExamFormat;
  correct: boolean;
  slip: SlipKind | null;
  /** What was put down at the time, when the store kept it. */
  draft?: DraftValue | null;
}

/** A question to go back over, with the answer that lost it. */
export interface MissedQuestion {
  item: ExamItem;
  draft: DraftValue | null;
}

/**
 * What to actually go back over.
 *
 * One row per question, judged on the first time it came up: mastery asks
 * again until it is right, so a list built from the final answers would come
 * back empty every time — which is precisely when it is least true.
 *
 * The answer comes off the result rather than the drafts, for the same
 * reason: by the end of that sitting the draft has been overwritten by the
 * answer that finally worked.
 */
export function missedQuestions(
  items: readonly ExamItem[],
  results: readonly SittingResult[]
): MissedQuestion[] {
  const byItem = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const out: MissedQuestion[] = [];

  for (const answer of results) {
    const item = byItem.get(answer.itemId);
    if (!item || seen.has(item.questionId)) continue;
    seen.add(item.questionId);
    if (!answer.correct) out.push({ item, draft: answer.draft ?? null });
  }
  return out;
}

export interface DebriefInput {
  mode: ExamMode;
  items: readonly ExamItem[];
  results: readonly SittingResult[];
  /** Every answer recorded for this subject *before* this sitting. */
  history: readonly AnswerRecord[];
  durationMs: number;
  now?: number;
}

/** A format is only judged once there is enough of it to judge. */
const MIN_FORMAT_SAMPLE = 3;
const STRONG_FORMAT = 0.8;
const WEAK_FORMAT = 0.5;

/** Front half against back half, and how far apart they have to be. */
const MIN_FADE_ITEMS = 8;
const FADE_GAP = 0.25;
/** The front half has to have gone well enough to fade from. */
const FADE_FLOOR = 0.6;

/** Fast enough that the misses might be reading rather than knowing. */
const RUSHED_SECONDS = 6;

interface FormatTally {
  format: ExamFormat;
  right: number;
  total: number;
  share: number;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function tally(results: readonly SittingResult[]): FormatTally[] {
  const map = new Map<ExamFormat, { right: number; total: number }>();
  for (const result of results) {
    const entry = map.get(result.format) ?? { right: 0, total: 0 };
    entry.total++;
    if (result.correct) entry.right++;
    map.set(result.format, entry);
  }
  return [...map.entries()]
    .map(([format, e]) => ({ format, right: e.right, total: e.total, share: e.right / e.total }))
    .sort((a, b) => b.share - a.share || b.total - a.total);
}

function countSlips(results: readonly SittingResult[]): Record<SlipKind, number> {
  const counts: Record<SlipKind, number> = {
    blank: 0,
    timeout: 0,
    spelling: 0,
    partial: 0,
    halfway: 0,
    wrong: 0,
  };
  for (const result of results) {
    if (!result.correct) counts[result.slip ?? 'wrong']++;
  }
  return counts;
}

/**
 * How each question went the *first* time it came up today.
 *
 * Everything the note counts is counted here rather than over every answer,
 * because mastery and survival ask the same question again. Tally those and
 * a two-question pile reads as "multiple choice: 4/5", which is five answers
 * to two questions and says nothing true about either.
 */
function firstAnswers(
  items: readonly ExamItem[],
  results: readonly SittingResult[]
): Map<string, SittingResult> {
  const byItem = new Map(items.map((item) => [item.id, item]));
  const first = new Map<string, SittingResult>();
  for (const result of results) {
    const item = byItem.get(result.itemId);
    if (!item || first.has(item.questionId)) continue;
    first.set(item.questionId, result);
  }
  return first;
}

interface Against {
  /** Missed last time you saw it, right today. */
  fixed: number;
  /** Missed last time and missed again. */
  repeat: number;
  /** Had it right before, lost it today. */
  slipped: number;
  /** Never answered before today. */
  freshRight: number;
  freshMissed: number;
}

function compare(
  first: Map<string, SittingResult>,
  history: readonly AnswerRecord[],
  now: number
): Against {
  const prior = byQuestion(history);
  const out: Against = { fixed: 0, repeat: 0, slipped: 0, freshRight: 0, freshMissed: 0 };

  for (const [questionId, { correct }] of first) {
    const mastery = questionMastery(prior.get(questionId) ?? [], now);
    if (mastery.attempts === 0) {
      if (correct) out.freshRight++;
      else out.freshMissed++;
    } else if (mastery.missedLast) {
      if (correct) out.fixed++;
      else out.repeat++;
    } else if (!correct) {
      out.slipped++;
    }
  }
  return out;
}

function share(results: readonly SittingResult[]): number {
  return results.length === 0 ? 0 : results.filter((r) => r.correct).length / results.length;
}

const EMPTY_DEBRIEF: Debrief = {
  headline: 'Nothing to mark.',
  wrong: [],
  strengths: [],
  weaknesses: [],
  next: {
    title: 'Sit one properly',
    body: 'Answer a few and there will be something to read back.',
    action: 'none',
    format: null,
    actionLabel: null,
  },
};

export function buildDebrief(input: DebriefInput): Debrief {
  const { mode, items, results, history, durationMs } = input;
  const now = input.now ?? Date.now();
  if (results.length === 0) return EMPTY_DEBRIEF;

  const spec = MODES[mode];
  // The score is every answer, because that is the number on the card. The
  // read underneath it is one row per question, first time seen.
  const total = results.length;
  const score = results.filter((r) => r.correct).length;
  const pct = Math.round((score / total) * 100);

  const first = firstAnswers(items, results);
  const firstResults = [...first.values()];
  const misses = firstResults.filter((r) => !r.correct).length;

  const tallies = tally(firstResults);
  const best = tallies[0];
  const worst = tallies[tallies.length - 1];
  const slips = countSlips(firstResults);
  const against = compare(first, history, now);
  const secondsEach = total === 0 ? 0 : durationMs / 1000 / total;

  // Only a straight run through a paper has a front and a back. Mastery and
  // survival loop, so "the second half" would be meaningless.
  const fade =
    spec.repetition === 'once' && total >= MIN_FADE_ITEMS
      ? (() => {
          const half = Math.floor(total / 2);
          const front = results.slice(0, half);
          const back = results.slice(half);
          // Only a fade if there was something to fade from. Two out of four
          // dropping to none is a hard paper, not lost concentration.
          const started = share(front);
          return started >= FADE_FLOOR && started - share(back) >= FADE_GAP
            ? { front, back }
            : null;
        })()
      : null;

  // --- where the marks went ---------------------------------------------

  const wrong: DebriefNote[] = [];

  // Going that fast is the story of the paper, whatever else the misses say.
  if (spec.clock === 'none' && total >= 6 && secondsEach < RUSHED_SECONDS && pct < 65) {
    wrong.push({
      id: 'rushed',
      weight: misses,
      text: `About ${Math.round(secondsEach)}s a question, with no clock running.`,
    });
  }
  if (slips.timeout > 0) {
    wrong.push({
      id: 'timeout',
      weight: slips.timeout,
      text: `${slips.timeout} ran out of time rather than went wrong.`,
    });
  }
  if (slips.blank > 0) {
    wrong.push({
      id: 'blank',
      weight: slips.blank,
      text: `${slips.blank} went down blank — a guess cannot score less.`,
    });
  }
  if (slips.spelling > 0) {
    wrong.push({
      id: 'spelling',
      weight: slips.spelling,
      text: `${slips.spelling} ${plural(slips.spelling, 'was', 'were')} a letter or two off.`,
    });
  }
  if (slips.partial > 0) {
    wrong.push({
      id: 'partial',
      weight: slips.partial,
      text: `${slips.partial} list ${plural(slips.partial, 'question', 'questions')} came out part-right.`,
    });
  }
  if (slips.halfway > 0) {
    wrong.push({
      id: 'halfway',
      weight: slips.halfway,
      text: `${slips.halfway} caught the false statement but not the word.`,
    });
  }

  // A first look at questions never asked before is not a reading problem,
  // so the two never appear together — one of them would be wrong.
  const mostlyFresh = against.freshMissed >= 3 && against.freshMissed >= misses / 2;
  // Nor is anything a knowledge read when the misses were never answered.
  const mostlyUnanswered = slips.timeout + slips.blank >= misses / 2;

  // Weight zero: both of these say "nothing more specific than that", so
  // they only ever get the line when nothing more specific happened.
  if (!mostlyFresh && misses >= 3 && slips.wrong >= misses / 2) {
    wrong.push({ id: 'gaps', weight: 0, text: 'Most of the misses were gaps, not slips.' });
  }
  if (mostlyFresh && !mostlyUnanswered) {
    wrong.push({
      id: 'fresh',
      weight: 0,
      text: `${against.freshMissed} you had never been asked before.`,
    });
  }

  // --- what held up ------------------------------------------------------

  const strengths: DebriefNote[] = [];

  if (best && best.total >= MIN_FORMAT_SAMPLE && best.share >= STRONG_FORMAT) {
    strengths.push({
      id: `format:${best.format}`,
      weight: best.total,
      text: `${FORMAT_LABEL[best.format]}: ${best.right}/${best.total}.`,
    });
  }
  if (against.fixed > 0) {
    strengths.push({
      id: 'fixed',
      weight: against.fixed,
      text: `${against.fixed} you had missed before came back right.`,
    });
  }
  if (against.freshRight >= 2) {
    strengths.push({
      id: 'freshRight',
      weight: against.freshRight,
      text: `${against.freshRight} new ones right first go.`,
    });
  }
  if (strengths.length === 0 && best && best.total >= 2 && best.share >= 0.6) {
    strengths.push({
      id: `format-soft:${best.format}`,
      weight: best.total,
      text: `${FORMAT_LABEL[best.format]} held up best: ${best.right}/${best.total}.`,
    });
  }

  // --- what did not ------------------------------------------------------

  const weaknesses: DebriefNote[] = [];

  // Declared worst-first for the mode it belongs to: on a pile that repeats,
  // how many passes it took is the whole story of the sitting.
  if (spec.repetition === 'until_retired' && total > items.length) {
    const extra = total - items.length;
    weaknesses.push({
      id: 'extra',
      weight: extra,
      text: `${extra} extra ${plural(extra, 'pass', 'passes')} to clear the pile.`,
    });
  }
  if (
    worst &&
    worst !== best &&
    worst.total >= MIN_FORMAT_SAMPLE &&
    worst.share <= WEAK_FORMAT
  ) {
    weaknesses.push({
      id: `format:${worst.format}`,
      weight: worst.total,
      text: `${FORMAT_LABEL[worst.format]}: ${worst.right}/${worst.total} — where most marks went.`,
    });
  }
  if (against.repeat > 0) {
    weaknesses.push({
      id: 'repeat',
      weight: against.repeat,
      text: `${against.repeat} ${plural(against.repeat, 'has', 'have')} now caught you more than once.`,
    });
  }
  if (against.slipped > 0) {
    weaknesses.push({
      id: 'slipped',
      weight: against.slipped,
      text: `${against.slipped} you had right last time went wrong.`,
    });
  }
  if (fade) {
    weaknesses.push({
      id: 'fade',
      weight: fade.front.length,
      text: `Back half ${fade.back.filter((r) => r.correct).length}/${fade.back.length}, against ${fade.front.filter((r) => r.correct).length}/${fade.front.length} at the front.`,
    });
  }

  return {
    headline: headlineFor({ mode, pct, score, total, against, slips, misses }),
    // The loudest thing that went wrong; the rest keep their declared order,
    // which is already worst-first for the mode.
    wrong: [...wrong].sort((a, b) => b.weight - a.weight).slice(0, 1),
    strengths: strengths.slice(0, 1),
    weaknesses: weaknesses.slice(0, 1),
    next: nextStep({ pct, misses, against, slips, worst, formats: tallies.length }),
  };
}

// --- the title at the top -----------------------------------------------

interface HeadlineInput {
  mode: ExamMode;
  pct: number;
  score: number;
  total: number;
  against: Against;
  slips: Record<SlipKind, number>;
  misses: number;
}

/**
 * The motivational line.
 *
 * Motivational does not mean untrue. A bad paper gets a line that is worth
 * reading on a bad day — never "Great effort!", which any student can tell
 * was written before they sat down.
 */
function headlineFor(input: HeadlineInput): string {
  const { mode, pct, score, total, against, slips, misses } = input;
  const spec = MODES[mode];
  const slipped = slips.blank + slips.timeout + slips.spelling + slips.partial + slips.halfway;

  if (spec.repetition === 'until_out') {
    return total >= 25
      ? 'That was a long run.'
      : total >= 12
        ? 'You held on a while.'
        : 'Short one. Go again.';
  }

  if (spec.repetition === 'until_retired') return 'The pile is empty.';

  return score === total && total >= 5
      ? 'Nothing left to mark.'
      : pct >= 85
        ? 'You knew this one.'
        : pct >= 70
          ? against.fixed > 0
            ? 'The gaps are closing.'
            : "That's a good paper."
          : pct >= 50
            ? against.fixed > 0
              ? 'Better than you were.'
              : 'Half of it is already yours.'
            : against.freshMissed >= Math.max(2, misses / 2)
              ? 'First pass on new ground.'
              : slipped >= Math.max(2, misses / 2)
                ? 'You know more than that says.'
                : 'Now you know where the gaps are.';
}



// --- the one thing to do next -------------------------------------------

interface NextInput {
  pct: number;
  misses: number;
  against: Against;
  slips: Record<SlipKind, number>;
  worst: FormatTally | undefined;
  /** How many formats were actually sat. */
  formats: number;
}

/**
 * Exactly one instruction. A list of five things to work on is a list
 * nobody starts; the point is to make the next twenty minutes obvious.
 */
function nextStep(input: NextInput): NextStep {
  const { pct, misses, against, slips, worst, formats } = input;

  if (against.repeat >= 2) {
    return {
      title: 'Go again on the ones that keep coming back',
      body: `${against.repeat} have caught you more than once. A new sitting leans on the shaky ones.`,
      action: 'relaxed',
      format: null,
      actionLabel: 'Sit it again',
    };
  }

  if (slips.timeout + slips.blank >= 3) {
    return {
      title: 'Sit it again with no clock',
      body: `${slips.timeout + slips.blank} of the misses were never really answered.`,
      action: 'relaxed',
      format: null,
      actionLabel: 'Sit it untimed',
    };
  }

  // Only worth saying when there was another format to be better at. On a
  // paper of one format, "that format is the problem" is just the score again.
  if (formats >= 2 && worst && worst.total >= MIN_FORMAT_SAMPLE && worst.share <= WEAK_FORMAT) {
    return {
      title: `Do a set of just ${FORMAT_LABEL[worst.format].toLowerCase()}`,
      body: `${worst.right}/${worst.total} today — the format, not the subject.`,
      action: 'format',
      format: worst.format,
      actionLabel: `${FORMAT_LABEL[worst.format]} only`,
    };
  }

  if (slips.spelling >= 2) {
    return {
      title: 'Write the answers, do not just read them',
      body: 'Reading a term makes it familiar; writing it is what makes it stick.',
      action: 'none',
      format: null,
      actionLabel: null,
    };
  }

  if (misses === 0 || pct >= 85) {
    return {
      title: 'Leave it a day',
      body: 'Coming back after a gap is what makes it stick. A rerun tonight proves nothing.',
      action: 'none',
      format: null,
      actionLabel: null,
    };
  }

  if (against.slipped >= 2) {
    return {
      title: 'Win back the ones that faded',
      body: 'The cheapest marks on the paper.',
      action: 'relaxed',
      format: null,
      actionLabel: 'Sit it again',
    };
  }

  return {
    title: 'Go again on what you missed',
    body: `${misses} to pick up, and the builder puts the shaky ones first.`,
    action: 'relaxed',
    format: null,
    actionLabel: 'Sit it again',
  };
}
