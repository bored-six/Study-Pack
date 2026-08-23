/**
 * Streaks are computed from attempt timestamps, never stored — there is
 * nothing to keep in sync and nothing to corrupt.
 */

/** Days since epoch in the device's local timezone. */
function localDayIndex(timestamp: number): number {
  const date = new Date(timestamp);
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / 86_400_000);
}

export interface Streaks {
  /**
   * Consecutive days with at least one attempt, counting back from today.
   * A streak with no attempt yet today is still alive until midnight, so it
   * counts back from yesterday instead of resetting to zero.
   */
  current: number;
  longest: number;
}

export function computeStreaks(timestamps: readonly number[], now = Date.now()): Streaks {
  const days = new Set(timestamps.map(localDayIndex));
  if (days.size === 0) return { current: 0, longest: 0 };

  const today = localDayIndex(now);
  let cursor = days.has(today) ? today : today - 1;
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor--;
  }

  const sorted = [...days].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sorted) {
    run = previous != null && day === previous + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }

  return { current, longest };
}
