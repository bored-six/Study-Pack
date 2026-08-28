import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';

import { SubjectSheet } from '../SubjectSheet';
import { ChunkyButton } from '../ChunkyButton';
import type { Deck } from '@/lib/types';

const subject: Deck = {
  id: 'note:1',
  categoryId: 0,
  name: 'Biology',
  difficulty: 'medium',
  questionCount: 12,
  source: 'notes',
  color: null,
  icon: null,
  downloadedAt: 1,
};

/** Opens the sheet and returns helpers for driving it like a student would. */
function open(deck: Deck = subject) {
  const onSave = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SubjectSheet
        visible
        subject={deck}
        onClose={jest.fn()}
        onSave={onSave}
        onDelete={jest.fn()}
      />
    );
  });

  /** The glyph names currently offered in the grid (the preview aside). */
  /**
   * The glyphs on the shelf that is showing.
   *
   * This used to take every Icon on screen and drop index 0 for the header
   * preview, which quietly counted the trash icon in the Delete row as a
   * shelf glyph and made School read as 15. Going by the cells themselves
   * counts the grid and nothing else.
   */
  const gridIcons = () =>
    tree.root
      .findAll(
        (node) =>
          node.props?.accessibilityRole === 'button' &&
          'selected' in (node.props?.accessibilityState ?? {}),
        // Pressable passes its props down through several layers, so without
        // this every cell is counted once per layer.
        { deep: false }
      )
      .map((node) => node.props.accessibilityLabel as string);

  const press = (node: ReactTestInstance) => act(() => node.props.onPress());

  /** Taps the pressable wrapping a piece of text — shelf chips, mostly. */
  const tapText = (label: string) => {
    const text = tree.root
      .findAllByType(Text)
      .find((node) => node.props.children === label);
    if (!text) throw new Error(`No text "${label}"`);
    let node: ReactTestInstance | null = text.parent;
    while (node && typeof node.props?.onPress !== 'function') node = node.parent;
    if (!node) throw new Error(`Nothing pressable around "${label}"`);
    press(node);
  };

  return {
    onSave,
    gridIcons,
    tapText,
    rename: (value: string) =>
      act(() => tree.root.findByType(TextInput).props.onChangeText(value)),
    name: () => tree.root.findByType(TextInput).props.value as string,
    save: () => press(tree.root.findByType(ChunkyButton)),
    saveDisabled: () => tree.root.findByType(ChunkyButton).props.disabled === true,
  };
}

describe('SubjectSheet', () => {
  it('seeds the name field with the subject and saves the edited name', () => {
    const sheet = open();
    expect(sheet.name()).toBe('Biology');

    sheet.rename('Bio 101');
    sheet.save();

    expect(sheet.onSave).toHaveBeenCalledWith('note:1', 'Bio 101', null, null);
  });

  it('trims the name and refuses to save a blank one', () => {
    const sheet = open();

    sheet.rename('   ');
    expect(sheet.saveDisabled()).toBe(true);

    sheet.rename('  History  ');
    sheet.save();
    expect(sheet.onSave).toHaveBeenCalledWith('note:1', 'History', null, null);
  });

  it('shows one shelf of icons at a time, and swaps on tap', () => {
    const sheet = open();
    const school = sheet.gridIcons();

    expect(school).toContain('book');
    expect(school).not.toContain('gamepad');
    expect(school.length).toBeLessThan(15); // a couple of rows, not a scroll

    sheet.tapText('Fun');
    const fun = sheet.gridIcons();
    expect(fun).toContain('gamepad');
    expect(fun).not.toContain('book');
  });

  it('opens on the shelf holding the icon the subject already wears', () => {
    const sheet = open({ ...subject, icon: 'clapper' });
    expect(sheet.gridIcons()).toContain('clapper');
  });

  it('keeps the chosen colour and icon when only the name changes', () => {
    const sheet = open({ ...subject, color: '#FCEBC0', icon: 'flask' });

    sheet.rename('Chemistry');
    sheet.save();

    expect(sheet.onSave).toHaveBeenCalledWith('note:1', 'Chemistry', '#FCEBC0', 'flask');
  });
});
