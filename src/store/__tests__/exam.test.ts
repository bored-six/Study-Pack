import {
  getDeckById,
  listAnswersForDeck,
  listQuestions,
  saveAnswers,
  saveAttempt,
} from '@/lib/db';
import { emptyDraft, gradeDraft, type DraftValue } from '@/lib/draft';
import { SURVIVAL_STRIKES } from '@/lib/mode';
import type { Deck, Question, QuestionKind } from '@/lib/types';
import { useExamStore } from '@/store/exam';

// Hoisted above the imports by babel, so the store never touches SQLite.
jest.mock('@/lib/db', () => ({
  getDeckById: jest.fn(),
  listQuestions: jest.fn(),
  listAnswersForDeck: jest.fn(),
  saveAttempt: jest.fn(async () => 77),
  saveAnswers: jest.fn(async () => undefined),
}));


const DECK: Deck = {
  id: 'note:1',
  categoryId: 0,
  name: 'Biology',
  difficulty: 'easy',
  questionCount: 6,
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

const QUESTIONS = [1, 2, 3, 4, 5, 6].map(definition);

const mocked = {
  getDeckById: getDeckById as jest.Mock,
  listQuestions: listQuestions as jest.Mock,
  listAnswersForDeck: listAnswersForDeck as jest.Mock,
  saveAttempt: saveAttempt as jest.Mock,
  saveAnswers: saveAnswers as jest.Mock,
};

/** Loads a deck and picks a mode, leaving the store ready to start. */
async function open(answers: Awaited<ReturnType<typeof listAnswersForDeck>> = []) {
  mocked.getDeckById.mockResolvedValue(DECK);
  mocked.listQuestions.mockResolvedValue(QUESTIONS);
  mocked.listAnswersForDeck.mockResolvedValue(answers);
  await useExamStore.getState().load(DECK.id);
  return useExamStore.getState();
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.saveAttempt.mockResolvedValue(77);
  useExamStore.getState().reset();
});

describe('loading', () => {
  it('opens on the mode picker with a sensible default paper', async () => {
    const state = await open();
    expect(state.status).toBe('setup');
    expect(state.mode).toBe('relaxed');
    expect(useExamStore.getState().total()).toBeGreaterThan(0);
  });

  it('refuses a subject with no questions', async () => {
    mocked.getDeckById.mockResolvedValue(DECK);
    mocked.listQuestions.mockResolvedValue([]);
    mocked.listAnswersForDeck.mockResolvedValue([]);
    await useExamStore.getState().load(DECK.id);
    expect(useExamStore.getState().status).toBe('error');
  });
});

describe('take your time', () => {
  it('walks the paper once and writes the sitting down', async () => {
    await open();
    const store = useExamStore.getState();
    store.setMode('relaxed');
    store.setCount('multiple_choice', 4);
    store.start();

    expect(useExamStore.getState().status).toBe('active');
    const total = useExamStore.getState().items.length;
    expect(total).toBe(4);

    for (let i = 0; i < total; i++) {
      const seen = useExamStore.getState().current();
      expect(seen).not.toBeNull();
      await useExamStore.getState().answer(i % 2 === 0);
    }

    const done = useExamStore.getState();
    expect(done.status).toBe('finished');
    expect(done.results).toHaveLength(total);
    expect(mocked.saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ deckId: DECK.id, total, score: 2 })
    );
    // Every answer reaches mastery, which is what later papers draw on.
    expect(mocked.saveAnswers).toHaveBeenCalledWith(77, DECK.id, expect.any(Array));
    expect(mocked.saveAnswers.mock.calls[0][2]).toHaveLength(total);
  });

  it('never shows the same item twice', async () => {
    await open();
    useExamStore.getState().setMode('relaxed');
    useExamStore.getState().setCount('multiple_choice', 5);
    useExamStore.getState().start();

    const seen: string[] = [];
    while (useExamStore.getState().status === 'active') {
      seen.push(useExamStore.getState().current()!.id);
      await useExamStore.getState().answer(true);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('mastery', () => {
  it('keeps a missed item coming back until it is right twice running', async () => {
    await open();
    useExamStore.getState().setMode('mastery');
    useExamStore.getState().setCount('multiple_choice', 3);
    useExamStore.getState().start();

    const target = useExamStore.getState().current()!.id;
    await useExamStore.getState().answer(false);
    expect(useExamStore.getState().retired).toBe(0);

    let sightings = 0;
    let turns = 0;
    while (useExamStore.getState().status === 'active' && turns < 100) {
      const here = useExamStore.getState().current()!.id;
      if (here === target) sightings++;
      await useExamStore.getState().answer(true);
      turns++;
    }

    // Missed once, so it had to be answered correctly twice more after that.
    expect(sightings).toBe(2);
    expect(useExamStore.getState().status).toBe('finished');
  });

  it('ends only when the pile is empty, and counts what it retired', async () => {
    await open();
    useExamStore.getState().setMode('mastery');
    useExamStore.getState().setCount('multiple_choice', 4);
    useExamStore.getState().start();
    const size = useExamStore.getState().items.length;

    let turns = 0;
    while (useExamStore.getState().status === 'active' && turns < 200) {
      expect(useExamStore.getState().queue.length).toBeGreaterThan(0);
      await useExamStore.getState().answer(true);
      turns++;
    }

    const done = useExamStore.getState();
    expect(done.queue).toHaveLength(0);
    expect(done.retired).toBe(size);
    // Two correct answers each, so the paper is longer than the pile.
    expect(done.results.length).toBe(size * 2);
  });

  it('bumps the visit counter so a repeat starts on a clean answer', async () => {
    await open();
    useExamStore.getState().setMode('mastery');
    useExamStore.getState().setCount('multiple_choice', 3);
    useExamStore.getState().start();

    const before = useExamStore.getState().visits;
    await useExamStore.getState().answer(false);
    expect(useExamStore.getState().visits).toBeGreaterThan(before);
  });
});

describe('beat the clock', () => {
  it('marks a timed-out question wrong but keeps it out of mastery', async () => {
    await open();
    useExamStore.getState().setMode('rapid');
    useExamStore.getState().setCount('multiple_choice', 3);
    useExamStore.getState().start();

    await useExamStore.getState().answer(false, true);
    await useExamStore.getState().answer(true);
    await useExamStore.getState().answer(true);

    const done = useExamStore.getState();
    expect(done.status).toBe('finished');
    expect(done.results.filter((r) => r.correct)).toHaveLength(2);
    // The score says three questions; mastery only hears about the two
    // that were actually answered.
    expect(mocked.saveAttempt).toHaveBeenCalledWith(expect.objectContaining({ total: 3, score: 2 }));
    expect(mocked.saveAnswers.mock.calls[0][2]).toHaveLength(2);
  });
});

describe('exam simulation', () => {
  it('holds answers while you move around the paper', async () => {
    await open();
    useExamStore.getState().setMode('simulation');
    useExamStore.getState().setCount('multiple_choice', 4);
    useExamStore.getState().start();

    const items = useExamStore.getState().items;
    const first = items[0];
    const answer: DraftValue = { kind: 'choice', picked: first.format === 'multiple_choice' ? first.options[0] : null };

    useExamStore.getState().setDraft(first.id, answer);
    useExamStore.getState().goTo(3);
    useExamStore.getState().goTo(0);

    expect(useExamStore.getState().drafts[first.id]).toEqual(answer);
    expect(useExamStore.getState().current()!.id).toBe(first.id);
  });

  it('puts a whole-paper clock on the sitting and nothing per question', async () => {
    await open();
    useExamStore.getState().setMode('simulation');
    useExamStore.getState().setCount('multiple_choice', 4);
    useExamStore.getState().start();
    const { paperDeadline, startedAt } = useExamStore.getState();
    expect(paperDeadline).not.toBeNull();
    expect(paperDeadline!).toBeGreaterThan(startedAt);
  });

  it('clamps navigation to the paper', async () => {
    await open();
    useExamStore.getState().setMode('simulation');
    useExamStore.getState().setCount('multiple_choice', 3);
    useExamStore.getState().start();

    useExamStore.getState().goTo(-5);
    expect(useExamStore.getState().index).toBe(0);
    useExamStore.getState().goTo(99);
    expect(useExamStore.getState().index).toBe(2);
  });

  it('remembers flags and lets them be taken back', async () => {
    await open();
    useExamStore.getState().setMode('simulation');
    useExamStore.getState().setCount('multiple_choice', 3);
    useExamStore.getState().start();
    const id = useExamStore.getState().items[1].id;

    useExamStore.getState().toggleFlag(id);
    expect(useExamStore.getState().flagged).toEqual([id]);
    useExamStore.getState().toggleFlag(id);
    expect(useExamStore.getState().flagged).toEqual([]);
  });

  it('marks the whole paper at once, blanks included', async () => {
    await open();
    useExamStore.getState().setMode('simulation');
    useExamStore.getState().setCount('multiple_choice', 4);
    useExamStore.getState().start();

    const items = useExamStore.getState().items;
    // Answer three, right, wrong, right — and leave the fourth blank.
    items.slice(0, 3).forEach((item, i) => {
      if (item.format !== 'multiple_choice') return;
      const picked =
        i === 1 ? item.options.find((o) => o !== item.correctAnswer)! : item.correctAnswer;
      useExamStore.getState().setDraft(item.id, { kind: 'choice', picked });
    });

    await useExamStore.getState().submitPaper();

    const done = useExamStore.getState();
    expect(done.status).toBe('finished');
    expect(done.results).toHaveLength(4);
    expect(done.results.filter((r) => r.correct)).toHaveLength(2);
    expect(done.results[3].correct).toBe(false);
    // The blank scores nothing but says nothing about what you know either.
    expect(mocked.saveAnswers.mock.calls[0][2]).toHaveLength(3);
  });

  it('grades every draft the same way the question screen would have', async () => {
    await open();
    useExamStore.getState().setMode('simulation');
    useExamStore.getState().setCount('multiple_choice', 3);
    useExamStore.getState().start();

    const items = useExamStore.getState().items;
    items.forEach((item) => useExamStore.getState().setDraft(item.id, emptyDraft(item)));
    await useExamStore.getState().submitPaper();

    const drafts = useExamStore.getState().drafts;
    useExamStore.getState().results.forEach((result, i) => {
      expect(result.correct).toBe(gradeDraft(items[i], drafts[items[i].id]));
    });
  });
});

describe('survival', () => {
  it('ends on the third miss, not before', async () => {
    await open();
    useExamStore.getState().setMode('survival');
    useExamStore.getState().start();

    for (let i = 1; i < SURVIVAL_STRIKES; i++) {
      await useExamStore.getState().answer(false);
      expect(useExamStore.getState().status).toBe('active');
      expect(useExamStore.getState().strikes).toBe(i);
    }

    await useExamStore.getState().answer(false);
    expect(useExamStore.getState().status).toBe('finished');
    expect(useExamStore.getState().strikes).toBe(SURVIVAL_STRIKES);
  });

  it('draws more questions rather than running dry', async () => {
    await open();
    useExamStore.getState().setMode('survival');
    useExamStore.getState().start();
    const firstRound = useExamStore.getState().items.length;

    for (let i = 0; i < firstRound + 2; i++) {
      await useExamStore.getState().answer(true);
    }

    const state = useExamStore.getState();
    expect(state.status).toBe('active');
    expect(state.items.length).toBeGreaterThan(firstRound);
    expect(state.round).toBeGreaterThan(0);
    // A second-round repeat is still its own question as far as results go.
    expect(new Set(state.results.map((r) => r.itemId)).size).toBe(state.results.length);
  });

  it('records the run even though it ended in failure', async () => {
    await open();
    useExamStore.getState().setMode('survival');
    useExamStore.getState().start();

    await useExamStore.getState().answer(true);
    await useExamStore.getState().answer(false);
    await useExamStore.getState().answer(false);
    await useExamStore.getState().answer(false);

    expect(mocked.saveAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ total: 4, score: 1, deckId: DECK.id })
    );
  });
});

describe('leaving and coming back', () => {
  it('clears the sitting so the next one starts clean', async () => {
    await open();
    useExamStore.getState().setMode('survival');
    useExamStore.getState().start();
    await useExamStore.getState().answer(false);

    useExamStore.getState().reset();
    const state = useExamStore.getState();
    expect(state.status).toBe('idle');
    expect(state.items).toHaveLength(0);
    expect(state.strikes).toBe(0);
    expect(state.drafts).toEqual({});
    expect(state.flagged).toEqual([]);
    expect(state.mode).toBe('relaxed');
  });
});
