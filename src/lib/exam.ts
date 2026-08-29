/**
 * Builds exam items from stored questions.
 *
 * No new parsing happens here. Every format is a re-presentation of the same
 * three things the parser already extracted — a prompt, the right answer, and
 * believable wrong answers. What changes is how it's shown and graded.
 *
 * Crucially, when we make a statement false we are the ones who broke it, so
 * we know exactly which word was swapped and what it should have been. That
 * makes modified true/false exact to grade rather than guesswork.
 */

import type { AnswerRecord } from './mastery';
import { rankByNeed } from './pick';
import { optionsAreLevel } from './questionQuality';
import { looksLikeIllustration, readsAsStatement } from './quizzable';
import type { Question } from './types';

export type ExamFormat =
  | 'multiple_choice'
  | 'true_false'
  | 'modified_true_false'
  | 'identification'
  | 'fill_blank'
  | 'matching'
  | 'enumeration';

export const FORMAT_LABEL: Record<ExamFormat, string> = {
  multiple_choice: 'Multiple choice',
  true_false: 'True or False',
  modified_true_false: 'Modified True or False',
  identification: 'Identification',
  fill_blank: 'Fill in the blank',
  matching: 'Matching',
  enumeration: 'Enumeration',
};

export const FORMAT_HOWTO: Record<ExamFormat, string> = {
  multiple_choice: 'Pick the one correct answer from the four choices.',
  true_false: 'Decide whether the statement is true or false.',
  modified_true_false:
    "Decide if the statement is true. If it's false, tap the word that's wrong and type the correct one. Both parts must be right.",
  identification: 'Type the answer. Capital letters don’t matter, but spelling does.',
  fill_blank: 'Type the word that belongs in the blank. Spelling counts.',
  matching: 'Match each term on the left to its meaning on the right.',
  enumeration: 'List every item. One per line — order doesn’t matter unless we say so.',
};

// --- item shapes --------------------------------------------------------

interface BaseItem {
  id: string;
  format: ExamFormat;
  questionId: string;
}

export interface ChoiceItem extends BaseItem {
  format: 'multiple_choice';
  prompt: string;
  options: string[];
  correctAnswer: string;
}

export interface TrueFalseItem extends BaseItem {
  format: 'true_false';
  statement: string;
  isTrue: boolean;
}

export interface ModifiedTrueFalseItem extends BaseItem {
  format: 'modified_true_false';
  /** Words as rendered, each individually tappable. */
  words: string[];
  isTrue: boolean;
  /** Index into `words` of the swapped word; -1 when the statement is true. */
  falseWordIndex: number;
  /** What the swapped word should have been. */
  correctWord: string;
}

export interface TypedItem extends BaseItem {
  format: 'identification' | 'fill_blank';
  prompt: string;
  correctAnswer: string;
}

export interface MatchingItem extends BaseItem {
  format: 'matching';
  /** Terms, shuffled independently of the meanings. */
  terms: string[];
  meanings: string[];
  /** meanings[correctIndexFor[i]] belongs to terms[i]. */
  correctIndexFor: number[];
}

export interface EnumerationItem extends BaseItem {
  format: 'enumeration';
  prompt: string;
  items: string[];
  ordered: boolean;
}

export type ExamItem =
  | ChoiceItem
  | TrueFalseItem
  | ModifiedTrueFalseItem
  | TypedItem
  | MatchingItem
  | EnumerationItem;

// --- helpers ------------------------------------------------------------

function seed(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = (h ^ text.charCodeAt(i)) * 16777619;
    h >>>= 0;
  }
  return () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return h / 0x100000000;
  };
}

function shuffleWith<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Strips the trailing punctuation from a token, keeping it for reassembly. */
function splitTrailing(token: string): [string, string] {
  const match = /[.,;:!?)"']+$/.exec(token);
  return match ? [token.slice(0, -match[0].length), match[0]] : [token, ''];
}

// --- format support -----------------------------------------------------

/**
 * A cloze prompt carries a blank we can fill to rebuild the original
 * sentence; that is what true/false and its modified form need.
 */
function clozeBlankIndex(prompt: string): number {
  return words(prompt).findIndex((w) => w.startsWith('______'));
}

/**
 * The last gate before a question reaches a student, in any format.
 *
 * The parser refuses illustrations and headings, but a deck built before it
 * learned to still holds them, and a bad question is bad as multiple choice
 * just as surely as it is as true/false. Refusing here covers every format
 * at once and every deck, however old.
 */
export function isQuizzable(question: Question): boolean {
  const prompt = question.prompt.trim();
  const source = (question.sourceLine ?? '').trim();

  // "Example: The wind ______ through the alley" tests the example.
  if (looksLikeIllustration(prompt) || looksLikeIllustration(source)) return false;

  // Enumerations are lists, not sentences — the statement test doesn't apply.
  if (question.kind === 'enumeration') return question.answers.length > 0;

  // A definition prompt is a question we wrote, so it always reads as one;
  // a cloze is the student's own sentence and might be a heading.
  if (question.kind === 'cloze') {
    const sentence = source || prompt.replace(/_{3,}/, question.correctAnswer);
    if (!readsAsStatement(sentence)) return false;
  }

  return true;
}

export function supportedFormats(question: Question): ExamFormat[] {
  if (!isQuizzable(question)) return [];

  // Multiple choice needs four options a student cannot sort by looking.
  const formats: ExamFormat[] = optionsAreLevel(question.correctAnswer, question.answers)
    ? ['multiple_choice']
    : [];

  if (question.kind === 'enumeration') {
    return ['enumeration'];
  }

  // Typed answers only make sense for questions we generated ourselves; a
  // trivia prompt is written assuming its options are on screen.
  if (question.kind === 'cloze') formats.push('fill_blank');
  else if (question.kind === 'definition') formats.push('identification');

  if (question.kind === 'cloze' && clozeBlankIndex(question.prompt) >= 0) {
    formats.push('true_false');
    // Tapping a word only works when the answer occupies exactly one word;
    // a multi-word chip beside single words would give the answer away.
    if (words(question.correctAnswer).length === 1) {
      formats.push('modified_true_false');
    }
  } else if (question.kind === 'definition' && question.sourceLine) {
    formats.push('true_false');
  }

  if (question.kind === 'definition' && question.sourceLine) formats.push('matching');

  return formats;
}

// --- builders -----------------------------------------------------------

function buildChoice(question: Question, rand: () => number): ChoiceItem {
  return {
    id: `${question.id}:mc`,
    format: 'multiple_choice',
    questionId: question.id,
    prompt: question.prompt,
    options: shuffleWith(question.answers, rand),
    correctAnswer: question.correctAnswer,
  };
}

function buildTyped(question: Question): TypedItem {
  const isCloze = question.kind === 'cloze';
  return {
    id: `${question.id}:${isCloze ? 'fb' : 'id'}`,
    format: isCloze ? 'fill_blank' : 'identification',
    questionId: question.id,
    prompt: question.prompt,
    correctAnswer: question.correctAnswer,
  };
}

/** Fills a cloze prompt with a word, producing a plain statement. */
function fillBlank(prompt: string, word: string): string[] {
  const tokens = words(prompt);
  const index = clozeBlankIndex(prompt);
  if (index < 0) return tokens;
  const [, trailing] = splitTrailing(tokens[index].replace(/^_+/, ''));
  const blankTrailing = tokens[index].slice(6); // whatever followed "______"
  tokens[index] = `${word}${blankTrailing || trailing}`;
  return tokens;
}

/**
 * The wrong word a false statement is built from.
 *
 * True/false and modified true/false do not show the option set, but they
 * are made out of it: the false version of a sentence is the real one with a
 * decoy swapped in. So a decoy that would have given the answer away in a
 * list gives it away here too, just louder — "delivered by transfer RNA"
 * became "delivered by transfer Human", which is not a claim anyone has to
 * think about.
 *
 * Same test the option set has to pass, applied one decoy at a time, and
 * still falling back rather than losing the format when a deck has nothing
 * better to offer.
 */
function pickDecoy(question: Question, rand: () => number): string | null {
  const decoys = question.answers.filter((a) => a !== question.correctAnswer);
  if (decoys.length === 0) return null;
  const level = decoys.filter((decoy) =>
    optionsAreLevel(question.correctAnswer, [question.correctAnswer, decoy])
  );
  const usable = level.length > 0 ? level : decoys;
  return usable[Math.floor(rand() * usable.length)];
}

function buildTrueFalse(question: Question, rand: () => number): TrueFalseItem | null {
  // Half of them should be true, or students learn to always answer False.
  const isTrue = rand() < 0.5;

  if (question.kind === 'cloze') {
    if (clozeBlankIndex(question.prompt) < 0) return null;
    const decoy = pickDecoy(question, rand);
    if (!isTrue && !decoy) return null;
    const word = isTrue ? question.correctAnswer : (decoy as string);
    return {
      id: `${question.id}:tf`,
      format: 'true_false',
      questionId: question.id,
      statement: fillBlank(question.prompt, word).join(' '),
      isTrue,
    };
  }

  // Definition: the source line is already a declarative statement.
  if (!question.sourceLine) return null;
  if (isTrue) {
    return {
      id: `${question.id}:tf`,
      format: 'true_false',
      questionId: question.id,
      statement: question.sourceLine,
      isTrue: true,
    };
  }
  const decoy = pickDecoy(question, rand);
  if (!decoy) return null;
  // Swap the defined term for another term from the same notes.
  const statement = question.sourceLine.replace(question.correctAnswer, decoy);
  if (statement === question.sourceLine) return null;
  return {
    id: `${question.id}:tf`,
    format: 'true_false',
    questionId: question.id,
    statement,
    isTrue: false,
  };
}

function buildModifiedTrueFalse(
  question: Question,
  rand: () => number
): ModifiedTrueFalseItem | null {
  const blankIndex = clozeBlankIndex(question.prompt);
  if (blankIndex < 0) return null;
  if (words(question.correctAnswer).length !== 1) return null;

  const isTrue = rand() < 0.4; // lean false; the correction is the interesting part
  const decoy = isTrue ? null : pickDecoy(question, rand);
  if (!isTrue && !decoy) return null;

  const filled = fillBlank(question.prompt, isTrue ? question.correctAnswer : (decoy as string));

  return {
    id: `${question.id}:mtf`,
    format: 'modified_true_false',
    questionId: question.id,
    words: filled,
    isTrue,
    falseWordIndex: isTrue ? -1 : blankIndex,
    correctWord: question.correctAnswer,
  };
}

function buildEnumeration(question: Question): EnumerationItem {
  return {
    id: `${question.id}:enum`,
    format: 'enumeration',
    questionId: question.id,
    prompt: question.prompt,
    items: question.answers,
    ordered: question.ordered === true,
  };
}

/** Terms per matching grid: fewer than three is trivial, more than five is a wall. */
const MATCHING_MIN = 3;
const MATCHING_MAX = 5;

/** Matching groups several definition questions into one exercise. */
export function buildMatching(questions: Question[], rand: () => number): MatchingItem | null {
  const usable = questions.filter((q) => q.kind === 'definition' && q.sourceLine);
  if (usable.length < MATCHING_MIN) return null;

  const chosen = shuffleWith(usable, rand).slice(0, Math.min(MATCHING_MAX, usable.length));
  const terms = chosen.map((q) => q.correctAnswer);
  const meanings = chosen.map((q) => meaningOf(q));
  const order = shuffleWith(
    meanings.map((_, i) => i),
    rand
  );
  const shuffledMeanings = order.map((i) => meanings[i]);

  return {
    id: `match:${chosen.map((q) => q.id).join('|')}`,
    format: 'matching',
    questionId: chosen[0].id,
    terms,
    meanings: shuffledMeanings,
    correctIndexFor: terms.map((_, i) => order.indexOf(i)),
  };
}

/** Recovers the definition text from the generated prompt. */
function meaningOf(question: Question): string {
  const match = /^Which term (?:means|is short for)[:\s]*"?(.+?)"?\?$/.exec(question.prompt);
  return match ? match[1] : question.prompt;
}

// --- assembling an exam -------------------------------------------------

export interface ExamRequest {
  format: ExamFormat;
  count: number;
}

/** How many questions in this deck can become each format. */
export function availability(questions: Question[]): Record<ExamFormat, number> {
  const counts = {
    multiple_choice: 0,
    true_false: 0,
    modified_true_false: 0,
    identification: 0,
    fill_blank: 0,
    matching: 0,
    enumeration: 0,
  } as Record<ExamFormat, number>;

  for (const question of questions) {
    for (const format of supportedFormats(question)) counts[format]++;
  }
  // Matching bundles up to five terms per grid and needs at least three, so
  // count the grids you can actually fill rather than dividing.
  let spare = counts.matching;
  let grids = 0;
  while (spare >= MATCHING_MIN) {
    spare -= Math.min(MATCHING_MAX, spare);
    grids++;
  }
  counts.matching = grids;
  return counts;
}

/** The order formats are shown in, and filled in — the familiar ones first. */
export const FORMAT_ORDER: ExamFormat[] = [
  'multiple_choice',
  'true_false',
  'modified_true_false',
  'identification',
  'fill_blank',
  'matching',
  'enumeration',
];

/** A count for every format, all zero. */
export function emptyCounts(): Record<ExamFormat, number> {
  return {
    multiple_choice: 0,
    true_false: 0,
    modified_true_false: 0,
    identification: 0,
    fill_blank: 0,
    matching: 0,
    enumeration: 0,
  };
}

export function totalOf(counts: Record<ExamFormat, number>): number {
  return FORMAT_ORDER.reduce((sum, format) => sum + counts[format], 0);
}

/** The most questions the chosen formats can produce between them. */
export function capacityFor(
  picks: readonly ExamFormat[],
  available: Record<ExamFormat, number>
): number {
  return picks.reduce((sum, format) => sum + (available[format] ?? 0), 0);
}

/**
 * Splits a wanted total across the formats the student ticked.
 *
 * Even rather than proportional: asking for twenty questions of true/false
 * and identification should give ten of each, however lopsided the notes
 * happen to be. A format that runs out hands its share back to the others,
 * and every ticked format takes one before any takes a second, so a type
 * you asked for never quietly comes back empty.
 */
export function spreadCounts(
  picks: readonly ExamFormat[],
  target: number,
  available: Record<ExamFormat, number>
): Record<ExamFormat, number> {
  const counts = emptyCounts();
  let open = FORMAT_ORDER.filter((format) => picks.includes(format) && available[format] > 0);
  const wanted = Number.isFinite(target) ? Math.max(0, Math.trunc(target)) : 0;
  let left = Math.min(wanted, capacityFor(open, available));

  while (left > 0 && open.length > 0) {
    const share = Math.max(1, Math.floor(left / open.length));
    const next: ExamFormat[] = [];
    for (const format of open) {
      const give = Math.min(share, available[format] - counts[format], left);
      counts[format] += give;
      left -= give;
      if (counts[format] < available[format]) next.push(format);
    }
    open = next;
  }
  return counts;
}

/**
 * Builds the exam.
 *
 * A question may be used once *per format*, never twice in the same one. That
 * is deliberate: testing the same fact as multiple choice and again as
 * true/false is reinforcement, and it's what lets a 21-question deck produce a
 * 40-question exam. Formats are interleaved and the order shuffled.
 *
 * `history` is the subject's answer log. Each format takes the first
 * questions it can use from a single ordering, so ordering that pool by need
 * rather than at random is what decides *which* ten of forty questions a
 * ten-question request gets: the shaky and the unseen, not the first ten
 * parsed. Pass an empty log and it degrades to the plain seeded shuffle.
 */
/**
 * What a question's weight is multiplied by for each slot it has already
 * taken in this exam. Low enough that a third outing is rare, high enough
 * that a genuinely weak fact can still be asked a second way.
 */
const REUSE_DECAY = 0.35;

/**
 * The seed is required, not defaulted.
 *
 * It used to fall back to the constant "exam", which meant any caller that
 * forgot it got the same paper every sitting and nothing said so. The app's
 * own call site passes the deck, the mode and the clock; making the argument
 * mandatory is what stops the next call site from quietly not doing that.
 */
export function buildExam(
  questions: Question[],
  requests: ExamRequest[],
  seedText: string,
  history: readonly AnswerRecord[] = []
): ExamItem[] {
  const rand = seed(seedText + questions.length);
  const base = shuffleWith(questions, rand);
  const items: ExamItem[] = [];

  // How many slots each question has already taken in this exam. Weighting by
  // need alone would put the same worst fact at the head of *every* format
  // bucket, so your weakest question came back as multiple choice, then
  // true/false, then identification in one sitting. Decaying its weight per
  // use keeps deliberate reinforcement — a fact can still come round twice —
  // while spending the rest of the paper on the other things you are weak on.
  //
  // It also protects the mastery signal in instant-feedback mode: once a
  // format has shown you the answer, re-asking the same fact records recall
  // you did not actually perform.
  const used = new Map<string, number>();
  const weightScale = (id: string) => Math.pow(REUSE_DECAY, used.get(id) ?? 0);
  const spend = (id: string) => used.set(id, (used.get(id) ?? 0) + 1);
  // Seeded rand throughout, so the same exam rebuilds identically for its seed.
  const rank = () => rankByNeed(base, history, { random: rand, weightScale });

  // Matching first: one exercise consumes several questions at once, and no
  // question should appear in two different matching grids.
  const usedInMatching = new Set<string>();
  for (const request of requests.filter((r) => r.format === 'matching')) {
    for (let n = 0; n < request.count; n++) {
      const available = rank().filter((q) => !usedInMatching.has(q.id));
      const item = buildMatching(available, rand);
      if (!item) break;
      item.terms.forEach((term) => {
        const match = available.find((q) => q.correctAnswer === term);
        if (match) {
          usedInMatching.add(match.id);
          spend(match.id);
        }
      });
      items.push(item);
    }
  }

  for (const request of requests.filter((r) => r.format !== 'matching')) {
    // Fresh per format, so the same fact can be revisited a different way.
    const usedInFormat = new Set<string>();
    let made = 0;

    // Re-ranked per format, so questions already spent sink down the order.
    for (const question of rank()) {
      if (made >= request.count) break;
      if (usedInFormat.has(question.id)) continue;
      if (!supportedFormats(question).includes(request.format)) continue;

      let item: ExamItem | null = null;
      switch (request.format) {
        case 'multiple_choice':
          item = buildChoice(question, rand);
          break;
        case 'true_false':
          item = buildTrueFalse(question, rand);
          break;
        case 'modified_true_false':
          item = buildModifiedTrueFalse(question, rand);
          break;
        case 'identification':
        case 'fill_blank':
          item = buildTyped(question);
          break;
        case 'enumeration':
          item = buildEnumeration(question);
          break;
      }

      if (!item) continue;
      usedInFormat.add(question.id);
      spend(question.id);
      items.push(item);
      made++;
    }
  }

  return shuffleWith(items, rand);
}
