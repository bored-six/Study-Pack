import { capacityFor, emptyCounts, spreadCounts, totalOf, type ExamFormat } from '../exam';
import {
  FIRST_TARGET,
  firstSetup,
  readSavedSetup,
  saveSetup,
  trimSetup,
  type ExamSetup,
} from '../setup';

// The settings table stands in as a plain map — these are rules about a
// remembered paper, not about SQLite.
const mockStore = new Map<string, string>();
jest.mock('../db', () => ({
  readSetting: async (key: string) => mockStore.get(key) ?? null,
  writeSetting: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
}));

beforeEach(() => mockStore.clear());

function room(partial: Partial<Record<ExamFormat, number>>): Record<ExamFormat, number> {
  return { ...emptyCounts(), ...partial };
}

const WIDE = room({
  multiple_choice: 40,
  true_false: 40,
  modified_true_false: 20,
  identification: 30,
  fill_blank: 12,
  matching: 4,
  enumeration: 6,
});

describe('spreading a total across the ticked types', () => {
  it('splits evenly rather than by how lopsided the notes are', () => {
    const counts = spreadCounts(['multiple_choice', 'true_false'], 20, WIDE);
    expect(counts.multiple_choice).toBe(10);
    expect(counts.true_false).toBe(10);
    expect(totalOf(counts)).toBe(20);
  });

  it('hands the share of a type that runs out back to the others', () => {
    // Matching can only fill four grids, so the other twenty-six go to the
    // two types that have the room for them.
    const counts = spreadCounts(['multiple_choice', 'true_false', 'matching'], 30, WIDE);
    expect(counts.matching).toBe(4);
    expect(totalOf(counts)).toBe(30);
    expect(counts.multiple_choice).toBe(13);
    expect(counts.true_false).toBe(13);
  });

  it('gives every ticked type at least one before any gets a second', () => {
    const picks: ExamFormat[] = ['multiple_choice', 'true_false', 'identification'];
    const counts = spreadCounts(picks, 3, WIDE);
    for (const format of picks) expect(counts[format]).toBe(1);
  });

  it('never asks for more than the notes can produce', () => {
    const counts = spreadCounts(['matching', 'enumeration'], 500, WIDE);
    expect(totalOf(counts)).toBe(capacityFor(['matching', 'enumeration'], WIDE));
  });

  it('comes back empty for nothing ticked, and for a nonsense total', () => {
    expect(totalOf(spreadCounts([], 20, WIDE))).toBe(0);
    expect(totalOf(spreadCounts(['multiple_choice'], NaN, WIDE))).toBe(0);
    expect(totalOf(spreadCounts(['multiple_choice'], -5, WIDE))).toBe(0);
  });

  it('skips a ticked type the notes can no longer fill', () => {
    const thin = room({ multiple_choice: 10 });
    const counts = spreadCounts(['multiple_choice', 'matching'], 10, thin);
    expect(counts.matching).toBe(0);
    expect(counts.multiple_choice).toBe(10);
  });
});

describe('a first sitting', () => {
  it('opens on a short multiple-choice paper', () => {
    const setup = firstSetup(WIDE);
    expect(setup.picks).toEqual(['multiple_choice']);
    expect(totalOf(setup.counts)).toBe(FIRST_TARGET);
  });

  it('falls to whatever the notes can do when multiple choice is impossible', () => {
    const setup = firstSetup(room({ enumeration: 6 }));
    expect(setup.picks).toEqual(['enumeration']);
    expect(totalOf(setup.counts)).toBe(6);
  });
});

describe('the remembered paper', () => {
  const SAVED: ExamSetup = {
    mode: 'rapid',
    picks: ['true_false', 'identification'],
    target: 24,
    custom: false,
    counts: spreadCounts(['true_false', 'identification'], 24, WIDE),
  };

  it('comes back as it was left', () => {
    const setup = trimSetup(SAVED, WIDE);
    expect(setup?.mode).toBe('rapid');
    expect(setup?.picks).toEqual(['true_false', 'identification']);
    expect(totalOf(setup!.counts)).toBe(24);
  });

  it('survives a round trip through the settings table', async () => {
    await saveSetup('note:1', SAVED);
    expect(trimSetup(await readSavedSetup('note:1'), WIDE)).toEqual(trimSetup(SAVED, WIDE));
    expect(await readSavedSetup('note:2')).toBeNull();
  });

  it('drops a type the notes no longer support and re-spreads the total', () => {
    const setup = trimSetup(SAVED, room({ true_false: 40 }));
    expect(setup?.picks).toEqual(['true_false']);
    // The paper stays the length it was; only what fills it changed.
    expect(totalOf(setup!.counts)).toBe(24);
  });

  it('gives up when nothing it remembers can be built any more', () => {
    expect(trimSetup(SAVED, room({ multiple_choice: 40 }))).toBeNull();
  });

  it('keeps hand-set amounts exactly, clamped to what is there', () => {
    const byHand: ExamSetup = {
      mode: 'relaxed',
      picks: ['multiple_choice', 'matching'],
      target: 22,
      custom: true,
      counts: { ...emptyCounts(), multiple_choice: 20, matching: 2 },
    };
    const setup = trimSetup(byHand, room({ multiple_choice: 8, matching: 4 }));
    expect(setup?.custom).toBe(true);
    expect(setup?.counts.multiple_choice).toBe(8);
    expect(setup?.counts.matching).toBe(2);
    expect(setup?.target).toBe(10);
  });

  it('refuses junk rather than opening on an unusable paper', () => {
    expect(trimSetup(null, WIDE)).toBeNull();
    expect(trimSetup('not an object', WIDE)).toBeNull();
    expect(trimSetup({ picks: ['nonsense'], target: 10 }, WIDE)).toBeNull();
    expect(trimSetup({ picks: ['matching'], custom: true, counts: {} }, WIDE)).toBeNull();
  });

  it('falls back to a sensible mode and length when those are missing', () => {
    const setup = trimSetup({ picks: ['true_false'] }, WIDE);
    expect(setup?.mode).toBe('relaxed');
    expect(totalOf(setup!.counts)).toBe(FIRST_TARGET);
  });

  it('never comes back with a ticked type worth no questions', () => {
    const setup = trimSetup(
      { picks: ['multiple_choice', 'true_false', 'identification'], target: 1 },
      WIDE
    );
    for (const format of setup!.picks) expect(setup!.counts[format]).toBeGreaterThan(0);
  });
});
