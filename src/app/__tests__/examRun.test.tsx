/**
 * The exam screen, mounted for real, once per mode.
 *
 * The HUD has its own test, but a component that renders correctly in
 * isolation proves nothing about whether the screen actually reaches for
 * it — the question "is the clock really there when I play Beat the
 * clock?" is only answered by mounting the screen with a live store and
 * looking. So that is what this does: build a real sitting in each mode,
 * dismiss the format briefing the way a student does, and read what is
 * on the page.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import ExamRunScreen from '../exam/run';
import { FORMAT_LABEL } from '@/lib/exam';
import { MODES, MODE_ORDER, type ExamMode } from '@/lib/mode';
import type { Deck, Question } from '@/lib/types';
import { useExamStore } from '@/store/exam';

const mockSettings = new Map<string, string>();

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
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

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((node) => textOf(node.props.children));
}

function screen(tree: ReactTestRenderer): string {
  return texts(tree).join(' | ');
}

/** Every accessibility label on the page — what a screen reader would find. */
function labels(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll((n) => typeof n.props?.accessibilityLabel === 'string')
    .map((n) => n.props.accessibilityLabel as string);
}

function press(tree: ReactTestRenderer, label: string) {
  const node = tree.root
    .findAllByType(Text)
    .find((text) => textOf(text.props.children) === label);
  if (!node) throw new Error(`no "${label}" on screen: ${screen(tree)}`);
  let pressable = node.parent;
  while (pressable && typeof pressable.props.onPress !== 'function') pressable = pressable.parent;
  if (!pressable) throw new Error(`"${label}" is not inside anything pressable`);
  act(() => pressable!.props.onPress());
}

/**
 * Starts a real sitting in this mode and mounts the screen on it.
 *
 * The first thing any sitting shows is the format briefing, which is a
 * different screen — every test here wants what is behind it, so "Got it"
 * is pressed on the way in.
 */
async function sit(mode: ExamMode): Promise<ReactTestRenderer> {
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
  expect(useExamStore.getState().status).toBe('active');

  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<ExamRunScreen />);
  });
  press(tree, 'Got it');
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings.clear();
  act(() => useExamStore.getState().reset());
});

describe('the exam screen, per mode', () => {
  it.each(MODE_ORDER)('%s mounts and shows a question', async (mode) => {
    const tree = await sit(mode);
    // Past the briefing, and past the spinner the screen falls back to when
    // there is nothing to show. Survival deals its own paper and can open on
    // any format, so the stage is checked by whichever one it dealt.
    const format = useExamStore.getState().current()!.format;
    expect(screen(tree)).toContain(FORMAT_LABEL[format]);
    expect(tree.root.findAllByType(Text).length).toBeGreaterThan(5);
  });

  it.each(MODE_ORDER)('%s names the mode it is running', async (mode) => {
    const tree = await sit(mode);
    expect(screen(tree)).toContain(MODES[mode].name);
    expect(screen(tree)).toContain('Biology');
  });

  it.each(MODE_ORDER)('%s stamps the stage with its own mark', async (mode) => {
    const tree = await sit(mode);
    // The rubber stamp is what makes a screenshot say which game it was.
    expect(screen(tree)).toContain(MODES[mode].stamp);
  });

  it.each(MODE_ORDER)('%s carries its readout, spoken as well as drawn', async (mode) => {
    const tree = await sit(mode);
    expect(labels(tree).some((l) => l.length > 0)).toBe(true);
  });
});

describe('the clock is actually on the screens that promised one', () => {
  it('beat the clock counts the seconds down on this question', async () => {
    const tree = await sit('rapid');
    // Multiple choice gets fifteen seconds; the readout shows the number
    // and its unit, not a mm:ss the mode never uses.
    expect(labels(tree)).toContain('15 seconds left');
    expect(screen(tree)).toContain('15');
    expect(screen(tree)).toContain('s');
  });

  it('exam simulation counts the whole paper down instead', async () => {
    const tree = await sit('simulation');
    const spoken = labels(tree).find((l) => l.endsWith('left on the paper'));
    expect(spoken).toBeDefined();
    expect(spoken).toMatch(/^\d+:\d\d left on the paper$/);
    // and how much of the paper is filled in, since nothing is marked yet
    expect(screen(tree)).toContain('0/6 filled in');
  });

  it('take your time puts no clock on the screen at all', async () => {
    const tree = await sit('relaxed');
    expect(labels(tree).some((l) => /seconds left|left on the paper/.test(l))).toBe(false);
    expect(labels(tree)).toContain('page 1 of 6');
  });

  it('mastery puts no clock on the screen either, and counts the pile', async () => {
    const tree = await sit('mastery');
    expect(labels(tree).some((l) => /seconds left|left on the paper/.test(l))).toBe(false);
    expect(labels(tree)).toContain('6 cards left in the pile');
    expect(screen(tree)).toContain('in the pile');
    expect(screen(tree)).toContain('0/6 learned');
  });

  it('survival shows lives, and never a paper length', async () => {
    const tree = await sit('survival');
    expect(labels(tree)).toContain('3 lives left');
    expect(screen(tree)).toContain('survived');
    // Survival has no fixed length, so nothing on the page may claim one.
    expect(screen(tree)).not.toMatch(/\d+\s*\/\s*\d+/);
  });
});

describe('the furniture each mode is entitled to', () => {
  it('a withheld paper gets the flag and the way back through it', async () => {
    const tree = await sit('simulation');
    const shown = screen(tree);
    expect(shown).toContain('Back');
    expect(shown).toContain('Review');
    expect(shown).toContain('Next');
  });

  it('a marked-as-you-go paper gets none of that', async () => {
    const tree = await sit('relaxed');
    const shown = screen(tree);
    expect(shown).not.toContain('Review');
    expect(shown).not.toContain('Next');
  });

  it('the briefing warns a sealed paper that nothing comes back until the end', async () => {
    db.getDeckById.mockResolvedValue(DECK);
    db.listQuestions.mockResolvedValue(QUESTIONS);
    db.listAnswersForDeck.mockResolvedValue([]);

    await act(async () => {
      await useExamStore.getState().load(DECK.id);
    });
    act(() => {
      useExamStore.getState().setMode('simulation');
      useExamStore.getState().setOnly('multiple_choice', 6);
      useExamStore.getState().start();
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ExamRunScreen />);
    });
    // Read before dismissing it — this warning only exists for deferred modes.
    expect(screen(tree)).toContain("You won't be told if you're right until the whole paper is submitted.");
  });

  it('an instant-feedback paper is not warned about a wait it will not have', async () => {
    db.getDeckById.mockResolvedValue(DECK);
    db.listQuestions.mockResolvedValue(QUESTIONS);
    db.listAnswersForDeck.mockResolvedValue([]);

    await act(async () => {
      await useExamStore.getState().load(DECK.id);
    });
    act(() => {
      useExamStore.getState().setMode('rapid');
      useExamStore.getState().setOnly('multiple_choice', 6);
      useExamStore.getState().start();
    });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<ExamRunScreen />);
    });
    expect(screen(tree)).not.toContain('until the whole paper is submitted');
  });
});
