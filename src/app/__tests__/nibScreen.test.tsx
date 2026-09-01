import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import NibScreen from '../notes/nib';

/** The store the screen reads, swapped per test. */
const mockState: Record<string, unknown> = {};

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('@/lib/sfx', () => ({ playSfx: jest.fn() }));
jest.mock('@/store/notes', () => {
  const use = () => mockState;
  use.getState = () => mockState;
  return { useNotesStore: use };
});

function setStore(over: Record<string, unknown> = {}) {
  Object.keys(mockState).forEach((k) => delete mockState[k]);
  Object.assign(
    mockState,
    {
      draft: [],
      readFile: jest.fn(async () => 0),
      scanWithReader: jest.fn(async () => 0),
      rescuing: false,
      rescueError: null,
      credits: null,
    },
    over
  );
}

function textOf(children: unknown): string {
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  return '';
}

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAll((n) => n.type === Text, { deep: true })
    .map((n) => textOf(n.props.children))
    .join(' | ');
}

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<NibScreen />);
  });
  return tree;
}

/** Matched on onPress, since ChunkyButton wraps Pressable in forwardRef. */
function press(tree: ReactTestRenderer, label: string) {
  const hits = tree.root.findAll(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.findAll((c) => c.type === Text && textOf(c.props.children) === label, { deep: true })
        .length > 0
  );
  const target = hits[hits.length - 1];
  if (!target) throw new Error(`nothing labelled "${label}"`);
  act(() => {
    target.props.onPress();
  });
}

function type(tree: ReactTestRenderer, value: string) {
  const input = tree.root.findAll((n) => typeof n.props?.onChangeText === 'function')[0];
  act(() => {
    input.props.onChangeText(value);
  });
}

describe('what Nib says first', () => {
  it('asks, and offers the two ways to answer', () => {
    setStore();
    const said = allText(render());
    expect(said).toContain('What have you got for me?');
    expect(said).toContain('a file');
    expect(said).toContain('write it');
  });

  it('is asleep once the allowance is gone', () => {
    setStore({ credits: { left: 0, of: 10 } });
    const said = allText(render());
    expect(said).toContain('for the week');
    expect(said).toContain('Back on Monday');
    // The free path is named on the way out, so nobody is left stuck.
    expect(said).toContain('Add notes still');
  });
});

describe('when the line goes mid-reading', () => {
  /** A reading that started, then failed. Zero staged, with a reason. */
  function interrupt() {
    setStore({
      scanWithReader: jest.fn(async () => 0),
      rescueError: "Needs internet. Try again when you're back — nothing was used up.",
    });
    const tree = render();
    press(tree, 'write it');
    type(tree, 'Osmosis is the movement of water across a membrane.');
    return tree;
  }

  it('stops his sentence where the connection stopped', async () => {
    const tree = interrupt();
    await act(async () => {
      press(tree, 'Read it');
    });

    const said = allText(tree);
    // Mid-word, deliberately. A sentence that runs out is what "interrupted"
    // looks like in handwriting.
    expect(said).toContain('half way through when the li');
    expect(said).toContain('The line went.');
  });

  it('says nothing was used up, and keeps what you gave him', async () => {
    const tree = interrupt();
    await act(async () => {
      press(tree, 'Read it');
    });

    const said = allText(tree);
    expect(said).toContain('nothing was used up');
    expect(said).toContain('Everything you wrote is still below');
  });

  it('offers one press back rather than starting over', async () => {
    const tree = interrupt();
    await act(async () => {
      press(tree, 'Read it');
    });

    const said = allText(tree);
    expect(said).toContain('Ask him again');
    // The ordinary button is gone — two buttons would be two decisions.
    expect(said).not.toContain('Read it');
  });

  it('does not blame the notes for a failure that never reached them', async () => {
    const tree = interrupt();
    await act(async () => {
      press(tree, 'Read it');
    });
    expect(allText(tree)).not.toContain('worth testing');
  });
});

describe('when the reading lands', () => {
  it('holds, says so, and waits to be pressed', async () => {
    setStore({
      scanWithReader: jest.fn(async () => 12),
      draft: [
        { kind: 'definition' },
        { kind: 'cloze' },
        { kind: 'enumeration' },
      ],
      credits: { left: 9, of: 10 },
    });
    const tree = render();
    press(tree, 'write it');
    type(tree, 'Osmosis is the movement of water across a membrane.');
    await act(async () => {
      press(tree, 'Read it');
    });

    const said = allText(tree);
    expect(said).toContain('Finished!');
    expect(said).toContain('12');
    expect(said).toContain('QUESTIONS');
    expect(said).toContain('KINDS');
    expect(said).toContain('See what he made');
  });
});
