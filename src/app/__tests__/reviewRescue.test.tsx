import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import type { Credits } from '@/lib/aiNotes';
import type { ParsedQuestion, SkippedLine } from '@/lib/noteParser';

import ReviewNotesScreen from '../notes/review';

/**
 * The store state the screen reads. Assigned by `render` before the tree is
 * built — the mock factory below only closes over the binding, and reads it
 * at render time, by which point it holds something.
 */
let mockCurrent: Record<string, unknown> = {};

const mockRescue = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { dismissAll: jest.fn(), back: jest.fn(), push: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/store/notes', () => ({
  useNotesStore: () => mockCurrent,
}));

function question(answer: string): ParsedQuestion {
  return {
    prompt: `What is ${answer}?`,
    correctAnswer: answer,
    answers: [answer, 'a', 'b', 'c'],
    kind: 'definition',
    sourceLine: `${answer}: something`,
  };
}

const SKIPPED: SkippedLine[] = [
  { text: 'Cell Biology', reason: 'too_short' },
  { text: 'A heading of some kind', reason: 'heading' },
];

/** Builds the screen with one rescue-related field varied at a time. */
function render(over: {
  skipped?: SkippedLine[];
  credits?: Credits | null;
  rescuing?: boolean;
  rescueAdded?: number | null;
  rescueError?: string | null;
  source?: string | null;
}): ReactTestRenderer {
  mockCurrent = {
    draft: [question('Mitochondria'), question('Osmosis')],
    stats: {
      linesRead: 9,
      linesUsed: 7,
      skipped: over.skipped ?? SKIPPED,
      truncatedInput: false,
      cappedQuestions: false,
    },
    subjects: [
      {
        id: 'note:1',
        categoryId: 0,
        name: 'Biology',
        difficulty: 'easy',
        questionCount: 2,
        source: 'notes',
        color: null,
        icon: null,
        downloadedAt: 1,
      },
    ],
    targetId: 'note:1',
    setTarget: jest.fn(),
    addSubject: jest.fn(),
    reviseDraftQuestion: jest.fn(),
    removeDraftQuestion: jest.fn(),
    saveDraft: jest.fn(),
    clearDraft: jest.fn(),
    source: over.source === undefined ? 'Cell Biology\nMitochondria: the powerhouse' : over.source,
    rescue: mockRescue,
    rescuing: over.rescuing ?? false,
    rescueAdded: over.rescueAdded ?? null,
    rescueError: over.rescueError ?? null,
    credits: over.credits === undefined ? null : over.credits,
  };

  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ReviewNotesScreen />);
  });
  return tree;
}

function textOf(children: unknown): string {
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return '';
}

/** Everything the screen reads as, so a claim can be made about the whole. */
function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAll((node) => node.type === Text, { deep: true })
    .map((node) => textOf(node.props.children))
    .join(' | ');
}

/**
 * The innermost pressable showing this label. Matched on onPress rather than
 * the Pressable type — ChunkyButton wraps it in forwardRef, so the rendered
 * node is never the Pressable export itself.
 */
function pressableLabelled(tree: ReactTestRenderer, label: string) {
  const matches = tree.root.findAll(
    (node) =>
      typeof node.props?.onPress === 'function' &&
      node.findAll((child) => child.type === Text && textOf(child.props.children) === label, {
        deep: true,
      }).length > 0
  );
  const target = matches[matches.length - 1];
  if (!target) throw new Error(`No pressable labelled "${label}"`);
  return target;
}

function pressLabelled(tree: ReactTestRenderer, label: string): void {
  const target = pressableLabelled(tree, label);
  act(() => {
    target.props.onPress?.();
  });
}

/**
 * Whether the control is handed to Pressable as disabled.
 *
 * Asserted rather than simulated: calling `onPress` straight off the node
 * walks past the guard Pressable applies at runtime, so a press in a test
 * would "work" on a button no student could press.
 */
function isDisabled(tree: ReactTestRenderer, label: string): boolean {
  return pressableLabelled(tree, label).props.disabled === true;
}

beforeEach(() => {
  mockRescue.mockClear();
});

describe('the offer', () => {
  it('sits with the skipped lines, and says what a reading costs', () => {
    const text = allText(render({}));
    expect(text).toContain('Skipped 2 lines');
    expect(text).toContain('Read these with AI');
    // No reading has run, so the allowance is stated rather than a balance.
    expect(text).toContain('10 readings a week');
  });

  it('shows what is left once the server has said', () => {
    const text = allText(render({ credits: { left: 8, of: 10 } }));
    expect(text).toContain('8 of 10 left this week');
  });

  it('asks the store to read when pressed', () => {
    pressLabelled(render({}), 'Read these with AI');
    expect(mockRescue).toHaveBeenCalledTimes(1);
  });

  it('is absent when the questions came from the student, not notes', () => {
    // A hand-written question has no notes behind it and nothing skipped.
    const text = allText(render({ source: null, skipped: [] }));
    expect(text).not.toContain('Read these with AI');
  });

  it('is absent when the parser used every line', () => {
    const text = allText(render({ skipped: [] }));
    expect(text).not.toContain('Skipped');
    expect(text).not.toContain('Read these with AI');
  });
});

describe('while a reading runs', () => {
  it('says so, and cannot be pressed again', () => {
    const tree = render({ rescuing: true });
    expect(allText(tree)).toContain('Reading your notes…');

    expect(isDisabled(tree, 'Reading your notes…')).toBe(true);
  });
});

describe('when a reading fails', () => {
  it('keeps the offer, and says nothing was used up', () => {
    const text = allText(
      render({ rescueError: "Needs internet. Try again when you're back — nothing was used up." })
    );
    expect(text).toContain('Read these with AI');
    expect(text).toContain('nothing was used up');
  });
});

describe('when the allowance is gone', () => {
  it('names the day it comes back rather than saying "limit reached"', () => {
    const tree = render({ credits: { left: 0, of: 10 } });
    const text = allText(tree);
    expect(text).toContain('Readings come back Monday');
    expect(text).toContain('0 of 10 left this week');

    expect(isDisabled(tree, 'Readings come back Monday')).toBe(true);
  });
});

describe('after a reading lands', () => {
  it('reports what it added and does not offer a second one', () => {
    const text = allText(render({ rescueAdded: 3, credits: { left: 7, of: 10 } }));
    expect(text).toContain('Added 3 questions.');
    expect(text).toContain('7 of 10 left this week');
    expect(text).not.toContain('Read these with AI');
  });

  it('is honest when it found nothing', () => {
    const text = allText(render({ rescueAdded: 0, credits: { left: 7, of: 10 } }));
    expect(text).toContain('Nothing more to pull out of these notes.');
  });

  it('stays on screen even when it cleared every skipped line', () => {
    // The list it was attached to is gone; the outcome still has to be read.
    const text = allText(render({ skipped: [], rescueAdded: 5, credits: { left: 7, of: 10 } }));
    expect(text).toContain('Added 5 questions.');
  });
});
