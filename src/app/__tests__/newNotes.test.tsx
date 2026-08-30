/**
 * The paste box.
 *
 * The screen used to be silent until you pressed the button, so there was
 * nothing to test but the button. It now reads the paste as you type and
 * offers worked examples you can tap into the box, and both of those are
 * behaviour rather than decoration.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

import NewNotesScreen from '../notes/new';

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
jest.mock('@/lib/sfx', () => ({ playSfx: jest.fn(), setSfxEnabled: jest.fn() }));
jest.mock('@/lib/db', () => ({
  // '1' means the walkthrough has already been seen, so it never covers the
  // screen these tests are reading.
  readSetting: jest.fn(async () => '1'),
  writeSetting: jest.fn(async () => undefined),
  listDecks: jest.fn(async () => []),
  listAnswerPool: jest.fn(async () => []),
  createSubject: jest.fn(),
  deleteDeck: jest.fn(),
  addQuestionsToDeck: jest.fn(),
}));

function textOf(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  return '';
}

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((node) => textOf(node.props.children));
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<NewNotesScreen />);
  });
  return tree;
}

/** The paste box, reached the way a screen reader would reach it. */
function box(tree: ReactTestRenderer) {
  return tree.root
    .findAllByType(TextInput)
    .find((node) => node.props.accessibilityLabel === 'Your notes')!;
}

function paste(tree: ReactTestRenderer, value: string) {
  act(() => box(tree).props.onChangeText(value));
}

function pressLabelled(tree: ReactTestRenderer, accessibilityLabel: string) {
  const node = tree.root.find(
    (n) =>
      typeof n.props?.onPress === 'function' &&
      n.props.accessibilityLabel === accessibilityLabel
  );
  act(() => node.props.onPress());
}

describe('the add notes screen', () => {
  it('opens on an empty page with the worked examples showing', () => {
    const tree = mount();
    const shown = texts(tree);

    expect(shown).toContain('NOTES WE CAN USE');
    expect(shown).toContain('Term: meaning');
    expect(box(tree).props.value).toBe('');
  });

  it('says nothing about a box you have not typed in yet', () => {
    const shown = texts(mount());
    expect(shown.join(' ')).not.toContain('we can use');
  });

  it('counts what it can see, while you type', () => {
    const tree = mount();
    paste(
      tree,
      ['Chlorophyll: the green pigment that absorbs light', 'Chapter 4'].join('\n')
    );

    const shown = texts(tree);
    expect(shown).toContain('lines');
    expect(shown).toContain('we can use');
    expect(shown).toContain('too short');
  });

  it('drops a worked example into the box when you tap it', () => {
    const tree = mount();
    pressLabelled(tree, 'Add an example: Term: meaning');

    expect(box(tree).props.value).toContain('Chlorophyll');
  });

  it('adds a second example under the first rather than replacing it', () => {
    const tree = mount();
    pressLabelled(tree, 'Add an example: Term: meaning');
    pressLabelled(tree, 'Add an example: A plain fact');

    const value = box(tree).props.value as string;
    expect(value).toContain('Chlorophyll');
    expect(value).toContain('Mitochondria');
    expect(value.split('\n')).toHaveLength(2);
  });

  it('offers advice when nothing in the paste can be used', () => {
    const tree = mount();
    paste(tree, 'Chapter 4\nUnit 2');

    expect(texts(tree).join(' ')).toMatch(/short/i);
  });

  it('stays quiet when the paste is already good', () => {
    const tree = mount();
    paste(
      tree,
      [
        'Chlorophyll: the green pigment that absorbs light',
        'Mitochondria produce 36 ATP per glucose molecule.',
      ].join('\n')
    );

    const shown = texts(tree).join(' ');
    expect(shown).toContain('we can use');
    expect(shown).not.toMatch(/Try writing these as/);
  });

  it('warns once the paste is longer than the review can stand', () => {
    const tree = mount();
    paste(tree, 'Osmosis: movement of water across a membrane. '.repeat(300));

    expect(texts(tree).join(' ')).toMatch(/one chapter at a time/i);
  });
});
