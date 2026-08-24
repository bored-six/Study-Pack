/**
 * Keeping an unfinished sitting alive across a restart.
 *
 * The exam only ever lived in memory, so anything that reloaded the app —
 * the phone sitting locked long enough for the OS to reclaim it, a dev
 * reload — silently threw the paper away and dropped the student on Home.
 * That is worst in the mode called "Take your time".
 *
 * A snapshot is written to the settings table as the sitting moves, and read
 * back on the next launch. Only the answers matter, so what's stored is the
 * built paper plus where the student got to; everything else is rebuilt.
 */

import { readSetting, writeSetting } from './db';

/** Bump when the snapshot shape changes; older ones are then ignored. */
const SNAPSHOT_VERSION = 1;
const KEY = 'exam_in_progress';

/** Older than this and it isn't a session anyone means to resume. */
export const RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ExamSnapshot {
  version: number;
  deckId: string;
  deckName: string;
  savedAt: number;
  /** Opaque to this module — the store owns the shape it needs back. */
  state: unknown;
}

export async function saveSnapshot(
  deckId: string,
  deckName: string,
  state: unknown
): Promise<void> {
  const snapshot: ExamSnapshot = {
    version: SNAPSHOT_VERSION,
    deckId,
    deckName,
    savedAt: Date.now(),
    state,
  };
  try {
    await writeSetting(KEY, JSON.stringify(snapshot));
  } catch {
    // A sitting that can't be checkpointed still has to be playable.
  }
}

export async function clearSnapshot(): Promise<void> {
  try {
    await writeSetting(KEY, '');
  } catch {
    // Nothing to do — a stale snapshot is caught by the age check on read.
  }
}

/** Returns the snapshot only when it's current, readable, and recent. */
export async function readSnapshot(now = Date.now()): Promise<ExamSnapshot | null> {
  let raw: string | null;
  try {
    raw = await readSetting(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: ExamSnapshot;
  try {
    parsed = JSON.parse(raw) as ExamSnapshot;
  } catch {
    return null;
  }

  if (parsed?.version !== SNAPSHOT_VERSION) return null;
  if (typeof parsed.savedAt !== 'number') return null;
  if (now - parsed.savedAt > RESUME_MAX_AGE_MS) return null;
  if (!parsed.deckId || parsed.state == null) return null;

  return parsed;
}
