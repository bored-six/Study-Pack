import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import ExamSetupScreen from '../exam/[deckId]';
import { useExamStore } from '@/store/exam';
import type { Deck, Question } from '@/lib/types';

const mockSettings = new Map<string, string>();

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ deckId: 'note:1' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/db', () => ({
  getDeckById: jest.fn(),
  listQuestions: jest.fn(),
  listAnswersForDeck: jest.fn(),
  saveAttempt: jest.fn(async () => 1),
  saveAnswers: jest.fn(async () => undefined),
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
  questionCount: 30,
  source: 'notes',
  color: null,
  icon: null,
  downloadedAt: 1,
};

const QUESTIONS: Question[] = Array.from({ length: 30 }, (_, i) => ({
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

/** What one Text reads as, interpolated children and all. */
function textOf(children: unknown): string {
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return '';
}

/** Everything the screen put on the page, in order. */
function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((node) => textOf(node.props.children));
}

function press(tree: ReactTestRenderer, label: string) {
  const node = tree.root
    .findAllByType(Text)
    .find((text) => textOf(text.props.children) === label);
  if (!node) throw new Error(`no "${label}" on screen: ${texts(tree).join(' | ')}`);
  let pressable = node.parent;
  while (pressable && typeof pressable.props.onPress !== 'function') pressable = pressable.parent;
  if (!pressable) throw new Error(`"${label}" is not inside anything pressable`);
  act(() => pressable!.props.onPress());
}

beforeEach(() => {
  mockSettings.clear();
  useExamStore.getState().reset();
  db.getDeckById.mockResolvedValue(DECK);
  db.listQuestions.mockResolvedValue(QUESTIONS);
  db.listAnswersForDeck.mockResolvedValue([]);
});

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<ExamSetupScreen />);
  });
  return tree;
}

describe('the exam setup screen', () => {
  it('opens on the mode picker', async () => {
    const tree = await open();
    expect(texts(tree)).toContain('How do you want to sit it?');
    expect(texts(tree)).toContain('Take your time');
  });

  it('shows the type chips and a paper length after a mode is chosen', async () => {
    const tree = await open();
    press(tree, 'Take your time');

    const shown = texts(tree);
    expect(shown).toContain('WHICH TYPES?');
    expect(shown).toContain('HOW MANY?');
    expect(shown).toContain('Multiple choice');
    expect(shown).toContain('True or False');
    expect(shown).toContain('10 questions · about 5 min');
  });

  it('swaps to a true/false paper in two taps', async () => {
    const tree = await open();
    press(tree, 'Take your time');
    press(tree, 'True or False');
    press(tree, 'Multiple choice');

    const state = useExamStore.getState();
    expect(state.counts.multiple_choice).toBe(0);
    expect(state.counts.true_false).toBe(10);
    expect(texts(tree)).toContain('10 questions · about 5 min');
  });

  it('changes the whole paper with one number', async () => {
    const tree = await open();
    press(tree, 'Take your time');
    press(tree, '20');
    expect(useExamStore.getState().total()).toBe(20);
    expect(texts(tree)).toContain('20 questions · about 10 min');
  });

  it('steps the length in fives and stops at what the notes hold', async () => {
    const tree = await open();
    press(tree, 'Take your time');
    press(tree, '+');
    expect(useExamStore.getState().total()).toBe(15);
    press(tree, '−');
    expect(useExamStore.getState().total()).toBe(10);
    press(tree, 'All 30');
    expect(useExamStore.getState().total()).toBe(30);
  });

  it('offers the exact amounts, and comes back', async () => {
    const tree = await open();
    press(tree, 'Take your time');
    press(tree, 'Set exact amounts per type ›');
    expect(texts(tree)).toContain('Pick the one correct answer from the four choices.');
    press(tree, '‹ Back to quick pick');
    expect(texts(tree)).toContain('WHICH TYPES?');
  });

  it('reopens on the paper the last sitting started', async () => {
    const first = await open();
    press(first, 'Beat the clock');
    press(first, 'True or False');
    press(first, 'Multiple choice');
    press(first, '20');
    press(first, 'Start exam');

    act(() => useExamStore.getState().reset());
    const again = await open();
    expect(texts(again)).toContain('LAST TIME');
    press(again, 'Take your time');
    expect(useExamStore.getState().counts.true_false).toBe(20);
    expect(texts(again)).toContain('20 questions · about 10 min');
  });
});
