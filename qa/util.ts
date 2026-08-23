/** Small helpers shared by the checks. */

import type { ParsedQuestion } from '../src/lib/noteParser';
import type { Question } from '../src/lib/types';

/**
 * Mirrors the parser's own input cleaning, so "does this text appear in the
 * notes?" compares like with like instead of failing on a curly quote.
 */
export function canonical(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Loose containment: is `needle` somewhere in `haystack`, ignoring noise? */
export function contains(haystack: string, needle: string): boolean {
  const h = canonical(haystack).replace(/[^a-z0-9 ]/g, '');
  const n = canonical(needle).replace(/[^a-z0-9 ]/g, '');
  return n.length > 0 && h.includes(n);
}

export function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

export function percent(part: number, whole: number): string {
  if (whole === 0) return 'n/a';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** The wrong answers for a question. */
export function distractors(question: ParsedQuestion | Question): string[] {
  return question.answers.filter((a) => a !== question.correctAnswer);
}

/**
 * Promotes a parser result into the shape the exam builder and the database
 * expect, so the audit can follow one question through the whole app.
 */
export function toQuestion(parsed: ParsedQuestion, deckId: string, position: number): Question {
  return {
    id: `${deckId}:${position}`,
    deckId,
    position,
    prompt: parsed.prompt,
    correctAnswer: parsed.correctAnswer,
    answers: parsed.answers,
    kind: parsed.kind,
    sourceLine: parsed.sourceLine,
    ordered: parsed.ordered === true,
  };
}

/** Time a synchronous call, in whole milliseconds. */
export function timed<T>(fn: () => T): { result: T; ms: number } {
  const start = Date.now();
  const result = fn();
  return { result, ms: Date.now() - start };
}
