/**
 * Answer checking for typed formats (identification, fill the blank,
 * modified true/false, enumeration).
 *
 * Case, spacing, and surrounding punctuation are noise and get normalised
 * away. Spelling is not — a misspelled term is wrong, because spelling the
 * term is part of knowing it. When a wrong answer is *close*, we say so, so
 * the student sees what slipped rather than just a red mark.
 */

/** Words that carry no meaning at the front of a typed answer. */
const LEADING_ARTICLES = /^(?:the|a|an)\s+/i;

export function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”"'’]/g, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace(LEADING_ARTICLES, '')
    .replace(/\s+/g, ' ');
}

/**
 * The same answer with its plurals and verb agreement levelled out.
 *
 * "Heart pumps blood" and "Hearts pump blood" are one fact written two ways,
 * and marking the second wrong teaches nothing except to copy the note
 * verbatim. Spelling still matters — this only strips a trailing s, so
 * "mitosis" and "meiosis" stay different words.
 */
export function looseAnswer(value: string): string {
  return normalizeAnswer(value)
    .split(' ')
    .map((word) =>
      word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word
    )
    .join(' ');
}

/** Levenshtein distance, capped — we only care about "nearly right". */
function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
    if (Math.min(...current) > cap) return cap + 1;
  }
  return previous[b.length];
}

export interface AnswerCheck {
  correct: boolean;
  /**
   * True when the answer was wrong but within a character or two — a
   * misspelling rather than a different answer. Still counts as wrong.
   */
  nearMiss: boolean;
}

export function checkAnswer(typed: string, expected: string): AnswerCheck {
  const a = normalizeAnswer(typed);
  const b = normalizeAnswer(expected);
  if (!a) return { correct: false, nearMiss: false };
  if (a === b) return { correct: true, nearMiss: false };
  // Singular against plural, "pumps" against "pump" — the same answer.
  if (looseAnswer(typed) === looseAnswer(expected)) return { correct: true, nearMiss: false };

  // Numbers are exact or nothing; "36" and "35" are different facts.
  if (/^\d+$/.test(b)) return { correct: false, nearMiss: false };

  const allowed = b.length >= 8 ? 2 : 1;
  return { correct: false, nearMiss: editDistance(a, b, allowed) <= allowed };
}

export interface EnumerationCheck {
  /** One entry per expected item, in the order given. */
  results: { expected: string; matched: string | null; nearMiss: boolean }[];
  correct: boolean;
  matchedCount: number;
}

/**
 * Checks a list answer. Each typed entry is consumed by at most one expected
 * item, so repeating the same answer can't fill two slots.
 */
export function checkEnumeration(
  typed: readonly string[],
  expected: readonly string[],
  ordered = false
): EnumerationCheck {
  const remaining = typed.map((t) => ({ value: t, used: false }));

  const results = expected.map((item, index) => {
    if (ordered) {
      const entry = remaining[index];
      if (!entry || entry.used) return { expected: item, matched: null, nearMiss: false };
      const check = checkAnswer(entry.value, item);
      entry.used = true;
      return {
        expected: item,
        matched: check.correct ? entry.value : null,
        nearMiss: check.nearMiss,
      };
    }

    const exact = remaining.find((e) => !e.used && checkAnswer(e.value, item).correct);
    if (exact) {
      exact.used = true;
      return { expected: item, matched: exact.value, nearMiss: false };
    }
    const near = remaining.find((e) => !e.used && checkAnswer(e.value, item).nearMiss);
    if (near) {
      near.used = true;
      return { expected: item, matched: null, nearMiss: true };
    }
    return { expected: item, matched: null, nearMiss: false };
  });

  const matchedCount = results.filter((r) => r.matched != null).length;
  return { results, correct: matchedCount === expected.length, matchedCount };
}
