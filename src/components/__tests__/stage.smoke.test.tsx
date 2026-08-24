/**
 * Smoke tests for the exam stage: mount every piece in every state it can
 * be in. These catch what the type checker cannot — hook-order crashes,
 * undefined styles, bad props reaching native components.
 */
// expo-audio has no jest presence; the sfx choke point absorbs it.
jest.mock('@/lib/sfx', () => ({
  playSfx: jest.fn(),
  setSfxEnabled: jest.fn(),
}));

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BurningFire } from '@/components/BurningFire';
import { ComboMeter, comboColor } from '@/components/ComboMeter';
import { ExamSheet } from '@/components/ExamSheet';
import { FormatBadge, FORMAT_META } from '@/components/FormatBadge';
import {
  DayTint,
  DeskProp,
  EmberDrift,
  PageCount,
  PencilProgress,
} from '@/components/deskdress';
import { CircledWord } from '@/components/CircledWord';
import { InkSplat, PenCircle, PenStrike, PenTick, Stamp } from '@/components/penmarks';
import { RuledPaper, Squiggle, Tape } from '@/components/notebook';
import { fireFor } from '@/lib/fire';
import type { ExamFormat } from '@/lib/exam';
import { Text } from 'react-native';

const FORMATS: ExamFormat[] = [
  'multiple_choice',
  'true_false',
  'modified_true_false',
  'identification',
  'fill_blank',
  'matching',
  'enumeration',
];

function mount(el: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(el);
  });
  return tree;
}

function unmount(tree: ReactTestRenderer): void {
  act(() => tree.unmount());
}

jest.useFakeTimers();

describe('the stage mounts in every state', () => {
  it('ExamSheet renders for every format, dressed and bare', () => {
    for (const format of FORMATS) {
      const tree = mount(
        <ExamSheet
          format={format}
          title={format}
          accent="#2C8A4A"
          smudges={2}
          stars={3}
          idle
          mood="happy">
          <Text>page</Text>
        </ExamSheet>
      );
      expect(tree.toJSON()).toBeTruthy();
      unmount(tree);
    }
  });

  it('FormatBadge knows every format in both sizes', () => {
    for (const format of FORMATS) {
      expect(FORMAT_META[format]).toBeTruthy();
      const tree = mount(<FormatBadge format={format} size="lg" />);
      expect(tree.toJSON()).toBeTruthy();
      unmount(tree);
    }
  });

  it('ComboMeter survives its whole lifecycle', () => {
    const tree = mount(<ComboMeter combo={0} />);
    // silent below 3
    expect(tree.toJSON()).toBeNull();
    for (const combo of [3, 4, 5, 10, 20, 21]) {
      act(() => {
        tree.update(<ComboMeter combo={combo} idle={combo === 21} />);
      });
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(tree.toJSON()).toBeTruthy();
    }
    // the break
    act(() => {
      tree.update(<ComboMeter combo={0} />);
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    // back on it after the break
    act(() => {
      tree.update(<ComboMeter combo={1} />);
    });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    unmount(tree);
  });

  it('comboColor answers for any streak', () => {
    for (const n of [0, 3, 7, 12, 50]) {
      expect(comboColor(n)).toMatch(/^#/);
    }
  });

  it('the fire burns at every tier, lit and unlit', () => {
    for (const streak of [0, 1, 5, 10, 20, 50, 100, 200, 300, 365]) {
      const tree = mount(<BurningFire tier={fireFor(streak)} lit={streak > 0} />);
      expect(tree.toJSON()).toBeTruthy();
      unmount(tree);
    }
  });

  it('the deskmate holds every mood on every prop', () => {
    for (const format of FORMATS) {
      for (const mood of ['watch', 'happy', 'wince', 'sleep'] as const) {
        const tree = mount(<DeskProp format={format} idle={mood === 'sleep'} mood={mood} />);
        expect(tree.toJSON()).toBeTruthy();
        unmount(tree);
      }
    }
  });

  it('desk dressing renders through a whole paper', () => {
    for (const progress of [0, 0.4, 1]) {
      const tree = mount(<PencilProgress progress={progress} combo={progress * 20} />);
      expect(tree.toJSON()).toBeTruthy();
      unmount(tree);
    }
    const count = mount(<PageCount count={3} total={12} />);
    expect(JSON.stringify(count.toJSON())).toContain('3');
    unmount(count);
    unmount(mount(<DayTint />));
    const ember = mount(<EmberDrift nonce={1} />);
    act(() => {
      jest.advanceTimersByTime(1600);
    });
    unmount(ember);
  });

  it('every pen mark draws', () => {
    unmount(mount(<PenStrike />));
    unmount(mount(<PenTick delay={200} />));
    unmount(mount(<PenCircle width={60} height={24} />));
    unmount(mount(<CircledWord word="like" />));
    const stamp = mount(<Stamp label="TRUE" tone="right" />);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    unmount(stamp);
    unmount(mount(<InkSplat color="#3B7527" nonce={1} />));
  });

  it('notebook furniture stands', () => {
    unmount(mount(<RuledPaper />));
    unmount(mount(<Tape rotate="3deg" />));
    unmount(mount(<Squiggle width={96} color="#2C8A4A" />));
  });
});
