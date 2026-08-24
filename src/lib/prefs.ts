/**
 * The four things a student can switch about the app itself, in one place.
 *
 * Everything here lives in the same `settings` table the rest of the app
 * uses, so a preference survives a reinstall exactly as well as the notes
 * do — which is to say, only as long as the app is installed. There is no
 * account to sync from, and that is the whole point.
 *
 * Keys keep their original names and their original "1 means off" sense so
 * a phone that has been muting sounds since v1 stays muted after upgrading.
 */
import { FORMAT_ORDER } from './exam';
import { readSetting, writeSetting } from './db';
import { setHapticsEnabled } from './haptics';
import { setSfxEnabled } from './sfx';

export interface Prefs {
  /** Blups, boings, and the sad trombone. */
  sound: boolean;
  /** The buzz under a right or wrong answer. */
  vibration: boolean;
  /** The flip animation when the app opens. */
  intro: boolean;
  /** Auto-show the how-to the first time a format appears in a paper. */
  briefings: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  sound: true,
  vibration: true,
  intro: true,
  briefings: true,
};

const SOUND_KEY = 'sfx_muted';
const VIBRATION_KEY = 'haptics_muted';
const INTRO_KEY = 'intro_skip';
/** Shared with the exam runner, which reads it as "formats to skip". */
const BRIEFINGS_KEY = 'briefing_skip';

/** A '1'/'0' flag where the stored value means *off*. */
function readFlag(raw: string | null): boolean {
  return raw !== '1';
}

/**
 * Briefings are stored as the list of formats to skip, because the exam
 * runner needs that granularity — the checkbox in a briefing hides one
 * format. The settings toggle is the blunt version of the same list:
 * empty means every format still explains itself.
 */
function readBriefings(raw: string | null): boolean {
  if (!raw) return true;
  try {
    return (JSON.parse(raw) as string[]).length < FORMAT_ORDER.length;
  } catch {
    return true;
  }
}

export async function loadPrefs(): Promise<Prefs> {
  const [sound, vibration, intro, briefings] = await Promise.all([
    readSetting(SOUND_KEY),
    readSetting(VIBRATION_KEY),
    readSetting(INTRO_KEY),
    readSetting(BRIEFINGS_KEY),
  ]);
  return {
    sound: readFlag(sound),
    vibration: readFlag(vibration),
    intro: readFlag(intro),
    briefings: readBriefings(briefings),
  };
}

/** Pushes the flags into the modules that act on them. */
export function applyPrefs(prefs: Prefs): void {
  setSfxEnabled(prefs.sound);
  setHapticsEnabled(prefs.vibration);
}

/** Reads and applies in one go — what the app does on launch. */
export async function initPrefs(): Promise<Prefs> {
  const prefs = await loadPrefs();
  applyPrefs(prefs);
  return prefs;
}

export async function setSound(on: boolean): Promise<void> {
  setSfxEnabled(on);
  await writeSetting(SOUND_KEY, on ? '0' : '1');
}

export async function setVibration(on: boolean): Promise<void> {
  setHapticsEnabled(on);
  await writeSetting(VIBRATION_KEY, on ? '0' : '1');
}

export async function setIntro(on: boolean): Promise<void> {
  await writeSetting(INTRO_KEY, on ? '0' : '1');
}

/**
 * Turning briefings back on clears the whole skip list, including formats
 * hidden one at a time from inside an exam — this is the only way back.
 */
export async function setBriefings(on: boolean): Promise<void> {
  await writeSetting(BRIEFINGS_KEY, JSON.stringify(on ? [] : FORMAT_ORDER));
}
