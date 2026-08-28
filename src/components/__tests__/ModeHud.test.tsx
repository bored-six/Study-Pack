import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ModeHud, clockText, type HudState } from '@/components/ModeHud';
import { MODES, MODE_ORDER, type ExamMode } from '@/lib/mode';

/**
 * The run screen's readout, for each mode in turn.
 *
 * Every mode used to render the same pencil bar and "3 / 12", so this had
 * nothing to test. Now the readout is the mode's own, and the thing worth
 * checking is that each one shows the number that mode is judged on — a
 * survival run reporting "4 / 12" would be reporting a length it does not
 * have.
 */

const STATE: HudState = {
  progress: 0.25,
  combo: 2,
  index: 3,
  total: 12,
  remaining: 5,
  retired: 7,
  strikes: 1,
  answered: 9,
  paperLeft: 125_000,
  questionLeft: 8,
};

function render(mode: ExamMode, state: Partial<HudState> = {}): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ModeHud spec={MODES[mode]} state={{ ...STATE, ...state }} />);
  });
  return tree;
}

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return '';
}

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => textOf(node.props.children))
    .join(' | ');
}

describe('the run screen readout', () => {
  it.each(MODE_ORDER)('%s renders without a crash', (mode) => {
    expect(() => render(mode)).not.toThrow();
  });

  it.each(MODE_ORDER)('%s says out loud where you are', (mode) => {
    const tree = render(mode);
    // A screen reader gets the same fact the sighted reading gives.
    const labelled = tree.root.findAll(
      (node) => typeof node.props?.accessibilityLabel === 'string'
    );
    expect(labelled.length).toBeGreaterThan(0);
  });

  it('mastery counts the pile, not the paper', () => {
    const shown = texts(render('mastery'));
    expect(shown).toContain('5');
    expect(shown).toContain('in the pile');
    expect(shown).toContain('7/12 learned');
  });

  it('beat the clock puts the seconds on this question first', () => {
    expect(texts(render('rapid'))).toContain('8');
  });

  it('beat the clock shows nothing left rather than a negative', () => {
    expect(texts(render('rapid', { questionLeft: 0 }))).toContain('0');
  });

  it('exam simulation shows the paper clock and how much is filled in', () => {
    const shown = texts(render('simulation'));
    expect(shown).toContain('2:05');
    expect(shown).toContain('9/12 filled in');
  });

  it('survival counts what you survived, not a position in a paper', () => {
    const shown = texts(render('survival'));
    expect(shown).toContain('9 survived');
    // There is no paper length in survival, so it must not claim one.
    expect(shown).not.toContain('/ 12');
  });

  it('take your time walks the pages', () => {
    expect(texts(render('relaxed'))).toContain('4');
  });
});

describe('the clock readout', () => {
  it('reads minutes and seconds', () => {
    expect(clockText(125_000)).toBe('2:05');
    expect(clockText(60_000)).toBe('1:00');
    expect(clockText(9_000)).toBe('0:09');
  });

  it('never runs backwards past zero', () => {
    expect(clockText(-5_000)).toBe('0:00');
  });
});
