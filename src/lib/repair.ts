/**
 * Recovers the `kind` and `sourceLine` of note questions saved before those
 * columns existed (or before the save path passed them through).
 *
 * Nothing is guessed: the parser writes prompts in fixed shapes, so the shape
 * of a stored prompt says exactly how it was made. A cloze prompt carries a
 * blank; a definition prompt opens with "Which term means"; an enumeration
 * prompt opens with "List the". Anything else is left alone.
 */

import { listItem } from './noteParser';
import type { QuestionKind } from './types';

export interface RepairInput {
  prompt: string;
  correctAnswer: string;
}

export interface Repair {
  kind: QuestionKind;
  sourceLine: string | null;
}

const DEFINITION_MEANS = /^Which term means:\s*(.+?)\?$/;
const DEFINITION_SHORT = /^Which term is short for\s*"?(.+?)"?\?$/;

/** Reads the parser's own output shapes back off a stored prompt. */
export function inferRepair(question: RepairInput): Repair | null {
  const prompt = question.prompt.trim();

  if (prompt.includes('______')) {
    // Filling the blank back in reproduces the sentence it came from.
    return {
      kind: 'cloze',
      sourceLine: prompt.replace(/______/, question.correctAnswer),
    };
  }

  const short = DEFINITION_SHORT.exec(prompt);
  if (short) {
    return {
      kind: 'definition',
      sourceLine: `${question.correctAnswer} stands for ${short[1]}`,
    };
  }

  const means = DEFINITION_MEANS.exec(prompt);
  if (means) {
    return {
      kind: 'definition',
      sourceLine: `${question.correctAnswer}: ${means[1]}`,
    };
  }

  if (/^List the \d+:/.test(prompt)) {
    // The item list lives in answers_json, so no sentence to rebuild.
    return { kind: 'enumeration', sourceLine: null };
  }

  // Not a shape this parser produces — leave it as trivia.
  return null;
}

/**
 * Cleans a stored list whose items were saved before the block splitter
 * dropped leading conjunctions.
 *
 * Questions are parsed once, when the note is added, so fixing the parser
 * does nothing for a deck already on the phone: it kept asking for "and
 * brains control body functions" and marking the student wrong for writing
 * what the list actually is. The rule is imported rather than restated, so
 * a stored list and a fresh one can never disagree about what an item is.
 *
 * Returns null when nothing needed changing, so the caller can skip the write.
 */
export function repairListAnswers(answers: readonly string[]): string[] | null {
  const cleaned = answers.map(listItem).filter(Boolean);
  if (cleaned.length !== answers.length) return null;
  return cleaned.some((item, i) => item !== answers[i]) ? cleaned : null;
}
