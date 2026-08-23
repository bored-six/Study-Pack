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

import type { IconName } from '@/components/Icon';

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
  icon: IconName;
  text: string;
}

/** What the button under "do this next" should start. */
export type NextAction = 'weak_spots' | 'format' | 'relaxed' | 'none';

export interface NextStep {
  title: string;
  body: string;
  action: NextAction;
  /** The format a `format` action should drill, when that is the advice. */
  format: ExamFormat | null;
  actionLabel: string | null;
}

export interface Debrief {
  /** The line at the top. Earned, never a participation trophy. */
  headline: string;
  /** One honest sentence under it. */
  subhead: string;
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
  subhead: 'No answers were recorded for this sitting.',
  wrong: [],
  strengths: [],
  weaknesses: [],
  next: {
    title: 'Sit one properly',
    body: 'Pick a mode and answer a few questions — then there is something to read back.',
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

  if (slips.timeout > 0) {
    wrong.push({
      id: 'timeout',
      icon: 'clock',
      text: `${slips.timeout} ran out of time. Not knowing it and not reaching it look identical on the score — they are not the same problem.`,
    });
  }
  if (slips.blank > 0) {
    wrong.push({
      id: 'blank',
      icon: 'note',
      text: `${slips.blank} went down blank. Put something — a wrong answer scores exactly what an empty line does, and it tells you what you half-remembered.`,
    });
  }
  if (slips.spelling > 0) {
    wrong.push({
      id: 'spelling',
      icon: 'pencil',
      text: `${slips.spelling} ${plural(slips.spelling, 'was', 'were')} a letter or two off. You had ${plural(slips.spelling, 'that one', 'those')} — the spelling took the mark, not the knowing.`,
    });
  }
  if (slips.partial > 0) {
    wrong.push({
      id: 'partial',
      icon: 'cards',
      text: `${slips.partial} list ${plural(slips.partial, 'question', 'questions')} came out part-right. Half a list scores nothing, so learn them as a set, in one order, every time.`,
    });
  }
  if (slips.halfway > 0) {
    wrong.push({
      id: 'halfway',
      icon: 'alert',
      text: `${slips.halfway} ${plural(slips.halfway, 'time', 'times')} you spotted the statement was false but not the word that made it. Read those slowly — the swap is usually the most specific word in the line.`,
    });
  }
  // A first look at questions never asked before is not a reading problem,
  // so the two never appear together — one of them would be wrong.
  const mostlyFresh = against.freshMissed >= 3 && against.freshMissed >= misses / 2;
  // Nor is anything a knowledge read when the misses were never answered.
  const mostlyUnanswered = slips.timeout + slips.blank >= misses / 2;

  if (!mostlyFresh && misses >= 3 && slips.wrong >= misses / 2) {
    wrong.push({
      id: 'gaps',
      icon: 'book',
      text: `Most of the misses were straight gaps rather than slips. That is a reading problem, not a careless one — go back to the notes for those before sitting another paper.`,
    });
  }
  if (mostlyFresh && !mostlyUnanswered) {
    wrong.push({
      id: 'fresh',
      icon: 'sprout',
      text: `${against.freshMissed} of them you had never been asked before. New ground, not lost ground — a first pass is meant to look like this.`,
    });
  }
  if (spec.clock === 'none' && total >= 6 && secondsEach < RUSHED_SECONDS && pct < 65) {
    wrong.push({
      id: 'rushed',
      icon: 'bolt',
      text: `About ${Math.round(secondsEach)}s a question, with no clock running. Nothing was chasing you — the next one is worth reading twice.`,
    });
  }

  // --- what held up ------------------------------------------------------

  const strengths: DebriefNote[] = [];

  if (best && best.total >= MIN_FORMAT_SAMPLE && best.share >= STRONG_FORMAT) {
    strengths.push({
      id: `format:${best.format}`,
      icon: 'check',
      text: `${FORMAT_LABEL[best.format]}: ${best.right}/${best.total}. That format is not what is costing you.`,
    });
  }
  if (against.fixed > 0) {
    strengths.push({
      id: 'fixed',
      icon: 'sprout',
      text: `${against.fixed} ${plural(against.fixed, 'question', 'questions')} you had missed before came back right today. That is the part that actually counts as learning.`,
    });
  }
  if (against.freshRight >= 2) {
    strengths.push({
      id: 'freshRight',
      icon: 'star',
      text: `${against.freshRight} you had never seen before, right first go.`,
    });
  }
  if (strengths.length === 0 && best && best.total >= 2 && best.share >= 0.6) {
    strengths.push({
      id: `format-soft:${best.format}`,
      icon: 'check',
      text: `${FORMAT_LABEL[best.format]} held up best: ${best.right}/${best.total}.`,
    });
  }

  // --- what did not ------------------------------------------------------

  const weaknesses: DebriefNote[] = [];

  if (
    worst &&
    worst !== best &&
    worst.total >= MIN_FORMAT_SAMPLE &&
    worst.share <= WEAK_FORMAT
  ) {
    weaknesses.push({
      id: `format:${worst.format}`,
      icon: 'alert',
      text: `${FORMAT_LABEL[worst.format]}: ${worst.right}/${worst.total}. More of the lost marks are here than anywhere else.`,
    });
  }
  if (against.repeat > 0) {
    weaknesses.push({
      id: 'repeat',
      icon: 'question',
      text: `${against.repeat} ${plural(against.repeat, 'question has', 'questions have')} now caught you more than once. Repeating the same sitting will not fix ${plural(against.repeat, 'it', 'them')} — the answer has to go in first.`,
    });
  }
  if (against.slipped > 0) {
    weaknesses.push({
      id: 'slipped',
      icon: 'bulb',
      text: `${against.slipped} you had right last time went wrong today. Fading, not missing — those are the cheapest marks to win back.`,
    });
  }
  if (fade) {
    weaknesses.push({
      id: 'fade',
      icon: 'clock',
      text: `The back half of the paper went ${fade.back.filter((r) => r.correct).length}/${fade.back.length} against ${fade.front.filter((r) => r.correct).length}/${fade.front.length} at the front. Concentration, not knowledge — shorter sittings hold it better.`,
    });
  }
  if (spec.repetition === 'until_retired' && total > items.length) {
    const extra = total - items.length;
    weaknesses.push({
      id: 'extra',
      icon: 'sprout',
      text: `It took ${extra} extra ${plural(extra, 'pass', 'passes')} to clear the pile. Those are the ones to look at again tomorrow.`,
    });
  }

  return {
    ...headlineFor({ mode, pct, score, total, items, against, slips, misses }),
    wrong: wrong.slice(0, 3),
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    next: nextStep({ mode, pct, misses, against, slips, worst, best, formats: tallies.length }),
  };
}

// --- the title at the top -----------------------------------------------

interface HeadlineInput {
  mode: ExamMode;
  pct: number;
  score: number;
  total: number;
  items: readonly ExamItem[];
  against: Against;
  slips: Record<SlipKind, number>;
  misses: number;
}

/**
 * The motivational line, and one honest sentence under it.
 *
 * Motivational does not mean untrue. A bad paper gets a line that is worth
 * reading on a bad day — never "Great effort!", which any student can tell
 * was written before they sat down.
 */
function headlineFor(input: HeadlineInput): { headline: string; subhead: string } {
  const { mode, pct, score, total, items, against, slips, misses } = input;
  const spec = MODES[mode];
  const slipped = slips.blank + slips.timeout + slips.spelling + slips.partial + slips.halfway;

  if (spec.repetition === 'until_out') {
    const headline =
      total >= 25
        ? 'That was a long run.'
        : total >= 12
          ? 'You held on a while.'
          : 'Short one. Go again.';
    return { headline, subhead: `${score} right before the third miss.` };
  }

  if (spec.repetition === 'until_retired') {
    const extra = Math.max(0, total - items.length);
    return {
      headline: 'The pile is empty.',
      subhead:
        extra === 0
          ? `${items.length} questions, cleared without a single repeat.`
          : `${items.length} questions cleared, ${extra} extra ${plural(extra, 'pass', 'passes')} to get there.`,
    };
  }

  const headline =
    score === total && total >= 5
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

  // The shape of the misses first: what went right is about to be said
  // again under "what's working", and saying it twice wastes the one line
  // that gets read for sure.
  const subhead =
    misses === 0
      ? `All ${total}, first time through.`
      : against.repeat > 0
        ? `${against.repeat} of them ${plural(against.repeat, 'is', 'are')} still catching you.`
        : slips.timeout > 0
          ? `${slips.timeout} of the misses went to the clock.`
          : slips.blank > 0
            ? `${slips.blank} of the misses were left blank.`
            : slips.spelling > 0
              ? `${slips.spelling} of the misses were spelling alone.`
              : against.fixed > 0
                ? `${against.fixed} you used to miss came back right.`
                : `${score} right, ${misses} to go back over.`;

  return { headline, subhead };
}

// --- the one thing to do next -------------------------------------------

interface NextInput {
  mode: ExamMode;
  pct: number;
  misses: number;
  against: Against;
  slips: Record<SlipKind, number>;
  worst: FormatTally | undefined;
  best: FormatTally | undefined;
  /** How many formats were actually sat. */
  formats: number;
}

/**
 * Exactly one instruction. A list of five things to work on is a list
 * nobody starts; the point is to make the next twenty minutes obvious.
 */
function nextStep(input: NextInput): NextStep {
  const { mode, pct, misses, against, slips, worst, best, formats } = input;

  // Already drilled them and they still went wrong — another round of the
  // same drill is exactly the wrong advice.
  if (mode === 'weak_spots' && against.repeat > 0) {
    return {
      title: 'Take these back to the notes',
      body: `You drilled ${plural(against.repeat, 'this one', 'these')} and ${plural(against.repeat, 'it', 'they')} still went wrong. Read the answer for each of ${plural(against.repeat, 'it', 'them')} above before the next sitting — more attempts on their own will not put it in.`,
      action: 'none',
      format: null,
      actionLabel: null,
    };
  }

  if (against.repeat >= 2) {
    return {
      title: 'Drill the ones that keep coming back',
      body: `${against.repeat} questions have now caught you more than once. Weak spots pulls exactly those and nothing else.`,
      action: 'weak_spots',
      format: null,
      actionLabel: 'Drill weak spots',
    };
  }

  if (slips.timeout + slips.blank >= 3) {
    return {
      title: 'Sit it again with no clock',
      body: `${slips.timeout + slips.blank} of the misses were never really answered. Take your time mode removes the clock, so what comes back is what you actually know.`,
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
      body: `${worst.right}/${worst.total} today. It is the format costing you, not the subject — a short set of only these is the fastest thing you can fix.`,
      action: 'format',
      format: worst.format,
      actionLabel: `${FORMAT_LABEL[worst.format]} only`,
    };
  }

  if (slips.spelling >= 2) {
    return {
      title: 'Write the answers, do not just read them',
      body: `${slips.spelling} answers were a letter or two out. Reading a term makes it familiar; writing it is what makes it spellable under pressure.`,
      action: 'none',
      format: null,
      actionLabel: null,
    };
  }

  if (misses === 0 || pct >= 85) {
    return {
      title: 'Leave it a day',
      body: 'You have got today. Coming back after a gap is what turns it into something you still have next week — a rerun this evening proves nothing.',
      action: 'none',
      format: null,
      actionLabel: null,
    };
  }

  if (against.slipped >= 2) {
    return {
      title: 'Win back the ones that faded',
      body: `${against.slipped} you had right before slipped today. Weak spots picks them up first — those are the cheapest marks on the paper.`,
      action: 'weak_spots',
      format: null,
      actionLabel: 'Drill weak spots',
    };
  }

  if (best && best.share >= STRONG_FORMAT && best.total >= MIN_FORMAT_SAMPLE) {
    return {
      title: 'Go again on what you missed',
      body: `The formats you are good at will not move the number much further. Weak spots goes at the ${misses} you dropped instead.`,
      action: 'weak_spots',
      format: null,
      actionLabel: 'Drill weak spots',
    };
  }

  return {
    title: 'Go again on what you missed',
    body: `${misses} to pick up. Weak spots puts the worst of them in front of you first.`,
    action: 'weak_spots',
    format: null,
    actionLabel: 'Drill weak spots',
  };
}
