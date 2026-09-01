/**
 * The one place Flipp talks to the network — and the only one there will ever be.
 *
 * The parser is what makes a subject. This is a rescue for the lines it could
 * not use: prose, headings, sentences with no pattern to catch. It is asked
 * for by hand, once, from the panel that already lists what was dropped.
 *
 * Nothing here runs on its own. No background sync, no telemetry, no call the
 * student did not press a button for — the settings card says so, and that
 * promise is the reason this file has exactly one export that reaches out.
 *
 * It talks to one address: Flipp's own proxy, at api/nib.ts. Never straight
 * to a model vendor — that would mean the key riding along inside the app,
 * where anyone holding the app can take it out and spend it.
 */

import { readSetting, writeSetting } from './db';
import type { ParsedQuestion } from './noteParser';

/** What a student has left in the current window, as the server counts it. */
export interface Credits {
  left: number;
  of: number;
}

/**
 * What we send. Text is the pasted notes as the student typed them; a PDF is
 * the file bytes, and the reading gives us back the text it found inside.
 */
export type AiSource =
  | { kind: 'text'; body: string }
  | { kind: 'pdf'; base64: string; name: string };

export interface AiReading {
  /**
   * Questions in exactly the parser's shape, so everything downstream — the
   * review screen, the save, the exam formats — cannot tell the difference.
   */
  questions: ParsedQuestion[];
  /** Counted by the server, never by us. See the note on spending, below. */
  credits: Credits;
}

/**
 * Why a reading did not happen. The student sees a different sentence for
 * each, because "something went wrong" tells them nothing they can act on.
 */
export type AiFailure =
  /** No usable connection — the common one, and not the student's fault. */
  | 'offline'
  /** The window's readings are used up. Ends with when they come back. */
  | 'spent'
  /** Anything else: a bad response, a server having a day, a timeout. */
  | 'unavailable';

/** Plain sentences. Each says what happened and what to do about it. */
export const AI_FAILURE_MESSAGE: Record<AiFailure, string> = {
  offline: "Needs internet. Try again when you're back — nothing was used up.",
  spent: 'No readings left this week. They come back Monday.',
  unavailable: "Couldn't reach the reader. Nothing was used up — try again in a minute.",
};

/**
 * An Error carrying the reason.
 *
 * Deliberately not a subclass: `class X extends Error` loses `instanceof` once
 * babel is done with it, so the reason rides along as a property that survives
 * the transpile and can be read without any prototype games.
 */
export function aiFailure(reason: AiFailure): Error & { reason: AiFailure } {
  return Object.assign(new Error(AI_FAILURE_MESSAGE[reason]), { reason });
}

/** Reads the reason off anything thrown, falling back to the vaguest one. */
export function failureReason(error: unknown): AiFailure {
  if (error != null && typeof error === 'object' && 'reason' in error) {
    const reason = (error as { reason: unknown }).reason;
    if (reason === 'offline' || reason === 'spent' || reason === 'unavailable') {
      return reason;
    }
  }
  return 'unavailable';
}

/**
 * Where Nib lives. Overridable for a local proxy while developing; the
 * default is the deployed one, because a phone has no localhost to talk to.
 */
const NIB_URL =
  process.env.EXPO_PUBLIC_NIB_URL ?? 'https://flipp-theta-gilt.vercel.app/api/nib';

/** Long enough for a full page, short enough to give up rather than hang. */
const TIMEOUT_MS = 25_000;

/**
 * This phone, to the server — a random id, not an identity.
 *
 * It exists only so one student's ten readings a week are their own. It is
 * generated here, never derived from anything about the device or the person,
 * and it is on the privacy card because it is the one thing besides the notes
 * that leaves the phone.
 */
const DEVICE_KEY = 'nib_device_id';

async function deviceId(): Promise<string> {
  const saved = await readSetting(DEVICE_KEY);
  if (saved != null && saved.length >= 8) return saved;
  const made = `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await writeSetting(DEVICE_KEY, made);
  return made;
}

/**
 * Ask the reader to make questions out of notes the parser could not use.
 *
 * Two rules the caller depends on:
 *
 *   1. It throws on every failure. There is no half-result — a caller that
 *      catches keeps whatever the parser already gave it and loses nothing.
 *   2. `credits` is whatever the server reported after the work was done. The
 *      app never counts a reading itself, so a request that dies on the way
 *      home cannot cost a student anything.
 */
export async function readWithAI(source: AiSource): Promise<AiReading> {
  if (source.kind !== 'text') throw aiFailure('unavailable');

  const id = await deviceId();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(NIB_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: source.body, deviceId: id }),
      signal: stop.signal,
    });
  } catch {
    // No connection, DNS, a captive portal, a timeout — all the same to a
    // student, and all of them mean nothing was spent.
    throw aiFailure('offline');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const reason = response.status === 429 ? 'spent' : 'unavailable';
    throw aiFailure(reason);
  }

  const body = (await response.json()) as Partial<AiReading>;
  if (!Array.isArray(body.questions) || body.credits == null) {
    throw aiFailure('unavailable');
  }
  return { questions: body.questions, credits: body.credits };
}
