/**
 * Fisher-Yates shuffle. Returns a new array; the input is untouched.
 *
 * Answer order is shuffled ONCE at download time and stored, never at render
 * time — shuffling in render makes options jump around on re-render, and a
 * frozen order keeps the quiz deterministic offline.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
