/**
 * Smoke tests for the album pieces and the firefly jar.
 *
 * These mount every sticker in both states and the jar at every tier —
 * the cases the type checker cannot reach: hook-order crashes inside the
 * per-firefly animations, and shape lookups that miss a family.
 */
jest.mock('@/lib/sfx', () => ({
  playSfx: jest.fn(),
  setSfxEnabled: jest.fn(),
}));

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AchievementSticker } from '@/components/AchievementSticker';
import { DoodleFlame, coreOutline, flameOutline } from '@/components/DoodleFlame';
import {
  ACHIEVEMENTS,
  FAMILY_ORDER,
  type AchievementFamily,
} from '@/lib/achievements';
import { FIRE_TIERS } from '@/lib/fire';

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

describe('the album', () => {
  it('holds exactly thirty stickers', () => {
    expect(ACHIEVEMENTS).toHaveLength(30);
  });

  it('splits into five families of six, so every shelf is a full set', () => {
    for (const family of FAMILY_ORDER) {
      expect(ACHIEVEMENTS.filter((a) => a.family === family)).toHaveLength(6);
    }
  });

  it('gives every achievement a family the album knows how to draw', () => {
    for (const def of ACHIEVEMENTS) {
      expect(FAMILY_ORDER).toContain(def.family);
    }
  });

  it('never repeats an id', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws every family locked and unlocked', () => {
    for (const family of FAMILY_ORDER as AchievementFamily[]) {
      const earned = mount(<AchievementSticker family={family} icon="star" />);
      expect(earned.toJSON()).toBeTruthy();
      unmount(earned);

      const locked = mount(<AchievementSticker family={family} />);
      expect(locked.toJSON()).toBeTruthy();
      unmount(locked);
    }
  });

  it('draws every real achievement with its own icon', () => {
    for (const def of ACHIEVEMENTS) {
      const tree = mount(<AchievementSticker family={def.family} icon={def.icon} />);
      expect(tree.toJSON()).toBeTruthy();
      unmount(tree);
    }
  });
});

describe('the doodle flame', () => {
  it('mounts at every tier, lit', () => {
    for (const tier of FIRE_TIERS) {
      const tree = mount(<DoodleFlame tier={tier} lit />);
      expect(tree.toJSON()).toBeTruthy();
      unmount(tree);
    }
  });

  it('mounts unlit — a streak of nothing still draws the pencil ghost', () => {
    const tree = mount(<DoodleFlame tier={FIRE_TIERS[0]} lit={false} />);
    expect(tree.toJSON()).toBeTruthy();
    unmount(tree);
  });

  it('keeps running once the animations have ticked', () => {
    const tree = mount(<DoodleFlame tier={FIRE_TIERS[FIRE_TIERS.length - 1]} lit />);
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(tree.toJSON()).toBeTruthy();
    unmount(tree);
  });

  /**
   * The outline is generated per frame rather than picked from a set of
   * drawings, which is what removes the frame-rate ceiling. These guard
   * the generator: it must stay a closed path, stay inside the 64-unit
   * box, and actually differ from moment to moment.
   */
  it('draws a closed path that stays inside the box', () => {
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      for (const d of [flameOutline(t, 1, 1), coreOutline(t, 1)]) {
        expect(d.startsWith('M')).toBe(true);
        expect(d.endsWith('Z')).toBe(true);
        const numbers = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
        expect(Math.min(...numbers)).toBeGreaterThan(0);
        expect(Math.max(...numbers)).toBeLessThan(64);
      }
    }
  });

  it('is a different shape at every moment of the swirl', () => {
    const shapes = new Set<string>();
    for (let i = 0; i < 60; i++) shapes.add(flameOutline((i / 60) * Math.PI * 2, 1, 1));
    expect(shapes.size).toBe(60);
  });

  it('closes its loop seamlessly, so the swirl never jumps', () => {
    expect(flameOutline(0, 1, 1)).toBe(flameOutline(Math.PI * 2, 1, 1));
  });

  it('holds still when the streak is unlit', () => {
    expect(flameOutline(1.2, 1, 0)).toBe(flameOutline(4.8, 1, 0));
  });
});
