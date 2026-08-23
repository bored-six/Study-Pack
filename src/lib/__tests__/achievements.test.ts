import {
  ACHIEVEMENTS,
  achievementById,
  detectUnlocks,
  type AchievementContext,
  type Unlock,
} from '../achievements';

const NOW = new Date(2026, 7, 24, 19).getTime();

function ctx(over: Partial<AchievementContext> = {}): AchievementContext {
  return {
    now: NOW,
    hourOfDay: 19,
    streak: 2,
    totalAttempts: 3,
    totalAnswers: 30,
    subjectPercents: [40],
    subjectCount: 1,
    perfectRounds: 0,
    distinctStudyDays: 3,
    attemptsToday: 1,
    daysSinceLastStudy: 1,
    weekendPair: false,
    keptPlan: false,
    plansKeptTotal: 0,
    clearedWeakSubject: false,
    score: 6,
    total: 10,
    ...over,
  };
}

const firstNote = (notes: string[]) => notes[0];

describe('definitions', () => {
  it('has a real set to find', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(25);
  });

  it('every achievement has at least one hand-written note', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.notes.length).toBeGreaterThan(0);
      for (const note of a.notes) expect(note.length).toBeGreaterThan(40);
    }
  });

  it('ids are unique', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('detectUnlocks', () => {
  it('unlocks the basics for a modest early context', () => {
    const ids = detectUnlocks(ctx(), [], firstNote).map((u) => u.id);
    expect(ids).toContain('first-quiz');
    expect(ids).toContain('first-subject');
    expect(ids).not.toContain('ten-quizzes');
    expect(ids).not.toContain('solid');
  });

  it('never unlocks the same achievement twice', () => {
    const already: Unlock[] = [{ id: 'first-quiz', at: NOW - 1000, note: 'x' }];
    const ids = detectUnlocks(ctx(), already, firstNote).map((u) => u.id);
    expect(ids).not.toContain('first-quiz');
  });

  it('keeps the chosen note on the unlock', () => {
    const unlocks = detectUnlocks(ctx(), [], firstNote);
    const first = unlocks.find((u) => u.id === 'first-quiz');
    expect(first?.note).toBe(achievementById('first-quiz')!.notes[0]);
  });

  it('notices a perfect round and a rough one, but never both at once', () => {
    const perfect = detectUnlocks(ctx({ score: 10, total: 10 }), [], firstNote);
    expect(perfect.map((u) => u.id)).toContain('perfect');

    const rough = detectUnlocks(ctx({ score: 2, total: 10 }), [], firstNote);
    expect(rough.map((u) => u.id)).toContain('rough-day');
    expect(rough.map((u) => u.id)).not.toContain('perfect');
  });

  it('mastery achievements read the subject percentages', () => {
    const ids = detectUnlocks(
      ctx({ subjectPercents: [88, 63], subjectCount: 2 }),
      [],
      firstNote
    ).map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining(['getting-there', 'solid', 'all-steady']));
  });

  it('all-steady requires every subject, not just one', () => {
    const ids = detectUnlocks(
      ctx({ subjectPercents: [88, 20], subjectCount: 2 }),
      [],
      firstNote
    ).map((u) => u.id);
    expect(ids).not.toContain('all-steady');
  });

  it('honours plans, fire, and the stubborn questions', () => {
    const ids = detectUnlocks(
      ctx({ keptPlan: true, streak: 7, clearedWeakSubject: true }),
      [],
      firstNote
    ).map((u) => u.id);
    expect(ids).toEqual(
      expect.arrayContaining(['kept-plan', 'week-fire', 'weak-cleared'])
    );
  });

  it('a fully unlocked set yields nothing', () => {
    const all: Unlock[] = ACHIEVEMENTS.map((a) => ({ id: a.id, at: NOW, note: 'x' }));
    expect(detectUnlocks(ctx({ streak: 200, totalAttempts: 999 }), all, firstNote)).toEqual([]);
  });
});
