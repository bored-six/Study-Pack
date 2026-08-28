/**
 * Every sticker has to be reachable, and none may fall out of a fresh
 * install. A predicate that can never fire is a promise the app cannot
 * keep; one that fires on an empty context hands out a keepsake for
 * nothing.
 */
import { ACHIEVEMENTS, detectUnlocks, type AchievementContext } from '@/lib/achievements';

const blank: AchievementContext = {
  now: Date.UTC(2026, 0, 14, 14, 0),
  hourOfDay: 14,
  streak: 0,
  totalAttempts: 0,
  totalAnswers: 0,
  subjectPercents: [],
  subjectCount: 0,
  perfectRounds: 0,
  distinctStudyDays: 0,
  attemptsToday: 0,
  daysSinceLastStudy: null,
  weekendPair: false,
  keptPlan: false,
  plansKeptTotal: 0,
  clearedWeakSubject: false,
  score: 0,
  total: 0,
};

/** Every id unlocked by a context, ignoring which note was picked. */
function fired(ctx: AchievementContext): Set<string> {
  return new Set(detectUnlocks(ctx, [], (notes) => notes[0]).map((u) => u.id));
}

/** Contexts between them exercising every predicate in the set. */
const SCENARIOS: Record<string, AchievementContext> = {
  everything: {
    ...blank,
    hourOfDay: 5,
    streak: 365,
    totalAttempts: 300,
    totalAnswers: 900,
    subjectPercents: [92, 95, 88],
    subjectCount: 3,
    perfectRounds: 9,
    distinctStudyDays: 200,
    attemptsToday: 6,
    daysSinceLastStudy: 40,
    weekendPair: true,
    keptPlan: true,
    plansKeptTotal: 20,
    clearedWeakSubject: true,
    score: 10,
    total: 10,
  },
  roughDay: { ...blank, totalAttempts: 4, score: 1, total: 10 },
  nightOwl: { ...blank, totalAttempts: 4, hourOfDay: 1 },
};

describe('every sticker is attainable', () => {
  it('nothing falls out of a fresh install', () => {
    expect([...fired(blank)]).toEqual([]);
  });

  it('the very first round earns exactly the first-round sticker', () => {
    const first: AchievementContext = {
      ...blank,
      totalAttempts: 1,
      totalAnswers: 5,
      subjectCount: 1,
      subjectPercents: [12],
      distinctStudyDays: 1,
      attemptsToday: 1,
      streak: 1,
      score: 3,
      total: 5,
    };
    expect([...fired(first)].sort()).toEqual(['first-quiz', 'first-subject']);
  });

  it('every single one can be reached by some run of the app', () => {
    const reachable = new Set<string>();
    for (const ctx of Object.values(SCENARIOS)) {
      for (const id of fired(ctx)) reachable.add(id);
    }
    const unreachable = ACHIEVEMENTS.filter((a) => !reachable.has(a.id)).map((a) => a.id);
    expect(unreachable).toEqual([]);
  });

  /**
   * subjectCount counts every note subject, including ones with no
   * questions; subjectPercents counts only the ones that can be scored.
   * Guarding these on the former let an empty .every() hand out full
   * mastery to somebody with two empty subjects.
   */
  it('does not award full mastery for subjects that have no questions', () => {
    const twoEmptySubjects: AchievementContext = {
      ...blank,
      totalAttempts: 1,
      subjectCount: 2,
      subjectPercents: [],
    };
    const ids = fired(twoEmptySubjects);
    expect(ids.has('all-steady')).toBe(false);
    expect(ids.has('all-solid')).toBe(false);
  });

  it('never awards a sticker twice', () => {
    const ctx = SCENARIOS.everything;
    const first = detectUnlocks(ctx, [], (n) => n[0]);
    const again = detectUnlocks(ctx, first, (n) => n[0]);
    expect(again).toEqual([]);
  });
});
