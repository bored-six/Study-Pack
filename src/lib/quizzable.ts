/**
 * Whether a line is worth being asked about at all.
 *
 * Two things a note contains that look like facts to a regex but aren't:
 *
 *   - an illustration ("Example: The wind whispered through the alley")
 *     demonstrates the fact stated near it, so testing its contents tests
 *     the example rather than the idea;
 *   - a heading ("The eight most common figures of speech") names a topic
 *     and asserts nothing, so there is nothing in it to be right or wrong.
 *
 * The parser already refuses both. These live apart from it because the exam
 * builder has to refuse them too: a deck built before a parser fix still has
 * the old questions in it, and no format should present one.
 */

/** Openings that mark a line as showing rather than telling. */
export const ILLUSTRATION_PREFIX =
  /^(?:examples?\s*[:—-]|for example\b|for instance\b|e\.?g\.?\b|i\.?e\.?\b|such as\b|as in\b)/i;

/**
 * Auxiliaries and copulas: the cheapest reliable sign that a line asserts
 * something rather than just naming a topic.
 */
export const CLAIM_VERB =
  /\b(?:is|are|was|were|be|been|has|have|had|can|cannot|will|would|should|must|may|might|does|do|did|means|refers)\b/i;

export function looksLikeIllustration(text: string): boolean {
  return ILLUSTRATION_PREFIX.test(text.trim());
}

/**
 * A statement makes a claim you could agree or disagree with. Closing
 * punctuation or a verb is enough; a bare noun phrase is not.
 */
export function readsAsStatement(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /[.!?]$/.test(trimmed) || CLAIM_VERB.test(trimmed);
}
