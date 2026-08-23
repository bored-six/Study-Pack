import { computeStreaks } from '../streak';

/** Noon local time on the given day — safely inside any DST shift. */
function day(year: number, month: number, date: number): number {
  return new Date(year, month, date, 12, 0, 0).getTime();
}

const NOW = day(2026, 7, 23); // Aug 23, 2026

describe('computeStreaks', () => {
  it('returns zeros with no attempts', () => {
    expect(computeStreaks([], NOW)).toEqual({ current: 0, longest: 0 });
  });

  it('counts a single attempt today as a 1-day streak', () => {
    expect(computeStreaks([NOW], NOW)).toEqual({ current: 1, longest: 1 });
  });

  it('counts consecutive days back from today', () => {
    const stamps = [day(2026, 7, 21), day(2026, 7, 22), day(2026, 7, 23)];
    expect(computeStreaks(stamps, NOW)).toEqual({ current: 3, longest: 3 });
  });

  it('keeps the streak alive when today has no attempt yet', () => {
    const stamps = [day(2026, 7, 21), day(2026, 7, 22)];
    expect(computeStreaks(stamps, NOW).current).toBe(2);
  });

  it('resets the current streak after a missed day', () => {
    const stamps = [day(2026, 7, 19), day(2026, 7, 20), day(2026, 7, 23)];
    const result = computeStreaks(stamps, NOW);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(2);
  });

  it('drops the current streak to zero when the last attempt is older than yesterday', () => {
    const stamps = [day(2026, 7, 18), day(2026, 7, 19), day(2026, 7, 20)];
    const result = computeStreaks(stamps, NOW);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(3);
  });

  it('counts several attempts on the same day once', () => {
    const stamps = [
      day(2026, 7, 23),
      day(2026, 7, 23) + 60_000,
      day(2026, 7, 23) + 120_000,
      day(2026, 7, 22),
    ];
    expect(computeStreaks(stamps, NOW)).toEqual({ current: 2, longest: 2 });
  });

  it('finds the longest run anywhere in history', () => {
    const stamps = [
      day(2026, 6, 1),
      day(2026, 6, 2),
      day(2026, 6, 3),
      day(2026, 6, 4),
      day(2026, 6, 5),
      day(2026, 7, 23),
    ];
    const result = computeStreaks(stamps, NOW);
    expect(result.longest).toBe(5);
    expect(result.current).toBe(1);
  });
});
