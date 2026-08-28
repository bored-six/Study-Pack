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
/**
 * Choosing a mode now plays the cartridge into a slot, and the step only
 * changes once the screen is covered. This suite is about the form, so the
 * load hands over at once here; the animation's own contract — cover,
 * swap, reveal, and never strand anyone — is CartridgeLoad.test.tsx.
 */
jest.mock('@/components/CartridgeLoad', () => ({
  CartridgeLoad: ({ onCovered, onDone }: { onCovered: () => void; onDone: () => void }) => {
    onCovered();
    onDone();
    return null;
  },
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

/** The − and + repeat once per ticked type, so reach them by what they say. */
function pressLabelled(tree: ReactTestRenderer, accessibilityLabel: string) {
  const node = tree.root.find(
    (n) => typeof n.props?.onPress === 'function' && n.props.accessibilityLabel === accessibilityLabel
  );
  act(() => node.props.onPress());
}

/** Types straight into one type's amount field, the way a thumb would. */
function type(tree: ReactTestRenderer, accessibilityLabel: string, value: string) {
  const field = tree.root.find(
    (n) => n.props?.accessibilityLabel === accessibilityLabel && 'onChangeText' in (n.props ?? {})
  );
  act(() => field.props.onChangeText(value));
  act(() => field.props.onSubmitEditing());
}

beforeEach(() => {
  mockSettings.clear();
  act(() => useExamStore.getState().reset());
  db.getDeckById.mockResolvedValue(DECK);
  db.listQuestions.mockResolvedValue(QUESTIONS);
  db.listAnswersForDeck.mockResolvedValue([]);
});

/**
 * Picking a mode is two taps now: the cartridge opens its detail sheet,
 * and the sheet is where you commit. Tests say what they mean by going
 * through both.
 */
function chooseMode(tree: ReactTestRenderer, name: string) {
  press(tree, name);
  press(tree, 'Choose questions');
}

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
    expect(texts(tree)).toContain('Pick your game');
    expect(texts(tree)).toContain('Take your time');
  });

  it('shows the type chips, and an amount for what is ticked', async () => {
    const tree = await open();
    chooseMode(tree, 'Take your time');

    const shown = texts(tree);
    expect(shown).toContain('WHICH TYPES?');
    expect(shown).toContain('HOW MANY OF EACH?');
    expect(shown).toContain('Multiple choice');
    expect(shown).toContain('True or False');
    expect(shown).toContain('10 questions · about 5 min');
    // One row, because one type is ticked.
    expect(shown.filter((text) => text === 'Max 30')).toHaveLength(1);
  });

  it('swaps to a true/false paper in two taps', async () => {
    const tree = await open();
    chooseMode(tree, 'Take your time');
    press(tree, 'True or False');
    press(tree, 'Multiple choice');

    const state = useExamStore.getState();
    expect(state.counts.multiple_choice).toBe(0);
    expect(state.counts.true_false).toBe(10);
    expect(texts(tree)).toContain('10 questions · about 5 min');
  });

  it('sets each ticked type to its own amount', async () => {
    const tree = await open();
    chooseMode(tree, 'Take your time');
    press(tree, 'True or False');
    type(tree, 'How many Multiple choice', '10');
    type(tree, 'How many True or False', '3');

    const state = useExamStore.getState();
    expect(state.counts.multiple_choice).toBe(10);
    expect(state.counts.true_false).toBe(3);
    expect(texts(tree)).toContain('13 questions · about 7 min');
  });

  it('does not touch one type when another is added', async () => {
    const tree = await open();
    chooseMode(tree, 'Take your time');
    type(tree, 'How many Multiple choice', '25');
    press(tree, 'True or False');
    expect(useExamStore.getState().counts.multiple_choice).toBe(25);
    expect(texts(tree)).toContain('35 questions · about 18 min');
  });

  it('nudges one type without disturbing the other', async () => {
    const tree = await open();
    chooseMode(tree, 'Take your time');
    press(tree, 'Identification');
    pressLabelled(tree, 'More Identification');
    pressLabelled(tree, 'More Identification');
    pressLabelled(tree, 'Fewer Multiple choice');

    const state = useExamStore.getState();
    expect(state.counts.identification).toBe(12);
    expect(state.counts.multiple_choice).toBe(9);
  });

  it('fills a type to the brim from its Max', async () => {
    const tree = await open();
    chooseMode(tree, 'Take your time');
    press(tree, 'Max 30');
    expect(useExamStore.getState().counts.multiple_choice).toBe(30);
  });

  it('offers to even the types out, once there is more than one', async () => {
    const tree = await open();
    chooseMode(tree, 'Take your time');
    expect(texts(tree)).not.toContain('Even them out');

    press(tree, 'True or False');
    type(tree, 'How many Multiple choice', '18');
    press(tree, 'Even them out');

    const state = useExamStore.getState();
    expect(state.counts.multiple_choice).toBe(14);
    expect(state.counts.true_false).toBe(14);
  });

  it('reopens on the paper the last sitting started', async () => {
    const first = await open();
    chooseMode(first, 'Beat the clock');
    press(first, 'True or False');
    press(first, 'Multiple choice');
    type(first, 'How many True or False', '20');
    // The start button wears the mode's own verb now, not one label for all five.
    press(first, 'Light the fuse');

    act(() => useExamStore.getState().reset());
    const again = await open();
    expect(texts(again)).toContain('LAST TIME');
    chooseMode(again, 'Take your time');
    expect(useExamStore.getState().counts.true_false).toBe(20);
    expect(texts(again)).toContain('20 questions · about 10 min');
  });
});
