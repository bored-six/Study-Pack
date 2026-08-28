import type { ExamItem } from '../exam';
import type { AnswerRecord } from '../mastery';
import {
  advanceQueue,
  estimateLabel,
  estimateSeconds,
  fullRequests,
  MODE_ORDER,
  MODES,
  paperSeconds,
  questionSeconds,
  RETIRE_AT,
  startQueue,
  SURVIVAL_STRIKES,
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
        expect(spec.id).toBe('survival');
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


describe('every mode has an identity, not just rules', () => {
  it.each(MODE_ORDER)('%s says what it is called and what it prints on', (id) => {
    const spec = MODES[id];
    for (const field of ['edge', 'paper', 'unit', 'units', 'verb', 'stamp', 'countsHint', 'hud'] as const) {
      expect(typeof spec[field]).toBe('string');
      expect(spec[field].length).toBeGreaterThan(0);
    }
  });

  it('gives each mode its own start button, so no two read the same', () => {
    const verbs = MODE_ORDER.map((id) => MODES[id].verb);
    expect(new Set(verbs).size).toBe(verbs.length);
  });

  it('gives each mode its own progress readout', () => {
    const huds = MODE_ORDER.map((id) => MODES[id].hud);
    expect(new Set(huds).size).toBe(huds.length);
  });

  it('pairs the readout with the rule it is reporting on', () => {
    // A readout that disagrees with the rule is worse than none at all.
    expect(MODES.mastery.hud).toBe('pile');
    expect(MODES.mastery.repetition).toBe('until_retired');
    expect(MODES.survival.hud).toBe('lives');
    expect(MODES.survival.repetition).toBe('until_out');
    expect(MODES.rapid.hud).toBe('fuse');
    expect(MODES.rapid.clock).toBe('per_question');
    expect(MODES.simulation.hud).toBe('paper');
    expect(MODES.simulation.clock).toBe('whole');
  });
});

describe('how long a paper will take', () => {
  const TEN_CHOICE = { multiple_choice: 10 } as const;

  it('has nothing to estimate for an empty paper', () => {
    expect(estimateSeconds('relaxed', {})).toBe(0);
    expect(estimateLabel('relaxed', {})).toBeNull();
  });

  it('refuses to promise an end for survival', () => {
    expect(estimateSeconds('survival', TEN_CHOICE)).toBeNull();
    expect(estimateLabel('survival', TEN_CHOICE)).toBeNull();
  });

  it('holds a sprint to what its own clock allows', () => {
    // Ten multiple choice at fifteen seconds each is two and a half minutes,
    // not the five the flat half-a-minute-each estimate used to claim.
    expect(estimateSeconds('rapid', TEN_CHOICE)).toBe(questionSeconds('multiple_choice') * 10);
    expect(estimateSeconds('rapid', TEN_CHOICE)!).toBeLessThan(
      estimateSeconds('relaxed', TEN_CHOICE)!
    );
  });

  it('gives a sealed paper the same allowance the clock will', () => {
    expect(estimateSeconds('simulation', TEN_CHOICE)).toBe(
      questionSeconds('multiple_choice') * 10 * 2
    );
  });

  it('expects mastery to take longer than one pass, because it is more than one pass', () => {
    expect(estimateSeconds('mastery', TEN_CHOICE)!).toBeGreaterThan(
      estimateSeconds('relaxed', TEN_CHOICE)!
    );
  });

  it('reads a short paper in seconds and a long one in minutes', () => {
    expect(estimateLabel('rapid', { true_false: 4 })).toMatch(/sec$/);
    expect(estimateLabel('relaxed', TEN_CHOICE)).toBe('about 5 min');
  });
});
