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

export function supportedFormats(question: Question): ExamFormat[] {
  const formats: ExamFormat[] = ['multiple_choice'];

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

  if (question.kind === 'definition') formats.push('matching');

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

function pickDecoy(question: Question, rand: () => number): string | null {
  const decoys = question.answers.filter((a) => a !== question.correctAnswer);
  if (decoys.length === 0) return null;
  return decoys[Math.floor(rand() * decoys.length)];
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

/** Matching groups several definition questions into one exercise. */
export function buildMatching(questions: Question[], rand: () => number): MatchingItem | null {
  const usable = questions.filter((q) => q.kind === 'definition' && q.sourceLine);
  if (usable.length < 3) return null;

  const chosen = shuffleWith(usable, rand).slice(0, Math.min(5, usable.length));
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
  // Matching bundles up to five terms into a single exercise.
  counts.matching = counts.matching >= 3 ? Math.floor(counts.matching / 3) : 0;
  return counts;
}

/**
 * Builds the exam. Each question is used at most once, formats are
 * interleaved rather than grouped, and the order is shuffled.
 */
export function buildExam(
  questions: Question[],
  requests: ExamRequest[],
  seedText = 'exam'
): ExamItem[] {
  const rand = seed(seedText + questions.length);
  const pool = shuffleWith(questions, rand);
  const used = new Set<string>();
  const items: ExamItem[] = [];

  // Matching first: it consumes several questions at once.
  for (const request of requests.filter((r) => r.format === 'matching')) {
    for (let n = 0; n < request.count; n++) {
      const available = pool.filter((q) => !used.has(q.id));
      const item = buildMatching(available, rand);
      if (!item) break;
      item.terms.forEach((term) => {
        const match = available.find((q) => q.correctAnswer === term);
        if (match) used.add(match.id);
      });
      items.push(item);
    }
  }

  for (const request of requests.filter((r) => r.format !== 'matching')) {
    let made = 0;
    for (const question of pool) {
      if (made >= request.count) break;
      if (used.has(question.id)) continue;
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
      used.add(question.id);
      items.push(item);
      made++;
    }
  }

  return shuffleWith(items, rand);
}
