/**
 * Every mode, played start to finish.
 *
 * The other store tests check one rule each. These play each of the five
 * modes the way a student does — pick it, build it, answer until it ends —
 * and check that it ends, that it ends for the right reason, and that the
 * sitting is written down. A mode that never terminates, or that quietly
 * stops recording, passes every rule test and is still broken.
 *
 * Each mode is played twice: once answering everything right, once
 * answering everything wrong. Those are the two ends of the range, and
 * they are where the non-termination bugs live.
 */

import {
  getDeckById,
  listAnswersForDeck,
  listQuestions,
  saveAnswers,
  saveAttempt,
} from '@/lib/db';
import { emptyDraft, type DraftValue } from '@/lib/draft';
import type { ExamItem } from '@/lib/exam';
import {
  MODES,
  MODE_ORDER,
  SURVIVAL_STRIKES,
  paperSeconds,
  type ExamMode,
} from '@/lib/mode';
import type { Deck, Question, QuestionKind } from '@/lib/types';
import { useExamStore } from '@/store/exam';

const mockSettings = new Map<string, string>();

jest.mock('@/lib/db', () => ({
  getDeckById: jest.fn(),
  listQuestions: jest.fn(),
  listAnswersForDeck: jest.fn(),
  saveAttempt: jest.fn(async () => 77),
  saveAnswers: jest.fn(async () => undefined),
  listAnswers: jest.fn(async () => []),
  listAttempts: jest.fn(async () => []),
  listAttemptTimestamps: jest.fn(async () => []),
  listQuestionIdsBySubject: jest.fn(async () => ({})),
  listSchedules: jest.fn(async () => []),
  listDecks: jest.fn(async () => []),
  readSetting: async (key: string) => mockSettings.get(key) ?? null,
  writeSetting: async (key: string, value: string) => {
    mockSettings.set(key, value);
  },
}));

const DECK: Deck = {
  id: 'note:1',
  categoryId: 0,
  name: 'Biology',
  difficulty: 'easy',
  questionCount: 10,
  source: 'notes',
  color: null,
  icon: null,
  downloadedAt: 1,
};

function definition(n: number): Question {
  return {
    id: `q${n}`,
    deckId: DECK.id,
    position: n,
    prompt: `Which term means: definition ${n}?`,
    correctAnswer: `Term${n}`,
    answers: [`Term${n}`, 'Osmosis', 'Mitosis', 'Glycolysis'],
    kind: 'definition' as QuestionKind,
    sourceLine: `Term${n}: definition ${n}`,
    ordered: false,
  };
}

const QUESTIONS = Array.from({ length: 10 }, (_, i) => definition(i + 1));

const mocked = {
  getDeckById: getDeckById as jest.Mock,
  listQuestions: listQuestions as jest.Mock,
  listAnswersForDeck: listAnswersForDeck as jest.Mock,
  saveAttempt: saveAttempt as jest.Mock,
  saveAnswers: saveAnswers as jest.Mock,
};

/** How many answers a runaway mode is allowed before we call it broken. */
const RUNAWAY = 400;

/**
 * Two of the five are endless under one of the two extremes, on purpose:
 * survival only ends when you run out of lives, so a perfect player never
 * finishes, and mastery only ends when the pile empties, so a player who
 * never gets one right never finishes either. Both are derived from the
 * spec rather than listed by hand, so a new mode joins the right group by
 * declaring its repetition rather than by someone remembering to edit this.
 */
const ENDS_ON_A_PERFECT_RUN = MODE_ORDER.filter(
  (mode) => MODES[mode].repetition !== 'until_out'
);
const ENDS_ON_A_TERRIBLE_RUN = MODE_ORDER.filter(
  (mode) => MODES[mode].repetition !== 'until_retired'
);

/** The way to answer that reaches the end in this mode, whatever it is. */
function terminatingAnswer(mode: ExamMode): boolean {
  return MODES[mode].repetition !== 'until_out';
}

/** A filled-in answer, right or deliberately wrong. These papers are all choice. */
function filledDraft(item: ExamItem, correct: boolean): DraftValue {
  if (item.format !== 'multiple_choice') return emptyDraft(item);
  const wrong = item.options.find((option) => option !== item.correctAnswer);
  return { kind: 'choice', picked: correct ? item.correctAnswer : (wrong ?? null) };
}

async function open() {
  mocked.getDeckById.mockResolvedValue(DECK);
  mocked.listQuestions.mockResolvedValue(QUESTIONS);
  mocked.listAnswersForDeck.mockResolvedValue([]);
  await useExamStore.getState().load(DECK.id);
}

/**
 * Sets a mode up the way its own screen would, and starts it.
 *
 * Survival builds its own paper, so the format form never runs for it —
 * asking for counts there would be testing a screen that doesn't exist.
 */
async function begin(mode: ExamMode, perFormat = 5) {
  await open();
  useExamStore.getState().setMode(mode);
  if (!MODES[mode].autoBuild) {
    useExamStore.getState().setOnly('multiple_choice', perFormat);
  }
  useExamStore.getState().start();
  return useExamStore.getState();
}

/**
 * Answers until the sitting ends, the way the run screen does.
 *
 * A withheld paper is never answered one at a time — it is filled in and
 * submitted — so that path is played through its own route.
 */
async function playOut(correct: boolean): Promise<number> {
  let turns = 0;
  const spec = MODES[useExamStore.getState().mode];

  if (spec.feedback === 'deferred') {
    const { items } = useExamStore.getState();
    for (const item of items) {
      useExamStore.getState().setDraft(item.id, filledDraft(item, correct));
      turns += 1;
    }
    await useExamStore.getState().submitPaper();
    return turns;
  }

  while (useExamStore.getState().status === 'active' && turns < RUNAWAY) {
    expect(useExamStore.getState().current()).not.toBeNull();
    await useExamStore.getState().answer(correct);
    turns += 1;
  }
  return turns;
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.saveAttempt.mockResolvedValue(77);
  useExamStore.getState().reset();
  mockSettings.clear();
});

describe('every mode, played to the end', () => {
  it.each(ENDS_ON_A_PERFECT_RUN)('%s finishes when everything is right', async (mode) => {
    await begin(mode);
    expect(useExamStore.getState().status).toBe('active');

    const turns = await playOut(true);

    const done = useExamStore.getState();
    expect(done.status).toBe('finished');
    expect(turns).toBeLessThan(RUNAWAY);
    expect(done.results.length).toBeGreaterThan(0);
    expect(done.results.every((r) => r.correct)).toBe(true);
  });

  it.each(ENDS_ON_A_TERRIBLE_RUN)('%s finishes when everything is wrong', async (mode) => {
    await begin(mode);

    const turns = await playOut(false);

    const done = useExamStore.getState();
    expect(done.status).toBe('finished');
    expect(turns).toBeLessThan(RUNAWAY);
    expect(done.results.length).toBeGreaterThan(0);
    expect(done.results.every((r) => r.correct)).toBe(false);
  });

  it.each(MODE_ORDER)('%s writes the sitting down', async (mode) => {
    await begin(mode);
    await playOut(terminatingAnswer(mode));

    expect(useExamStore.getState().status).toBe('finished');

    expect(mocked.saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ deckId: DECK.id })
    );
    // The answer log is what mastery reads; a mode that skips it silently
    // stops the next paper from knowing what you already know.
    expect(mocked.saveAnswers).toHaveBeenCalledWith(77, DECK.id, expect.any(Array));
    expect(mocked.saveAnswers.mock.calls[0][2].length).toBeGreaterThan(0);
  });

  it.each(MODE_ORDER)('%s starts a clock only if it said it would', async (mode) => {
    await begin(mode);
    const { paperDeadline, items, startedAt } = useExamStore.getState();

    if (MODES[mode].clock === 'whole') {
      expect(paperDeadline).not.toBeNull();
      expect(paperDeadline).toBe(startedAt + paperSeconds(items) * 1000);
    } else {
      expect(paperDeadline).toBeNull();
    }
  });

  it('survival never ends on its own while you keep getting them right', async () => {
    await begin('survival');

    for (let i = 0; i < 40; i++) await useExamStore.getState().answer(true);

    // Endless by design — the only exit is running out of lives.
    expect(useExamStore.getState().status).toBe('active');
    expect(useExamStore.getState().strikes).toBe(0);
  });

  it.each(MODE_ORDER)('%s always has something to show', async (mode) => {
    await begin(mode);
    let turns = 0;
    while (useExamStore.getState().status === 'active' && turns < 25) {
      // The run screen falls back to a spinner on a null item, so a mode
      // that hands one back mid-sitting looks like a hang.
      expect(useExamStore.getState().current()).not.toBeNull();
      await useExamStore.getState().answer(turns % 3 !== 0);
      turns += 1;
    }
    expect(turns).toBeGreaterThan(0);
  });
});

describe('what each mode promises', () => {
  it('take your time asks each page exactly once', async () => {
    await begin('relaxed', 6);
    const size = useExamStore.getState().items.length;
    const seen: string[] = [];

    while (useExamStore.getState().status === 'active') {
      seen.push(useExamStore.getState().current()!.id);
      await useExamStore.getState().answer(true);
    }

    expect(seen).toHaveLength(size);
    expect(new Set(seen).size).toBe(size);
  });

  it('mastery empties the pile and retires every card', async () => {
    await begin('mastery', 4);
    const size = useExamStore.getState().items.length;

    await playOut(true);

    const done = useExamStore.getState();
    expect(done.queue).toHaveLength(0);
    expect(done.retired).toBe(size);
    // Right twice to retire, so a perfect run is exactly two passes.
    expect(done.results).toHaveLength(size * 2);
  });

  it('mastery keeps a card that is always missed from ending the sitting early', async () => {
    await begin('mastery', 3);

    let turns = 0;
    while (useExamStore.getState().status === 'active' && turns < 30) {
      await useExamStore.getState().answer(false);
      turns += 1;
    }
    // Nothing is ever right, so nothing retires and the pile never empties.
    expect(useExamStore.getState().status).toBe('active');
    expect(useExamStore.getState().retired).toBe(0);
    expect(useExamStore.getState().queue.length).toBeGreaterThan(0);
  });

  it('beat the clock counts a timed-out question as missed, and not as evidence', async () => {
    await begin('rapid', 3);

    await useExamStore.getState().answer(false, true);

    const state = useExamStore.getState();
    expect(state.results[0].correct).toBe(false);
    // The clock took it off you, so it says nothing about what you know.
    expect(state.answerLog).toHaveLength(0);
  });

  it('exam simulation withholds marks until the paper is handed in', async () => {
    await begin('simulation', 4);
    const { items } = useExamStore.getState();

    useExamStore.getState().setDraft(items[0].id, filledDraft(items[0], true));
    // Nothing is marked while the paper is still open.
    expect(useExamStore.getState().results).toHaveLength(0);

    await useExamStore.getState().submitPaper();

    const done = useExamStore.getState();
    expect(done.status).toBe('finished');
    expect(done.results).toHaveLength(items.length);
    // Blanks score wrong, but only what was actually attempted reaches mastery.
    expect(done.results.filter((r) => r.correct)).toHaveLength(1);
    expect(done.answerLog).toHaveLength(1);
  });

  it('survival ends on the third miss and not before', async () => {
    await begin('survival');

    for (let i = 0; i < SURVIVAL_STRIKES - 1; i++) {
      await useExamStore.getState().answer(false);
      expect(useExamStore.getState().status).toBe('active');
    }
    await useExamStore.getState().answer(false);

    expect(useExamStore.getState().status).toBe('finished');
    expect(useExamStore.getState().strikes).toBe(SURVIVAL_STRIKES);
  });

  it('survival keeps dealing rather than running out of questions', async () => {
    await begin('survival');
    const dealt = useExamStore.getState().items.length;

    for (let i = 0; i < dealt + 5; i++) {
      await useExamStore.getState().answer(true);
      expect(useExamStore.getState().status).toBe('active');
    }

    const state = useExamStore.getState();
    expect(state.items.length).toBeGreaterThan(dealt);
    expect(state.round).toBeGreaterThan(0);
    // A redrawn item is still its own question, so nothing collides.
    expect(new Set(state.items.map((i) => i.id)).size).toBe(state.items.length);
  });
});

describe('switching between modes', () => {
  it('leaves no trace of the last mode on the next one', async () => {
    await begin('survival');
    await useExamStore.getState().answer(false);
    await useExamStore.getState().answer(false);

    await begin('relaxed', 3);

    const fresh = useExamStore.getState();
    expect(fresh.strikes).toBe(0);
    expect(fresh.round).toBe(0);
    expect(fresh.queue).toHaveLength(0);
    expect(fresh.results).toHaveLength(0);
    expect(fresh.retired).toBe(0);
  });

  it('rebuilds the pile when mastery is picked after a straight paper', async () => {
    await begin('relaxed', 3);
    expect(useExamStore.getState().queue).toHaveLength(0);

    await begin('mastery', 3);
    expect(useExamStore.getState().queue).toHaveLength(3);
  });
});
