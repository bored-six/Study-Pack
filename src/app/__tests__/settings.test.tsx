import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Switch, Text } from 'react-native';

import SettingsScreen from '../settings';

const mockSettings = new Map<string, string>();
const mockErase = jest.fn(async () => undefined);
const mockClearHistory = jest.fn(async () => undefined);
const mockClearTrivia = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/lib/db', () => ({
  readSetting: async (key: string) => mockSettings.get(key) ?? null,
  writeSetting: async (key: string, value: string) => {
    mockSettings.set(key, value);
  },
  storageSummary: async () => ({
    subjects: 2,
    noteQuestions: 60,
    triviaDecks: 1,
    triviaQuestions: 20,
    sittings: 7,
    answers: 140,
    plans: 1,
  }),
  // Called through, not passed directly: the factory runs while the mock
  // consts are still hoisted-but-unassigned.
  clearPracticeHistory: () => mockClearHistory(),
  clearTriviaDownloads: () => mockClearTrivia(),
  eraseEverything: () => mockErase(),
}));
jest.mock('@/lib/sfx', () => ({ setSfxEnabled: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ setHapticsEnabled: jest.fn() }));

const mockPlanner = {
  capability: 'approximate' as const,
  leads: [10, 0],
  askPermission: jest.fn(async () => 'approximate' as const),
  refresh: jest.fn(async () => undefined),
};
const mockRefresh = jest.fn(async () => undefined);

jest.mock('@/store/planner', () => ({
  usePlannerStore: (select?: (s: unknown) => unknown) =>
    select ? select(mockPlanner) : mockPlanner,
}));
jest.mock('@/store/notes', () => ({
  useNotesStore: (select: (s: unknown) => unknown) => select({ refresh: mockRefresh }),
}));
jest.mock('@/store/progress', () => ({
  useProgressStore: (select: (s: unknown) => unknown) => select({ refresh: mockRefresh }),
}));
jest.mock('@/store/decks', () => ({
  useDecksStore: (select: (s: unknown) => unknown) => select({ refresh: mockRefresh }),
}));

/** What one Text reads as, interpolated children and all. */
function textOf(children: unknown): string {
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return '';
}

/**
 * The innermost pressable showing this exact label. Matched on the onPress
 * prop rather than the Pressable type: buttons wrap it in forwardRef/memo,
 * so the rendered node is not the Pressable export itself.
 */
function pressLabelled(tree: ReactTestRenderer, label: string): void {
  const matches = tree.root.findAll(
    (node) =>
      typeof node.props?.onPress === 'function' &&
      node.findAll((child) => child.type === Text && textOf(child.props.children) === label, {
        deep: true,
      }).length > 0
  );
  const target = matches[matches.length - 1];
  if (!target) throw new Error(`No pressable labelled "${label}"`);
  act(() => {
    target.props.onPress?.();
  });
}

function switchFor(tree: ReactTestRenderer, label: string) {
  return tree.root.findAll(
    (node) => node.type === Switch && node.props.accessibilityLabel === label
  )[0];
}

function has(tree: ReactTestRenderer, label: string): boolean {
  return (
    tree.root.findAll((node) => node.type === Text && textOf(node.props.children) === label)
      .length > 0
  );
}

async function render(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<SettingsScreen />);
  });
  return tree;
}

beforeEach(() => {
  mockSettings.clear();
  jest.clearAllMocks();
});

describe('the settings screen', () => {
  it('shows the switches the way the database left them', async () => {
    mockSettings.set('sfx_muted', '1');
    const tree = await render();

    expect(switchFor(tree, 'Sound effects').props.value).toBe(false);
    expect(switchFor(tree, 'Vibration').props.value).toBe(true);
    expect(switchFor(tree, 'Format how-tos').props.value).toBe(true);
  });

  it('persists a flipped switch', async () => {
    const tree = await render();

    await act(async () => {
      switchFor(tree, 'Vibration').props.onValueChange(false);
    });

    expect(switchFor(tree, 'Vibration').props.value).toBe(false);
    expect(mockSettings.get('haptics_muted')).toBe('1');
  });

  it('counts what this phone is holding', async () => {
    const tree = await render();
    expect(has(tree, '60')).toBe(true);
    expect(has(tree, '7')).toBe(true);
  });

  // There is no server holding a copy, so the wipe asks twice — and the
  // first yes must not be the one that deletes anything.
  it('never erases on the first yes', async () => {
    const tree = await render();

    pressLabelled(tree, 'Delete');
    await act(async () => {
      pressLabelled(tree, 'Continue');
    });
    expect(mockErase).not.toHaveBeenCalled();

    await act(async () => {
      pressLabelled(tree, 'Delete it all');
    });
    expect(mockErase).toHaveBeenCalledTimes(1);
  });

  it('clears history without touching the notes', async () => {
    const tree = await render();

    pressLabelled(tree, 'Clear');
    await act(async () => {
      pressLabelled(tree, 'Clear it');
    });

    expect(mockClearHistory).toHaveBeenCalledTimes(1);
    expect(mockErase).not.toHaveBeenCalled();
  });
});
