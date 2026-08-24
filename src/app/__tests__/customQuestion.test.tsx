import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import CustomQuestionScreen from '../notes/custom';
import { useNotesStore } from '@/store/notes';
import type { Deck } from '@/lib/types';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/db', () => ({
  listDecks: jest.fn(),
  listAnswerPool: jest.fn(),
  createSubject: jest.fn(),
  deleteDeck: jest.fn(),
  addQuestionsToDeck: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('@/lib/db');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { router } = require('expo-router');

const BIOLOGY: Deck = {
  id: 'note:1',
  categoryId: 0,
  name: 'Biology',
  difficulty: 'medium',
  questionCount: 8,
  source: 'notes',
  color: null,
  icon: null,
  downloadedAt: 1,
};

const POOL = ['Chloroplast', 'Ribosome', 'Nucleus', 'Cytoplasm', 'Golgi body'];

function textOf(children: unknown): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(textOf).join('');
  return '';
}

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

function field(tree: ReactTestRenderer, accessibilityLabel: string) {
  return tree.root.find(
    (n) => n.props?.accessibilityLabel === accessibilityLabel && 'onChangeText' in (n.props ?? {})
  );
}

function type(tree: ReactTestRenderer, accessibilityLabel: string, value: string) {
  act(() => field(tree, accessibilityLabel).props.onChangeText(value));
}

/** What the three wrong-answer boxes currently hold. */
function decoys(tree: ReactTestRenderer): string[] {
  return [1, 2, 3].map((i) => field(tree, `Wrong answer ${i}`).props.value as string);
}

/** Whether the button that leaves the screen is live. */
function canReview(tree: ReactTestRenderer): boolean {
  const node = tree.root
    .findAllByType(Text)
    .find((text) => textOf(text.props.children) === 'Review question');
  let pressable = node?.parent ?? null;
  while (pressable && !('disabled' in pressable.props)) pressable = pressable.parent;
  return pressable?.props.disabled === false;
}

async function open(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<CustomQuestionScreen />);
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  act(() => useNotesStore.setState({ subjects: [], targetId: null, draft: [], stats: null }));
  db.listDecks.mockResolvedValue([BIOLOGY]);
  db.listAnswerPool.mockResolvedValue(POOL);
});

describe('the write-your-own-question screen', () => {
  it('asks for the question and the right answer only', async () => {
    const tree = await open();
    const shown = texts(tree);
    expect(shown).toContain('Your question');
    expect(shown).toContain('The right answer');
    expect(shown).toContain('Wrong answers');
    expect(shown).toContain('Biology');
  });

  it('borrows the wrong answers from the chosen subject', async () => {
    const tree = await open();
    press(tree, 'Biology');
    await act(async () => {});
    type(tree, 'The right answer', 'Mitochondria');

    press(tree, 'Suggest');
    const filled = decoys(tree);
    expect(filled.filter(Boolean)).toHaveLength(3);
    expect(POOL).toEqual(expect.arrayContaining(filled));
    expect(filled).not.toContain('Mitochondria');
  });

  it('keeps a wrong answer already written and only fills the blanks', async () => {
    const tree = await open();
    press(tree, 'Biology');
    await act(async () => {});
    type(tree, 'The right answer', 'Mitochondria');
    type(tree, 'Wrong answer 2', 'Lysosome');

    press(tree, 'Suggest');
    expect(decoys(tree)[1]).toBe('Lysosome');
    expect(decoys(tree).filter(Boolean)).toHaveLength(3);
  });

  it('says so plainly when the subject has nothing to borrow', async () => {
    db.listAnswerPool.mockResolvedValue([]);
    const tree = await open();
    press(tree, 'Biology');
    await act(async () => {});
    type(tree, 'The right answer', 'Mitochondria');

    expect(texts(tree)).toContain(
      "Biology has no questions yet, so there's nothing to borrow — write three wrong answers."
    );
    expect(decoys(tree)).toEqual(['', '', '']);
  });

  it('will not leave the screen until there are four different options', async () => {
    const tree = await open();
    press(tree, 'Biology');
    await act(async () => {});
    expect(canReview(tree)).toBe(false);

    type(tree, 'Your question', 'Which organelle releases energy from glucose?');
    type(tree, 'The right answer', 'Mitochondria');
    expect(canReview(tree)).toBe(false);

    type(tree, 'Wrong answer 1', 'Ribosome');
    type(tree, 'Wrong answer 2', 'Nucleus');
    type(tree, 'Wrong answer 3', 'ribosome');
    expect(texts(tree)).toContain(
      'Two options are the same. Every option has to be different.'
    );
    expect(canReview(tree)).toBe(false);

    type(tree, 'Wrong answer 3', 'Chloroplast');
    expect(canReview(tree)).toBe(true);
  });

  it('stages the question for review, in the subject that was picked', async () => {
    const tree = await open();
    press(tree, 'Biology');
    await act(async () => {});
    type(tree, 'Your question', 'Which organelle releases energy from glucose?');
    type(tree, 'The right answer', 'Mitochondria');
    type(tree, 'Wrong answer 1', 'Ribosome');
    type(tree, 'Wrong answer 2', 'Nucleus');
    type(tree, 'Wrong answer 3', 'Chloroplast');

    press(tree, 'Review question');

    const { draft, targetId, stats } = useNotesStore.getState();
    expect(draft).toHaveLength(1);
    expect(draft[0].correctAnswer).toBe('Mitochondria');
    expect(draft[0].answers).toHaveLength(4);
    expect(draft[0].sourceLine).toBeNull();
    expect(targetId).toBe('note:1');
    // The review screen only renders once a scan has happened.
    expect(stats).not.toBeNull();
    expect(router.push).toHaveBeenCalledWith('/notes/review');
  });

  it('warns when the question hands over its own answer', async () => {
    const tree = await open();
    type(tree, 'Your question', 'Mitochondria release energy from what?');
    type(tree, 'The right answer', 'Mitochondria');

    expect(texts(tree)).toContain(
      'The question contains its answer, so it gives itself away. Fine if you meant it.'
    );
  });
});
