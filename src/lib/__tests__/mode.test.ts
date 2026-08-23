import { buildOnePerQuestion, type ExamItem } from '../exam';
import type { AnswerRecord } from '../mastery';
import {
  advanceQueue,
  fullRequests,
  MODE_ORDER,
  MODES,
  paperSeconds,
  questionSeconds,
  RETIRE_AT,
  startQueue,
  SURVIVAL_STRIKES,
  weakestQuestions,
  type QueueEntry,
} from '../mode';
import type { Question, QuestionKind } from '../types';

let counter = 0;
function question(partial: Partial<Question> & { kind: QuestionKind }): Question {
  counter++;
  return {
    id: `q${counter}`,
    deckId: 'note:1',
    position: counter,
    prompt: 'Which term means: a test definition?',
    correctAnswer: 'Osmosis',
    answers: ['Osmosis', 'Mitosis', 'Glycolysis', 'Diffusion'],
    sourceLine: 'Osmosis is a test definition.',
    ordered: false,
    ...partial,
  };
}

const DEFINITION = () =>
  question({
    kind: 'definition',
    prompt: 'Which term means: the green pigment that absorbs light?',
    correctAnswer: 'Chlorophyll',
    answers: ['Chlorophyll', 'Osmosis', 'Mitosis', 'Glycolysis'],
    sourceLine: 'Chlorophyll: the green pigment that absorbs light',
  });

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

function answered(questionId: string, correct: boolean, daysAgo = 0): AnswerRecord {
  return { questionId, correct, answeredAt: NOW - daysAgo * DAY };
}

describe('mode specs', () => {
  it('lists every mode exactly once, in a stable order', () => {
    expect([...MODE_ORDER].sort()).toEqual(Object.keys(MODES).sort());
    expect(new Set(MODE_ORDER).size).toBe(MODE_ORDER.length);
  });

  it('only lets a mode skip the format form when it picks its own questions', () => {
    for (const spec of Object.values(MODES)) {
      if (spec.autoBuild) {
        expect(['weak_spots', 'survival']).toContain(spec.id);
      }
    }
  });

  it('withholds the verdict only where there is a whole-paper clock to justify it', () => {
    const deferred = Object.values(MODES).filter((m) => m.feedback === 'deferred');
    expect(deferred.map((m) => m.id)).toEqual(['simulation']);
    expect(deferred[0].clock).toBe('whole');
  });
});

describe('mastery queue', () => {
  // Only the id matters to the pile; the rest of an item never reaches it.
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(
    (id) => ({ id }) as unknown as ExamItem
  );

  it('starts every item at zero', () => {
    expect(startQueue(items)).toEqual(items.map((i) => ({ itemId: i.id, streak: 0 })));
  });

  it('retires an item only after two correct answers in a row', () => {
    let queue = startQueue(items);
    const first = queue[0].itemId;

    queue = advanceQueue(queue, true);
    expect(queue.map((e) => e.itemId)).toContain(first);

    // Walk it back to the front, then get it right a second time.
    while (queue[0].itemId !== first) queue = advanceQueue(queue, true);
    queue = advanceQueue(queue, true);
    expect(queue.map((e) => e.itemId)).not.toContain(first);
  });

  it('needs exactly RETIRE_AT in a row, and a miss resets the streak', () => {
    let queue: QueueEntry[] = [{ itemId: 'a', streak: RETIRE_AT - 1 }];
    expect(advanceQueue(queue, false)).toEqual([{ itemId: 'a', streak: 0 }]);
    expect(advanceQueue(queue, true)).toEqual([]);
  });

  it('brings a missed item back soon, but never immediately next', () => {
    const queue = startQueue(items);
    const missed = queue[0].itemId;
    const next = advanceQueue(queue, false);
    expect(next[0].itemId).not.toBe(missed);
    expect(next.indexOf(next.find((e) => e.itemId === missed)!)).toBeLessThan(4);
  });

  it('leaves a half-learned item further back than a missed one', () => {
    const queue = startQueue(items);
    const head = queue[0].itemId;
    const afterMiss = advanceQueue(queue, false).findIndex((e) => e.itemId === head);
    const afterHit = advanceQueue(queue, true).findIndex((e) => e.itemId === head);
    expect(afterHit).toBeGreaterThan(afterMiss);
  });

  it('keeps a lone unretired item in play rather than ending early', () => {
    const queue: QueueEntry[] = [{ itemId: 'a', streak: 0 }];
    expect(advanceQueue(queue, false)).toEqual([{ itemId: 'a', streak: 0 }]);
  });

  it('empties on the last retirement, which is what ends the session', () => {
    expect(advanceQueue([{ itemId: 'a', streak: RETIRE_AT - 1 }], true)).toEqual([]);
    expect(advanceQueue([], true)).toEqual([]);
  });

  it('always converges when every answer is right', () => {
    let queue = startQueue(items);
    let turns = 0;
    while (queue.length > 0 && turns < 500) {
      queue = advanceQueue(queue, true);
      turns++;
    }
    expect(queue).toHaveLength(0);
    expect(turns).toBe(items.length * RETIRE_AT);
  });
});

describe('clocks', () => {
  it('gives a true/false less time than a matching grid', () => {
    expect(questionSeconds('true_false')).toBeLessThan(questionSeconds('matching'));
  });

  it('gives a whole paper more time than the same items would get in a sprint', () => {
    const items = [{ format: 'multiple_choice' }, { format: 'enumeration' }] as unknown as
      ExamItem[];
    const sprint = questionSeconds('multiple_choice') + questionSeconds('enumeration');
    expect(paperSeconds(items)).toBeGreaterThan(sprint);
  });

  it('never hands out a paper with under a minute on it', () => {
    expect(paperSeconds([])).toBeGreaterThanOrEqual(60);
  });
});

describe('survival', () => {
  it('takes three misses', () => {
    expect(SURVIVAL_STRIKES).toBe(3);
  });

  it('asks for every item the deck can produce', () => {
    const questions = [DEFINITION(), DEFINITION(), DEFINITION()];
    const requests = fullRequests(questions);
    expect(requests.length).toBeGreaterThan(1);
    expect(requests.every((r) => r.count > 0)).toBe(true);
    expect(requests.map((r) => r.format)).toContain('multiple_choice');
  });

  it('asks for nothing from an empty deck rather than throwing', () => {
    expect(fullRequests([])).toEqual([]);
  });
});

describe('weakest questions', () => {
  const pool = ['a', 'b', 'c'].map((id) => ({ ...DEFINITION(), id }));

  it('puts a question you keep missing ahead of one you have never tried', () => {
    const answers = [
      answered('a', false),
      answered('a', false),
      answered('c', true),
      answered('c', true),
      answered('c', true),
      answered('c', true),
    ];
    expect(weakestQuestions(pool, answers, 3, NOW).map((q) => q.id)).toEqual(['a', 'b', 'c']);
  });

  it('puts an untried question ahead of one already known', () => {
    const known = [answered('c', true), answered('c', true), answered('c', true), answered('c', true)];
    const order = weakestQuestions([pool[1], pool[2]], known, 2, NOW).map((q) => q.id);
    expect(order).toEqual(['b', 'c']);
  });

  it('honours the limit', () => {
    expect(weakestQuestions(pool, [], 2, NOW)).toHaveLength(2);
  });

  it('still returns something on a deck that has never been sat', () => {
    expect(weakestQuestions(pool, [], 15, NOW)).toHaveLength(3);
  });

  it('builds exactly one item per question it picks', () => {
    const chosen = weakestQuestions(pool, [], 3, NOW);
    const items = buildOnePerQuestion(chosen, 'seed');
    expect(items).toHaveLength(3);
    expect(new Set(items.map((i) => i.questionId)).size).toBe(3);
  });

  it('keeps the worst-first order it was given', () => {
    const answers = [answered('c', false), answered('c', false)];
    const chosen = weakestQuestions(pool, answers, 3, NOW);
    const items = buildOnePerQuestion(chosen, 'seed');
    expect(items[0].questionId).toBe('c');
  });

  it('prefers recall over recognition when a question supports both', () => {
    const items = buildOnePerQuestion([DEFINITION()], 'seed');
    expect(items[0].format).toBe('identification');
  });
});
