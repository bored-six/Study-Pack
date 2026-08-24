/**
 * A question the student wrote themselves.
 *
 * The parser reads notes and works out both halves of a question. Here the
 * student supplies the halves that matter — the question and the right
 * answer — and only the wrong answers are ours to find. Those still come
 * from `suggestDistractors`, borrowing terms the subject already holds, so
 * a hand-written question sits beside a parsed one without looking different.
 *
 * Everything here is deterministic and offline. Nothing is invented that the
 * student can't see and edit before it is saved.
 */

import { seededShuffle, type ParsedQuestion } from './noteParser';

export const CUSTOM_LIMITS = {
  /** Longer than this stops fitting on a phone screen as a question. */
  maxPromptChars: 300,
  /** Short enough to sit on an option button. */
  maxAnswerChars: 80,
  /** Wrong answers per question — four options in all. */
  decoyCount: 3,
} as const;

/** Why a hand-written question can't be built yet. */
export type CustomIssue =
  | 'no_prompt'
  | 'no_answer'
  | 'prompt_too_long'
  | 'answer_too_long'
  | 'missing_decoys'
  | 'repeated_option';

/** Plain-language reasons, shown under the field they belong to. */
export const CUSTOM_ISSUE_LABEL: Record<CustomIssue, string> = {
  no_prompt: 'Write the question first.',
  no_answer: 'Write the right answer.',
  prompt_too_long: `Keep the question under ${CUSTOM_LIMITS.maxPromptChars} characters — longer ones don't fit on a phone.`,
  answer_too_long: `Keep the answer under ${CUSTOM_LIMITS.maxAnswerChars} characters so it fits on a button.`,
  missing_decoys: 'Three wrong answers are needed — fill in the empty ones.',
  repeated_option: 'Two options are the same. Every option has to be different.',
};

export interface CustomInput {
  prompt: string;
  answer: string;
  /** Wrong answers exactly as they appear on screen; blanks are unfilled. */
  decoys: readonly string[];
}

export interface CustomBuild {
  /** Null whenever `issues` is non-empty. */
  question: ParsedQuestion | null;
  issues: CustomIssue[];
  /**
   * The question contains its own answer. Worth a nudge rather than a block —
   * sometimes a term genuinely belongs in the question it's asked about.
   */
  givesItselfAway: boolean;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Case- and space-blind identity, so "ATP " and "atp" are one option. */
function sameOption(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Validates what the student typed and, when it holds together, assembles
 * the same shape the parser produces so both save through one path.
 */
export function buildCustomQuestion(input: CustomInput): CustomBuild {
  const prompt = collapse(input.prompt);
  const answer = collapse(input.answer);
  const written = input.decoys.map(collapse).filter((decoy) => decoy.length > 0);

  const issues: CustomIssue[] = [];
  if (!prompt) issues.push('no_prompt');
  else if (prompt.length > CUSTOM_LIMITS.maxPromptChars) issues.push('prompt_too_long');
  if (!answer) issues.push('no_answer');
  else if (answer.length > CUSTOM_LIMITS.maxAnswerChars) issues.push('answer_too_long');

  // A repeat is a different fault from a blank, and telling them apart is
  // the difference between "type more" and "change one of these".
  const decoys: string[] = [];
  let repeated = false;
  for (const decoy of written) {
    const clash =
      (answer.length > 0 && sameOption(decoy, answer)) ||
      decoys.some((kept) => sameOption(kept, decoy));
    if (clash) repeated = true;
    else decoys.push(decoy);
  }
  if (repeated) issues.push('repeated_option');
  if (decoys.length < CUSTOM_LIMITS.decoyCount) issues.push('missing_decoys');

  const givesItselfAway =
    answer.length >= 3 && prompt.toLowerCase().includes(answer.toLowerCase());

  if (issues.length > 0) return { question: null, issues, givesItselfAway };

  return {
    question: {
      prompt,
      correctAnswer: answer,
      answers: seededShuffle(
        [answer, ...decoys.slice(0, CUSTOM_LIMITS.decoyCount)],
        `${prompt}|${answer}`
      ),
      // Definition is the kind whose answer is a short term you could be
      // asked to name, which is what a hand-written Q&A is.
      kind: 'definition',
      // Deliberately absent. True/false and matching rebuild a sentence out
      // of this, and there is no way to turn an arbitrary question into a
      // declarative statement without putting words in the student's mouth.
      // Multiple choice and identification need no such thing.
      sourceLine: null,
      ordered: false,
    },
    issues: [],
    givesItselfAway,
  };
}
