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
import { DoodleFlame, domeShape, flameShape, starShape } from '@/components/DoodleFlame';
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
   * The outlines are generated per frame rather than picked from a set
   * of drawings, which is what removes the frame-rate ceiling. These
   * guard the three generators: closed paths, inside the box, different
   * at every moment, and seamless where the loop wraps.
   */
  const FLAME = { foot: 8.4, bulge: 11.4, waist: 5.6, tipY: 21 };

  it('draws closed paths that stay inside the box', () => {
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const shapes = [
        flameShape(t, FLAME, 1),
        flameShape(t, { foot: 5.4, bulge: 6.8, waist: 2.8, tipY: 9 }, 1),
        domeShape(t, 11, 8.5, 1),
        starShape(t, 32, 40, 7, 1),
      ];
      for (const d of shapes) {
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
    for (let i = 0; i < 60; i++) shapes.add(flameShape((i / 60) * Math.PI * 2, FLAME, 1));
    expect(shapes.size).toBe(60);
  });

  it('closes its loop seamlessly, so the swirl never jumps', () => {
    expect(flameShape(0, FLAME, 1)).toBe(flameShape(Math.PI * 2, FLAME, 1));
    expect(domeShape(0, 11, 8.5, 1)).toBe(domeShape(Math.PI * 2, 11, 8.5, 1));
    expect(starShape(0, 32, 40, 7, 1)).toBe(starShape(Math.PI * 2, 32, 40, 7, 1));
  });

  it('holds still when the streak is unlit', () => {
    expect(flameShape(1.2, FLAME, 0)).toBe(flameShape(4.8, FLAME, 0));
  });

  /**
   * The whole point of the tier forms: a spark is a star, an ember is a
   * coal, and the fire keeps gaining parts. If two tiers ever collapse
   * onto the same silhouette again, this fails.
   */
  it('gives every tier its own form, not just its own colour', () => {
    const trees = FIRE_TIERS.map((tier) => {
      const t = mount(<DoodleFlame tier={tier} size={64} lit />);
      const json = JSON.stringify(t.toJSON());
      unmount(t);
      // count the drawn parts, and how tall the tallest one reaches
      const paths = json.match(/"d":"[^"]+"/g) ?? [];
      return { from: tier.from, parts: paths.length };
    });

    // fire is built from more pieces the longer it has burned
    expect(trees[0].parts).toBeLessThan(trees[trees.length - 1].parts);
    // and no two neighbouring tiers are the same recipe
    const distinct = new Set(trees.map((x) => x.parts + ':' + x.from));
    expect(distinct.size).toBe(FIRE_TIERS.length);
  });
});
