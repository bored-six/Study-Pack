import {
  MAX_SESSION,
  pickQuestions,
  weightFor,
  type Pickable,
} from '../pick';
import type { AnswerRecord } from '../mastery';

const NOW = new Date(2026, 7, 24, 12).getTime();
const DAY = 86_400_000;

function answer(questionId: string, correct: boolean, daysAgo = 0): AnswerRecord {
  return { questionId, correct, answeredAt: NOW - daysAgo * DAY };
}

function deck(size: number): Pickable[] {
  return Array.from({ length: size }, (_, i) => ({ id: `q${i}` }));
}

/**
 * A constant roll makes the sample deterministic: every key becomes
 * c^(1/weight), which is monotonic in weight, so the result is strictly
 * weight-ordered and the weighting itself can be asserted.
 */
const fixedRandom = () => 0.5;

describe('weightFor', () => {
  it('ranks urgency as just-missed, then unseen, then shaky, then known', () => {
    const missed = weightFor([answer('q', false, 1)], NOW);
    const unseen = weightFor([], NOW);
    const shaky = weightFor(
      [answer('q', false, 3), answer('q', false, 2), answer('q', true, 1)],
      NOW
    );
    const known = weightFor(
      [answer('q', true, 3), answer('q', true, 2), answer('q', true, 1)],
      NOW
    );
    expect(missed).toBeGreaterThan(unseen);
    expect(unseen).toBeGreaterThan(shaky);
    expect(shaky).toBeGreaterThan(known);
  });

  it('gives a repeatedly-correct question the smallest weight', () => {
    const known = weightFor(
      [answer('q', true, 3), answer('q', true, 2), answer('q', true, 1)],
      NOW
    );
    const missed = weightFor([answer('q', false, 1)], NOW);
    expect(known).toBeLessThan(missed);
  });

  it('never drops to zero, so a known question can still come round', () => {
    const answers = Array.from({ length: 12 }, (_, i) => answer('q', true, 12 - i));
    expect(weightFor(answers, NOW)).toBeGreaterThan(0);
  });

  it('boosts a question whose last answer was wrong', () => {
    const history = [answer('q', true, 3), answer('q', true, 2)];
    const recovered = weightFor(history, NOW);
    const slipped = weightFor([...history, answer('q', false, 1)], NOW);
    expect(slipped).toBeGreaterThan(recovered);
  });
});

describe('pickQuestions', () => {
  it('returns an empty list for an empty deck', () => {
    expect(pickQuestions([], [], { now: NOW })).toEqual([]);
  });

  it('serves the whole deck when it is smaller than the session', () => {
    const questions = deck(8);
    const picked = pickQuestions(questions, [], { now: NOW, random: fixedRandom });
    expect(picked).toHaveLength(8);
    expect(new Set(picked.map((q) => q.id)).size).toBe(8);
  });

  it('caps a big deck at the session size', () => {
    const picked = pickQuestions(deck(120), [], {
      now: NOW,
      random: fixedRandom,
    });
    expect(picked).toHaveLength(MAX_SESSION);
  });

  it('honours an explicit size', () => {
    expect(pickQuestions(deck(50), [], { size: 5, now: NOW })).toHaveLength(5);
  });

  it('never repeats a question within a session', () => {
    const picked = pickQuestions(deck(60), [], { now: NOW });
    expect(new Set(picked.map((q) => q.id)).size).toBe(picked.length);
  });

  it('puts the weak question ahead of the mastered one', () => {
    const questions: Pickable[] = [{ id: 'known' }, { id: 'weak' }];
    const answers = [
      answer('known', true, 3),
      answer('known', true, 2),
      answer('known', true, 1),
      answer('weak', false, 1),
    ];
    const picked = pickQuestions(questions, answers, {
      now: NOW,
      random: fixedRandom,
    });
    expect(picked.map((q) => q.id)).toEqual(['weak', 'known']);
  });

  it('drops the mastered question first when the session is short', () => {
    const questions: Pickable[] = [{ id: 'known' }, { id: 'unseen' }];
    const answers = [answer('known', true, 2), answer('known', true, 1)];
    const picked = pickQuestions(questions, answers, {
      size: 1,
      now: NOW,
      random: fixedRandom,
    });
    expect(picked.map((q) => q.id)).toEqual(['unseen']);
  });

  it('still varies the order between sessions', () => {
    const questions = deck(20);
    const orders = new Set(
      Array.from({ length: 8 }, () =>
        pickQuestions(questions, [], { now: NOW }).map((q) => q.id).join(',')
      )
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('leaves the input untouched', () => {
    const questions = deck(30);
    const snapshot = questions.map((q) => q.id);
    pickQuestions(questions, [], { now: NOW });
    expect(questions.map((q) => q.id)).toEqual(snapshot);
  });

  it('ignores answers belonging to other questions', () => {
    const picked = pickQuestions(deck(3), [answer('not-in-deck', false)], {
      now: NOW,
      random: fixedRandom,
    });
    expect(picked).toHaveLength(3);
  });
});
