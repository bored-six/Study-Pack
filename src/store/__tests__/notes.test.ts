import { readWithAI, type AiReading } from '@/lib/aiNotes';
import { LIMITS, type ParsedQuestion } from '@/lib/noteParser';
import { useNotesStore } from '@/store/notes';

jest.mock('@/lib/db', () => ({
  addQuestionsToDeck: jest.fn(async () => undefined),
  createSubject: jest.fn(async () => 'note:1'),
  deleteDeck: jest.fn(async () => undefined),
  listAnswerPool: jest.fn(async () => []),
  listDecks: jest.fn(async () => []),
}));

// Only the one function that reaches out is replaced; the failure messages
// and the reason reader are the real ones, so the sentences a student would
// actually see are the sentences under test.
jest.mock('@/lib/aiNotes', () => ({
  ...jest.requireActual('@/lib/aiNotes'),
  readWithAI: jest.fn(),
}));

const mockedRead = readWithAI as jest.MockedFunction<typeof readWithAI>;
/** A failure shaped exactly like the one a dropped connection produces. */
const offline = jest.requireActual('@/lib/aiNotes').aiFailure.bind(null, 'offline') as () => Error;

/**
 * Enough definitions that the parser can borrow three wrong answers for each
 * — under about five terms it skips every one of them as `no_options` — plus
 * a heading it drops as `too_short`, which is the line a rescue is offered
 * for. Parses to seven questions and one skip.
 */
const NOTES = [
  'Cell Biology',
  'Mitochondria: the powerhouse of the cell',
  'Osmosis: water moving across a membrane',
  'Diffusion: particles spreading from high to low',
  'Chloroplast: where photosynthesis happens',
  'Ribosome: builds proteins from amino acids',
  'Vacuole: storage sac inside a plant cell',
  'It was all rather more complicated than anyone had expected at the time',
].join('\n');

function question(answer: string, sourceLine: string | null = null): ParsedQuestion {
  return {
    prompt: `What is ${answer}?`,
    correctAnswer: answer,
    answers: [answer, 'a', 'b', 'c'],
    kind: 'definition',
    sourceLine,
  };
}

function reading(questions: ParsedQuestion[], left = 9): AiReading {
  return { questions, credits: { left, of: 10 } };
}

beforeEach(() => {
  mockedRead.mockReset();
  useNotesStore.setState({
    subjects: [],
    targetId: null,
    draft: [],
    stats: null,
    source: null,
    rescuing: false,
    rescueAdded: null,
    rescueError: null,
    credits: null,
  });
});

describe('keeping the notes a draft came from', () => {
  it('remembers what was pasted, so a rescue has something to send', () => {
    useNotesStore.getState().parse(NOTES);
    expect(useNotesStore.getState().source).toBe(NOTES);
  });

  it('forgets them once the draft is thrown away', () => {
    useNotesStore.getState().parse(NOTES);
    useNotesStore.getState().clearDraft();
    expect(useNotesStore.getState().source).toBeNull();
  });

  it('opens a new scan without the last scan\'s outcome', () => {
    useNotesStore.getState().parse(NOTES);
    useNotesStore.setState({ rescueAdded: 4, rescueError: 'stale' });

    useNotesStore.getState().parse(NOTES);

    expect(useNotesStore.getState().rescueAdded).toBeNull();
    expect(useNotesStore.getState().rescueError).toBeNull();
  });

  it('has nothing to send for a hand-written question', () => {
    useNotesStore.getState().stageCustom(question('Photosynthesis'), 'note:1');
    expect(useNotesStore.getState().source).toBeNull();
  });
});

describe('when a reading does not arrive', () => {
  it('leaves the parser\'s work exactly as it was', async () => {
    mockedRead.mockRejectedValue(offline());

    const parsed = useNotesStore.getState().parse(NOTES);
    const before = useNotesStore.getState();
    const draftBefore = before.draft;
    const statsBefore = before.stats;

    await useNotesStore.getState().rescue();

    const after = useNotesStore.getState();
    expect(after.draft).toEqual(draftBefore);
    expect(after.stats).toEqual(statsBefore);
    expect(after.draft).toHaveLength(parsed.questions.length);
    expect(after.rescuing).toBe(false);
  });

  it('says what happened, and that it cost nothing', async () => {
    mockedRead.mockRejectedValue(offline());

    useNotesStore.getState().parse(NOTES);
    await useNotesStore.getState().rescue();

    expect(useNotesStore.getState().rescueError).toBe(
      "Needs internet. Try again when you're back — nothing was used up."
    );
    // No reading was reported, so nothing is claimed about what is left.
    expect(useNotesStore.getState().credits).toBeNull();
    expect(useNotesStore.getState().rescueAdded).toBeNull();
  });
});

describe('merging a reading in', () => {
  it('keeps the parser\'s questions and appends the new ones', async () => {
    useNotesStore.getState().parse(NOTES);
    const parsedCount = useNotesStore.getState().draft.length;
    mockedRead.mockResolvedValue(reading([question('Entropy'), question('Enthalpy')]));

    await useNotesStore.getState().rescue();

    const { draft, rescueAdded, credits } = useNotesStore.getState();
    expect(draft).toHaveLength(parsedCount + 2);
    expect(draft.slice(-2).map((q) => q.correctAnswer)).toEqual(['Entropy', 'Enthalpy']);
    expect(rescueAdded).toBe(2);
    expect(credits).toEqual({ left: 9, of: 10 });
  });

  it('drops a question the parser already asked', async () => {
    useNotesStore.getState().parse(NOTES);
    const existing = useNotesStore.getState().draft[0].correctAnswer;
    mockedRead.mockResolvedValue(reading([question(existing), question('Entropy')]));

    await useNotesStore.getState().rescue();

    expect(useNotesStore.getState().rescueAdded).toBe(1);
    expect(
      useNotesStore.getState().draft.filter((q) => q.correctAnswer === existing)
    ).toHaveLength(1);
  });

  it('drops a repeat inside the reading itself', async () => {
    useNotesStore.getState().parse(NOTES);
    mockedRead.mockResolvedValue(reading([question('Entropy'), question('entropy')]));

    await useNotesStore.getState().rescue();

    expect(useNotesStore.getState().rescueAdded).toBe(1);
  });

  it('stops at maxQuestions, because the review screen has to be finishable', async () => {
    useNotesStore.getState().parse(NOTES);
    const parsedCount = useNotesStore.getState().draft.length;
    const flood = Array.from({ length: LIMITS.maxQuestions + 20 }, (_, i) => question(`Term ${i}`));
    mockedRead.mockResolvedValue(reading(flood));

    await useNotesStore.getState().rescue();

    const { draft, stats } = useNotesStore.getState();
    expect(draft).toHaveLength(LIMITS.maxQuestions);
    expect(useNotesStore.getState().rescueAdded).toBe(LIMITS.maxQuestions - parsedCount);
    expect(stats?.cappedQuestions).toBe(true);
  });

  it('stops calling a rescued line skipped', async () => {
    useNotesStore.getState().parse(NOTES);
    const skipped = useNotesStore.getState().stats?.skipped ?? [];
    const usedBefore = useNotesStore.getState().stats?.linesUsed ?? 0;
    expect(skipped.length).toBeGreaterThan(0);

    mockedRead.mockResolvedValue(reading([question('Complication', skipped[0].text)]));
    await useNotesStore.getState().rescue();

    const after = useNotesStore.getState().stats?.skipped ?? [];
    expect(after).toHaveLength(skipped.length - 1);
    expect(after.map((line) => line.text)).not.toContain(skipped[0].text);
    expect(useNotesStore.getState().stats?.linesUsed).toBe(usedBefore + 1);
  });
});

describe('guards', () => {
  it('does nothing when there are no notes behind the draft', async () => {
    useNotesStore.getState().stageCustom(question('Photosynthesis'), 'note:1');
    await useNotesStore.getState().rescue();
    expect(mockedRead).not.toHaveBeenCalled();
  });

  it('ignores a second press while one is already in flight', async () => {
    useNotesStore.getState().parse(NOTES);
    let release: (value: AiReading) => void = () => {};
    mockedRead.mockReturnValue(
      new Promise<AiReading>((resolve) => {
        release = resolve;
      })
    );

    const first = useNotesStore.getState().rescue();
    await useNotesStore.getState().rescue();
    expect(mockedRead).toHaveBeenCalledTimes(1);

    release(reading([question('Entropy')]));
    await first;
    expect(useNotesStore.getState().rescuing).toBe(false);
  });
});
