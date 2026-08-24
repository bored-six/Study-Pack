import { capacityFor, emptyCounts, spreadCounts, totalOf, type ExamFormat } from '../exam';
import {
  DEFAULT_PER_TYPE,
  firstSetup,
  picksIn,
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
    expect(picksIn(setup.counts)).toEqual(['multiple_choice']);
    expect(totalOf(setup.counts)).toBe(DEFAULT_PER_TYPE);
  });

  it('falls to whatever the notes can do when multiple choice is impossible', () => {
    const setup = firstSetup(room({ enumeration: 6 }));
    expect(picksIn(setup.counts)).toEqual(['enumeration']);
    expect(totalOf(setup.counts)).toBe(6);
  });

  it('has nothing to offer a subject with no questions at all', () => {
    expect(totalOf(firstSetup(emptyCounts()).counts)).toBe(0);
  });
});

describe('the remembered paper', () => {
  const SAVED: ExamSetup = {
    mode: 'rapid',
    counts: { ...emptyCounts(), true_false: 14, identification: 3 },
  };

  it('comes back with every amount exactly as it was left', () => {
    const setup = trimSetup(SAVED, WIDE);
    expect(setup?.mode).toBe('rapid');
    expect(setup?.counts.true_false).toBe(14);
    expect(setup?.counts.identification).toBe(3);
    expect(totalOf(setup!.counts)).toBe(17);
  });

  it('survives a round trip through the settings table', async () => {
    await saveSetup('note:1', SAVED);
    expect(trimSetup(await readSavedSetup('note:1'), WIDE)).toEqual(trimSetup(SAVED, WIDE));
    expect(await readSavedSetup('note:2')).toBeNull();
  });

  it('drops a type the notes no longer support, and keeps the rest', () => {
    const setup = trimSetup(SAVED, room({ true_false: 40 }));
    expect(picksIn(setup!.counts)).toEqual(['true_false']);
    expect(setup?.counts.true_false).toBe(14);
  });

  it('clamps an amount the notes can no longer reach', () => {
    const setup = trimSetup(SAVED, room({ true_false: 5, identification: 30 }));
    expect(setup?.counts.true_false).toBe(5);
    expect(setup?.counts.identification).toBe(3);
  });

  it('gives up when nothing it remembers can be built any more', () => {
    expect(trimSetup(SAVED, room({ multiple_choice: 40 }))).toBeNull();
  });

  it('refuses junk rather than opening on an unusable paper', () => {
    expect(trimSetup(null, WIDE)).toBeNull();
    expect(trimSetup('not an object', WIDE)).toBeNull();
    expect(trimSetup({ counts: { multiple_choice: 'ten' } }, WIDE)).toBeNull();
    expect(trimSetup({ counts: { nonsense: 10 } }, WIDE)).toBeNull();
    expect(trimSetup({ counts: { multiple_choice: -4 } }, WIDE)).toBeNull();
  });

  it('falls back to a sensible mode when the saved one is gone', () => {
    const setup = trimSetup({ counts: { true_false: 8 } }, WIDE);
    expect(setup?.mode).toBe('relaxed');
    expect(setup?.counts.true_false).toBe(8);
  });
});
