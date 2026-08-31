/**
 * Adding notes is the one screen a student cannot work out by poking at it:
 * the shapes the parser reads are not guessable from an empty box, and a
 * line that rambles fails silently. This walkthrough is the only place that
 * is explained, so it has to actually say the three things.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { NotesHowTo } from '@/components/NotesHowTo';

function mount(visible = true) {
  const onClose = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<NotesHowTo visible={visible} onClose={onClose} />);
  });
  const said = () =>
    tree.root
      .findAllByType(Text)
      .map((n) => JSON.stringify(n.props.children ?? ''))
      .join(' ');
  const press = (label: string) => {
    const hits = tree.root.findAll(
      (n) =>
        typeof n.props?.onPress === 'function' &&
        n.findAllByType(Text).some((t) => JSON.stringify(t.props.children ?? '').includes(label)),
      { deep: true }
    );
    const target = hits[hits.length - 1];
    if (!target) throw new Error(`nothing showing "${label}"`);
    act(() => target.props.onPress());
  };
  return { tree, said, press, onClose };
}

describe('the add-notes walkthrough', () => {
  it('opens on what to paste, with a worked line', () => {
    const { said } = mount();
    expect(said()).toContain('Paste what you already wrote');
    expect(said()).toContain('Chlorophyll');
  });

  it('explains that nothing is saved until the questions are reviewed', () => {
    const { said, press } = mount();
    press('Next');
    expect(said()).toContain('Make the questions');
    expect(said()).toContain('Nothing is saved yet');
  });

  it('offers the reader for notes that are not in those shapes', () => {
    const { said, press } = mount();
    press('Next');
    press('Next');
    expect(said()).toContain('Notes not in those shapes?');
    // A student whose notes are paragraphs has to learn this before they
    // decide the app cannot read the way they write.
    expect(said()).toContain('paragraphs');
    // Both halves of the deal, on the same page as the offer.
    expect(said()).toContain('needs internet');
    expect(said()).toContain('ten readings a week');
    expect(said()).toContain('free, instant');
  });

  it('covers writing your own, and who supplies the wrong answers', () => {
    const { said, press } = mount();
    press('Next');
    press('Next');
    press('Next');
    expect(said()).toContain('Write your own');
    expect(said()).toContain('Flipp fills those in');
  });

  it('can be walked back', () => {
    const { said, press } = mount();
    press('Next');
    press('Back');
    expect(said()).toContain('Paste what you already wrote');
  });

  it('closes on the last page, and can be skipped from the first', () => {
    const walked = mount();
    walked.press('Next');
    walked.press('Next');
    walked.press('Next');
    walked.press('Got it');
    expect(walked.onClose).toHaveBeenCalled();

    const skipped = mount();
    skipped.press('Skip');
    expect(skipped.onClose).toHaveBeenCalled();
  });
});
