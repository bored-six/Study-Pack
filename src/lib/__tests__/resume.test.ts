import { RESUME_MAX_AGE_MS, clearSnapshot, readSnapshot, saveSnapshot } from '../resume';

// The settings table stands in as a plain map — this is about the rules
// around a snapshot, not about SQLite.
const mockStore = new Map<string, string>();
jest.mock('../db', () => ({
  readSetting: async (key: string) => mockStore.get(key) ?? null,
  writeSetting: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
}));

beforeEach(() => mockStore.clear());

const NOW = new Date(2026, 7, 24, 12, 0, 0).getTime();

describe('exam snapshots', () => {
  it('reads back what was written', async () => {
    await saveSnapshot('note:1', 'Biology', { index: 3, results: ['a'] });
    const snapshot = await readSnapshot(NOW);
    expect(snapshot?.deckId).toBe('note:1');
    expect(snapshot?.deckName).toBe('Biology');
    expect(snapshot?.state).toEqual({ index: 3, results: ['a'] });
  });

  it('has nothing to offer when none was saved', async () => {
    expect(await readSnapshot(NOW)).toBeNull();
  });

  it('forgets a sitting once it is cleared', async () => {
    await saveSnapshot('note:1', 'Biology', { index: 1 });
    await clearSnapshot();
    expect(await readSnapshot(NOW)).toBeNull();
  });

  it('will not resume a sitting from days ago', async () => {
    await saveSnapshot('note:1', 'Biology', { index: 1 });
    const stale = Date.now() + RESUME_MAX_AGE_MS + 1000;
    expect(await readSnapshot(stale)).toBeNull();
  });

  it('ignores a snapshot written by an older build', async () => {
    mockStore.set('exam_in_progress', JSON.stringify({ version: 0, deckId: 'x', savedAt: Date.now(), state: {} }));
    expect(await readSnapshot(NOW)).toBeNull();
  });

  it('survives a corrupted snapshot rather than throwing', async () => {
    mockStore.set('exam_in_progress', '{not json');
    await expect(readSnapshot(NOW)).resolves.toBeNull();
  });

  it('rejects a snapshot with nothing in it', async () => {
    mockStore.set('exam_in_progress', JSON.stringify({ version: 1, deckId: '', savedAt: Date.now(), state: null }));
    expect(await readSnapshot(NOW)).toBeNull();
  });
});
