/**
 * The card at the end, once per mode.
 *
 * The numbers on it were already mode-aware — survival counts how long you
 * lasted, mastery how much of the pile went. What it did not do was look
 * like the game it came out of: one "REPORT CARD" heading, one coral rule
 * and the theme's own colours, whichever of the five you had just played.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import ExamResultsScreen from '../exam/results';
import { MODES, MODE_ORDER, type ExamMode } from '@/lib/mode';
import type { Deck, Question } from '@/lib/types';
import { useExamStore } from '@/store/exam';

const mockSettings = new Map<string, string>();

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  Redirect: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/sfx', () => ({ playSfx: jest.fn(), setSfxEnabled: jest.fn() }));
jest.mock('@/lib/haptics', () => ({
  tapThud: jest.fn(),
  tapTier: jest.fn(),
  setHapticsEnabled: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  getDeckById: jest.fn(),
  listQuestions: jest.fn(),
  listAnswersForDeck: jest.fn(),
  saveAttempt: jest.fn(async () => 1),
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('@/lib/db');

const DECK: Deck = {
  id: 'note:1',
  categoryId: 0,
  name: 'Biology',
  difficulty: 'easy',
  questionCount: 12,
  source: 'notes',
  color: null,
  icon: null,
  downloadedAt: 1,
};

const QUESTIONS: Question[] = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  deckId: DECK.id,
  position: i,
  prompt: `Which term means: definition ${i}?`,
  correctAnswer: `Term${i}`,
  answers: [`Term${i}`, 'Osmosis', 'Mitosis', 'Glycolysis'],
  kind: 'definition',
  sourceLine: `Term${i}: definition ${i}`,
  ordered: false,
}));

function textOf(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  return '';
}

function screen(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => textOf(node.props.children))
    .join(' | ');
}

function labels(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll((n) => typeof n.props?.accessibilityLabel === 'string')
    .map((n) => n.props.accessibilityLabel as string);
}

/**
 * Plays a whole sitting in this mode and mounts the card it ends on.
 *
 * `answer` decides how it is played: survival only ever ends by losing, so
 * a perfect run there would never reach the results screen at all.
 */
async function finish(mode: ExamMode): Promise<ReactTestRenderer> {
  db.getDeckById.mockResolvedValue(DECK);
  db.listQuestions.mockResolvedValue(QUESTIONS);
  db.listAnswersForDeck.mockResolvedValue([]);

  await act(async () => {
    await useExamStore.getState().load(DECK.id);
  });
  act(() => {
    useExamStore.getState().setMode(mode);
    if (!MODES[mode].autoBuild) useExamStore.getState().setOnly('multiple_choice', 6);
    useExamStore.getState().start();
  });

  const spec = MODES[mode];
  await act(async () => {
    if (spec.feedback === 'deferred') {
      await useExamStore.getState().submitPaper();
      return;
    }
    // Right for every mode that ends on a full pass; wrong for survival,
    // which ends only when the lives run out.
    const correct = spec.repetition !== 'until_out';
    let turns = 0;
    while (useExamStore.getState().status === 'active' && turns < 200) {
      await useExamStore.getState().answer(correct);
      turns += 1;
    }
  });
  expect(useExamStore.getState().status).toBe('finished');

  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<ExamResultsScreen />);
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  db.saveAttempt.mockResolvedValue(1);
  mockSettings.clear();
  act(() => useExamStore.getState().reset());
});

describe('the card at the end wears the mode', () => {
  it.each(MODE_ORDER)('%s heads the card with its own name for it', async (mode) => {
    const tree = await finish(mode);
    expect(screen(tree)).toContain(MODES[mode].reportTitle);
  });

  it.each(MODE_ORDER)('%s carries the crest and the stamp', async (mode) => {
    const tree = await finish(mode);
    expect(labels(tree)).toContain(`Mode: ${MODES[mode].name}`);
    expect(screen(tree)).toContain(MODES[mode].stamp);
    expect(screen(tree)).toContain('Biology');
  });

  it('gives each mode a heading no other mode uses', () => {
    const titles = MODE_ORDER.map((id) => MODES[id].reportTitle);
    expect(new Set(titles).size).toBe(titles.length);
    // A survival run is not a report card, and should never say it is.
    expect(MODES.survival.reportTitle).not.toContain('REPORT');
  });
});

describe('the number the card leads on', () => {
  it('a straight sitting leads on the score', async () => {
    const tree = await finish('relaxed');
    expect(screen(tree)).toContain('6/6');
    expect(screen(tree)).toContain('100% correct');
  });

  it('mastery leads on what left the pile, not a score', async () => {
    const tree = await finish('mastery');
    const shown = screen(tree);
    expect(shown).toContain('retired from the pile');
    expect(shown).not.toContain('% correct');
  });

  it('survival leads on how far you got', async () => {
    const tree = await finish('survival');
    const shown = screen(tree);
    expect(shown).toMatch(/questions? survived/);
    expect(shown).not.toContain('% correct');
  });

  it('a sealed paper comes back marked, question by question', async () => {
    const tree = await finish('simulation');
    expect(screen(tree)).toContain('YOUR PAPER, MARKED');
  });

  it('a marked-as-you-go paper gets the go-back list instead', async () => {
    const tree = await finish('relaxed');
    // Everything was right, so there is nothing to go back over — and the
    // section hides rather than showing an empty heading.
    expect(screen(tree)).not.toContain('WHAT TO GO BACK OVER');
    expect(screen(tree)).not.toContain('YOUR PAPER, MARKED');
  });
});
