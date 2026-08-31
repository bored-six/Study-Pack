import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import SettingsScreen from '../settings';

const mockSettings = new Map<string, string>();
const mockErase = jest.fn(async () => undefined);
const mockClearHistory = jest.fn(async () => undefined);

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
    sittings: 7,
    answers: 140,
    plans: 1,
  }),
  // Called through, not passed directly: the factory runs while the mock
  // consts are still hoisted-but-unassigned.
  clearPracticeHistory: () => mockClearHistory(),
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

/**
 * One switch, found the way a screen reader finds it.
 *
 * These used to be React Native's own Switch and are now a hand-drawn
 * Pressable, so looking for the type found nothing at all. Going by role
 * and label instead means the test keeps working through the next restyle
 * — and only passes while the switch is still announcing itself.
 */
function switchFor(tree: ReactTestRenderer, label: string) {
  const node = tree.root.findAll(
    (n) =>
      n.props?.accessibilityRole === 'switch' && n.props?.accessibilityLabel === label
  )[0];
  if (!node) throw new Error(`no switch labelled "${label}"`);
  return node;
}

/** What the switch says it is: on, or off. */
function switchState(tree: ReactTestRenderer, label: string): boolean {
  return switchFor(tree, label).props.accessibilityState.checked === true;
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

    expect(switchState(tree, 'Sound effects')).toBe(false);
    expect(switchState(tree, 'Vibration')).toBe(true);
    expect(switchState(tree, 'Format how-tos')).toBe(true);
  });

  it('persists a flipped switch', async () => {
    const tree = await render();

    await act(async () => {
      switchFor(tree, 'Vibration').props.onPress();
    });

    expect(switchState(tree, 'Vibration')).toBe(false);
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

    pressLabelled(tree, 'Delete everything');
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

    pressLabelled(tree, 'Clear practice history');
    await act(async () => {
      pressLabelled(tree, 'Clear it');
    });

    expect(mockClearHistory).toHaveBeenCalledTimes(1);
    expect(mockErase).not.toHaveBeenCalled();
  });
});

describe('the privacy card', () => {
  /**
   * Flipp is handed out as a download from a link, so nobody has vetted it on
   * the student's behalf. These lines are the only assurance they get, and
   * each one has to stay true of the code — if a server, an account or an
   * analytics SDK ever arrives, this test should fail and force the wording
   * to change with it.
   */
  /** Everything the screen renders, as one string. */
  const spoken = async () => {
    const tree = await render();
    return tree.root
      .findAll((node) => node.type === Text)
      .map((node) => textOf(node.props.children))
      .join(' ');
  };

  it('promises the things that are actually true', async () => {
    const said = await spoken();
    expect(said).toContain('stay on this phone');
    expect(said).toContain('no ads, no tracking');
  });

  /**
   * The card used to say "Nothing you write is uploaded. There is no server
   * to upload it to" and "Flipp never calls the internet". A reader arrived,
   * this test failed, and the wording changed — which is what it is for.
   *
   * What replaced it has to keep saying two things: that the send is the
   * student's own press, and that there is no other call. A card that only
   * admits "we use the internet" would be true and useless.
   */
  it('names the one thing that leaves the phone, and who starts it', async () => {
    const said = await spoken();
    expect(said).toContain('Nothing leaves the phone unless you press');
    expect(said).toContain('Read these with Nib');
    expect(said).toContain('no other call');
  });

  it('no longer makes the absolute claim the reader broke', async () => {
    const said = await spoken();
    expect(said).not.toContain('never calls the internet');
    expect(said).not.toContain('There is no server');
  });

  it('sits above the way to delete everything, not instead of it', async () => {
    const said = await spoken();
    expect(said).toContain('Delete everything');
  });
});
