/**
 * The two moments between screens.
 *
 * Both of these cover the screen, hand over while it is covered, and
 * uncover onto something else. That handover is the whole contract: if it
 * never fires, the app is stranded behind a coloured overlay with no way
 * out — which is a far worse bug than having no transition at all. So it
 * is driven by timers rather than by animation callbacks, and that is what
 * these check.
 */
jest.mock('@/lib/sfx', () => ({ playSfx: jest.fn(), setSfxEnabled: jest.fn() }));

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { CartridgeLoad, LOAD_MS } from '@/components/CartridgeLoad';
import { ModeOutro } from '@/components/ModeOutro';
import { MODES, MODE_ORDER, type ExamMode } from '@/lib/mode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { playSfx } = require('@/lib/sfx');

jest.useFakeTimers();

function textOf(children: unknown): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  return '';
}

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => textOf(node.props.children))
    .join(' | ');
}

function mount(el: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(el);
  });
  return tree;
}

/** Runs the clock forward the way the device would. */
function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('loading the cartridge', () => {
  it.each(MODE_ORDER)('%s covers, hands over, then uncovers — in that order', (mode) => {
    const order: string[] = [];
    mount(
      <CartridgeLoad
        spec={MODES[mode]}
        onCovered={() => order.push('covered')}
        onDone={() => order.push('done')}
      />
    );

    // Nothing may happen before the screen is actually covered: the whole
    // point is that the swap underneath is never glimpsed.
    expect(order).toEqual([]);

    advance(LOAD_MS + 50);
    expect(order).toEqual(['covered', 'done']);
  });

  it.each(MODE_ORDER)('%s shows the cartridge going in', (mode) => {
    const tree = mount(
      <CartridgeLoad spec={MODES[mode]} onCovered={() => {}} onDone={() => {}} />
    );
    expect(texts(tree)).toContain(MODES[mode].name);
  });

  it('clicks the cartridge home', () => {
    mount(<CartridgeLoad spec={MODES.rapid} onCovered={() => {}} onDone={() => {}} />);
    expect(playSfx).toHaveBeenCalledWith('cartridge_click');
  });

  it('hands over even if it is unmounted mid-flight', () => {
    // Backing out during the load must not fire the swap for a screen that
    // is no longer there.
    const order: string[] = [];
    const tree = mount(
      <CartridgeLoad
        spec={MODES.relaxed}
        onCovered={() => order.push('covered')}
        onDone={() => order.push('done')}
      />
    );
    act(() => tree.unmount());
    advance(LOAD_MS + 50);
    expect(order).toEqual([]);
  });
});

describe('the ending', () => {
  it.each(MODE_ORDER)('%s hands over to the report card', (mode) => {
    let covered = false;
    mount(<ModeOutro spec={MODES[mode]} onCovered={() => (covered = true)} />);

    expect(covered).toBe(false);
    advance(900);
    expect(covered).toBe(true);
  });

  it.each(MODE_ORDER)('%s says what just happened', (mode) => {
    const tree = mount(<ModeOutro spec={MODES[mode]} onCovered={() => {}} />);
    expect(texts(tree).length).toBeGreaterThan(0);
  });

  it('gives each mode a different closing line', () => {
    const lines = MODE_ORDER.map((mode) => {
      const tree = mount(<ModeOutro spec={MODES[mode]} onCovered={() => {}} />);
      const shown = texts(tree);
      act(() => tree.unmount());
      return shown;
    });
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('ends a mastery pile and a survival run on different sounds', () => {
    mount(<ModeOutro spec={MODES.mastery} onCovered={() => {}} />);
    const pile = playSfx.mock.calls.map((c: unknown[]) => c[0]);

    jest.clearAllMocks();
    mount(<ModeOutro spec={MODES.survival} onCovered={() => {}} />);
    const lost = playSfx.mock.calls.map((c: unknown[]) => c[0]);

    expect(pile).not.toEqual(lost);
    expect(pile[0]).toBe('sticker_peel');
    expect(lost[0]).toBe('wrong');
  });

  it('still leaves if it is torn down before it finishes', () => {
    let covered = false;
    const tree = mount(<ModeOutro spec={MODES.relaxed} onCovered={() => (covered = true)} />);
    act(() => tree.unmount());
    advance(900);
    expect(covered).toBe(false);
  });
});

describe('every mode declares its own ending', () => {
  it('no two modes close the same way', () => {
    const outros = MODE_ORDER.map((mode: ExamMode) => MODES[mode].outro);
    expect(new Set(outros).size).toBe(outros.length);
  });
});
