import { FORMAT_ORDER } from '@/lib/exam';
import {
  initPrefs,
  loadPrefs,
  setBriefings,
  setIntro,
  setSound,
  setVibration,
} from '@/lib/prefs';
import { setHapticsEnabled } from '@/lib/haptics';
import { setSfxEnabled } from '@/lib/sfx';

const mockStore = new Map<string, string>();

jest.mock('@/lib/db', () => ({
  readSetting: async (key: string) => mockStore.get(key) ?? null,
  writeSetting: async (key: string, value: string) => {
    mockStore.set(key, value);
  },
}));
jest.mock('@/lib/sfx', () => ({ setSfxEnabled: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ setHapticsEnabled: jest.fn() }));

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('reading preferences', () => {
  it('gives a fresh install everything switched on', async () => {
    expect(await loadPrefs()).toEqual({
      sound: true,
      vibration: true,
      intro: true,
      briefings: true,
      dark: false,
    });
  });

  it("keeps a phone that was already muted muted — '1' means off", async () => {
    mockStore.set('sfx_muted', '1');
    mockStore.set('haptics_muted', '1');
    mockStore.set('intro_skip', '1');

    const prefs = await loadPrefs();
    expect(prefs.sound).toBe(false);
    expect(prefs.vibration).toBe(false);
    expect(prefs.intro).toBe(false);
  });

  it('reads briefings off only when every format has been skipped', async () => {
    mockStore.set('briefing_skip', JSON.stringify([]));
    expect((await loadPrefs()).briefings).toBe(true);

    // Formats hidden one at a time from inside an exam: the toggle still
    // reads as on, because some formats do still explain themselves.
    mockStore.set('briefing_skip', JSON.stringify(['true_false', 'matching']));
    expect((await loadPrefs()).briefings).toBe(true);

    mockStore.set('briefing_skip', JSON.stringify(FORMAT_ORDER));
    expect((await loadPrefs()).briefings).toBe(false);
  });

  it('falls back to showing briefings when the stored list is corrupt', async () => {
    mockStore.set('briefing_skip', 'not json');
    expect((await loadPrefs()).briefings).toBe(true);
  });
});

describe('writing preferences', () => {
  it('mutes the sound module as well as the database', async () => {
    await setSound(false);
    expect(setSfxEnabled).toHaveBeenCalledWith(false);
    expect(mockStore.get('sfx_muted')).toBe('1');

    await setSound(true);
    expect(setSfxEnabled).toHaveBeenLastCalledWith(true);
    expect(mockStore.get('sfx_muted')).toBe('0');
  });

  it('stops the buzz without touching the sound', async () => {
    await setVibration(false);
    expect(setHapticsEnabled).toHaveBeenCalledWith(false);
    expect(setSfxEnabled).not.toHaveBeenCalled();
    expect(mockStore.get('haptics_muted')).toBe('1');
  });

  it('remembers a skipped intro', async () => {
    await setIntro(false);
    expect(mockStore.get('intro_skip')).toBe('1');
  });

  it('turning briefings back on clears every format that was hidden', async () => {
    mockStore.set('briefing_skip', JSON.stringify(['true_false', 'matching']));
    await setBriefings(true);
    expect(JSON.parse(mockStore.get('briefing_skip') as string)).toEqual([]);
  });

  it('turning briefings off hides all of them, not just the ones seen so far', async () => {
    await setBriefings(false);
    expect(JSON.parse(mockStore.get('briefing_skip') as string)).toEqual(FORMAT_ORDER);
  });
});

describe('launch', () => {
  it('pushes the stored flags into the modules that act on them', async () => {
    mockStore.set('sfx_muted', '1');
    const prefs = await initPrefs();

    expect(prefs.sound).toBe(false);
    expect(setSfxEnabled).toHaveBeenCalledWith(false);
    expect(setHapticsEnabled).toHaveBeenCalledWith(true);
  });
});
