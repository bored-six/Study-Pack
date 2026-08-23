import {
  masteryLabel,
  questionMastery,
  subjectMastery,
  weakSpots,
  WEAK_THRESHOLD,
  type AnswerRecord,
} from '../mastery';

const NOW = new Date(2026, 7, 24, 12).getTime();
const DAY = 86_400_000;

function answer(
  questionId: string,
  correct: boolean,
  daysAgo = 0
): AnswerRecord {
  return { questionId, correct, answeredAt: NOW - daysAgo * DAY };
}

describe('questionMastery', () => {
  it('is zero for a question never answered', () => {
    const m = questionMastery([], NOW);
    expect(m.score).toBe(0);
    expect(m.attempts).toBe(0);
    expect(m.lastAnsweredAt).toBeNull();
  });

  it('does not treat one lucky answer as mastery', () => {
    const m = questionMastery([answer('q1', true)], NOW);
    expect(m.score).toBeCloseTo(0.4, 2);
  });

  it('climbs with repeated correct answers but never reaches 1 quickly', () => {
    const history = [
      answer('q1', true, 4),
      answer('q1', true, 3),
      answer('q1', true, 2),
      answer('q1', true, 1),
      answer('q1', true, 0),
    ];
    const m = questionMastery(history, NOW);
    expect(m.score).toBeGreaterThan(0.9);
    expect(m.score).toBeLessThan(1);
  });

  it('drops sharply after a miss', () => {
    const good = questionMastery(
      [answer('q1', true, 2), answer('q1', true, 1), answer('q1', true, 0)],
      NOW
    );
    const thenMissed = questionMastery(
      [
        answer('q1', true, 3),
        answer('q1', true, 2),
        answer('q1', true, 1),
        answer('q1', false, 0),
      ],
      NOW
    );
    expect(thenMissed.score).toBeLessThan(good.score);
    expect(thenMissed.missedLast).toBe(true);
  });

  it('fades when a question is left alone, but never to nothing', () => {
    const fresh = questionMastery([answer('q1', true, 0)], NOW);
    const fading = questionMastery([answer('q1', true, 10)], NOW);
    const ancient = questionMastery([answer('q1', true, 900)], NOW);

    expect(fading.score).toBeLessThan(fresh.score);
    expect(ancient.score).toBeLessThan(fading.score);
    expect(ancient.score).toBeGreaterThan(0);
  });

  it('stops fading at the floor, roughly a month out', () => {
    // A 0.45 floor on a 50-day slope bottoms out at ~28 days, so anything
    // past that is equally stale — six weeks is no worse than two years.
    const sixWeeks = questionMastery([answer('q1', true, 42)], NOW);
    const twoYears = questionMastery([answer('q1', true, 730)], NOW);
    expect(sixWeeks.score).toBeCloseTo(twoYears.score, 6);
  });

  it('reads answers in chronological order regardless of input order', () => {
    const forwards = questionMastery([answer('q1', false, 1), answer('q1', true, 0)], NOW);
    const backwards = questionMastery([answer('q1', true, 0), answer('q1', false, 1)], NOW);
    expect(forwards.score).toBeCloseTo(backwards.score, 6);
    expect(backwards.missedLast).toBe(false);
  });
});

describe('subjectMastery', () => {
  const ids = ['q1', 'q2', 'q3', 'q4'];

  it('is zero for a subject nobody has studied', () => {
    const m = subjectMastery('deck', 'Biology', ids, [], NOW);
    expect(m.percent).toBe(0);
    expect(m.unseen).toBe(4);
  });

  it('averages across every question, not just the answered ones', () => {
    // Perfect on one of four questions is a quarter of the way at best.
    const answers = [answer('q1', true, 2), answer('q1', true, 1), answer('q1', true, 0)];
    const m = subjectMastery('deck', 'Biology', ids, answers, NOW);
    expect(m.percent).toBeGreaterThan(15);
    expect(m.percent).toBeLessThan(25);
    expect(m.unseen).toBe(3);
  });

  it('falls when new notes are added, because there is more to learn', () => {
    const answers = ids.flatMap((id) => [answer(id, true, 1), answer(id, true, 0)]);
    const before = subjectMastery('deck', 'Biology', ids, answers, NOW);
    const after = subjectMastery('deck', 'Biology', [...ids, 'q5', 'q6'], answers, NOW);
    expect(after.percent).toBeLessThan(before.percent);
  });

  it('counts weak questions separately from unseen ones', () => {
    const answers = [answer('q1', false, 0), answer('q2', true, 0)];
    const m = subjectMastery('deck', 'Biology', ids, answers, NOW);
    expect(m.unseen).toBe(2);
    expect(m.weak).toBe(2); // q1 missed, q2 at 0.4 is still under the bar
  });

  it('handles an empty subject without dividing by zero', () => {
    expect(subjectMastery('deck', 'Empty', [], [], NOW).percent).toBe(0);
  });
});

describe('weakSpots', () => {
  it('returns only seen questions below the threshold, worst first', () => {
    const answers = [
      answer('strong', true, 2),
      answer('strong', true, 1),
      answer('strong', true, 0),
      answer('weak', false, 0),
      answer('middling', true, 0),
    ];
    const spots = weakSpots(answers, NOW);
    expect(spots.map((s) => s.questionId)).toEqual(['weak', 'middling']);
    expect(spots[0].score).toBeLessThan(spots[1].score);
    spots.forEach((spot) => expect(spot.score).toBeLessThan(WEAK_THRESHOLD));
  });

  it('is empty when nothing has been answered', () => {
    expect(weakSpots([], NOW)).toEqual([]);
  });
});

describe('masteryLabel', () => {
  it('bands the number into plain language', () => {
    expect(masteryLabel(95)).toBe('Solid');
    expect(masteryLabel(70)).toBe('Getting there');
    expect(masteryLabel(40)).toBe('Shaky');
    expect(masteryLabel(5)).toBe('Just started');
  });
});
