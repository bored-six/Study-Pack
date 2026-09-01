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

import * as Application from 'expo-application';
import { PDFDocument } from 'pdf-lib';
import { Platform } from 'react-native';

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
  | { kind: 'file'; base64: string; mime: string; name: string };

/**
 * One try at one thing, named.
 *
 * The server charges when the reading is made and the answer then travels
 * back, so a connection that dies in between leaves a student paid up with
 * nothing to show. Asking again under the same name gets that reading handed
 * back for free instead of buying it twice — which is the only reason the
 * app is allowed to say nothing was used up.
 *
 * A new one is minted for new notes; a retry keeps the old one.
 */
export function newAttempt(): string {
  return `a${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** What Nib can open. Anything else is refused before the upload starts. */
export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

/**
 * Three megabytes.
 *
 * Not a guess about what is reasonable: a Vercel function will not accept a
 * body much past four and a half, and base64 makes a file about a third
 * bigger on the way. Checked here so a student is told before a slow upload
 * rather than after one.
 */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

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
  /** The week's pages are used up. Ends with when they come back. */
  | 'spent'
  /** Anything else: a bad response, a server having a day, a timeout. */
  | 'unavailable';

/** Plain sentences. Each says what happened and what to do about it. */
export const AI_FAILURE_MESSAGE: Record<AiFailure, string> = {
  offline: "Needs internet. Try again when you're back — nothing was used up.",
  spent: 'No pages left this week. They come back Monday.',
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
/** Uploading a few megabytes and reading a chapter is a different wait. */
const FILE_TIMEOUT_MS = 90_000;

/**
 * This phone, to the server — a counter's name, not an identity.
 *
 * It exists for one reason: so that one student's readings are their own, and
 * so that running out is something a person can do to themselves rather than
 * to everybody else.
 *
 * On Android it is the id the platform already keeps for this app — the same
 * one after an uninstall and a reinstall, different on every other phone, and
 * gone only if the device is factory reset. That last part is the whole
 * point. The id Flipp used to invent for itself lived in the app's own
 * storage, so deleting the app deleted the count, and the week began again
 * for anyone who could be bothered to tap twice.
 *
 * It never leaves as it is. The server keeps only a keyed hash of it, so what
 * is stored identifies a counter and cannot be turned back into a device.
 *
 * In a browser there is no such id, and nothing kept in a private window
 * outlives the window. So the browser sends none, the server counts it by
 * address instead, and the allowance there is one reading rather than ten —
 * which is the honest shape of the difference, not a punishment.
 */
const DEVICE_KEY = 'nib_device_id';

/** Which of the two allowances this build is asking against. */
export const onAndroid = Platform.OS === 'android';

/**
 * A week, in pages. The copy reads this so it cannot drift.
 *
 * Pages rather than readings because that is what a reading actually costs:
 * Gemini turns every PDF page into a picture and charges about the same for
 * each, so a sparse page is no cheaper than a dense one. Counting pages lets
 * a student spend their week how they like — sixty short pastes, or one long
 * chapter — instead of being handed ten of somebody else's idea of a reading.
 */
export const WEEKLY_PAGES = onAndroid ? 150 : 20;

/** A photo is one page. So is a page of pasted notes. */
export const PAGES_FOR_IMAGE = 1;
/**
 * How much pasted text makes a page.
 *
 * Measured rather than guessed. Gemini charges a PDF page about 525 tokens
 * however little is on it, and pasted text by what it says: a thousand
 * characters is 180 tokens, ten thousand is 1,772. So a full box of pasted
 * notes costs about three and a half pages and used to be charged one.
 *
 * Three thousand characters lands within a rounding of the measurement at
 * every size, and it is a number a student can feel: about a page of writing
 * is about a page of reading.
 */
export const TEXT_CHARS_PER_PAGE = 3_000;

/** A page at minimum, because nothing sent is still something read. */
export function pagesForText(body: string): number {
  return Math.max(1, Math.ceil(body.trim().length / TEXT_CHARS_PER_PAGE));
}

/**
 * How many pages a PDF really has, read on the phone before anything is sent.
 *
 * Only so the student can be told what a file will cost while they can still
 * change their mind. The server counts it again and that count is the one
 * that is charged, so a wrong answer here is a wrong sentence, never a wrong
 * bill.
 *
 * Null when the file cannot be opened — the caller says nothing rather than
 * guessing, because a made-up number in a sentence about cost is worse than
 * no sentence at all.
 */
export async function pdfPageCount(base64: string): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(base64ToBytes(base64), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return Math.max(1, doc.getPageCount());
  } catch {
    return null;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64 to bytes, by hand.
 *
 * Neither shortcut is safe here. Handing pdf-lib the string and letting it
 * decode only works for a data URI, and a bare payload comes back as nothing
 * — which is how a real chapter was being reported as an unreadable file.
 * `atob` is the other obvious answer and is not something to count on across
 * every Hermes build the app will run on.
 *
 * Sixteen lines that work the same everywhere is the cheaper bargain.
 */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let at = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, at);
}

/** What a picked file will cost, at most. Null when it cannot be worked out. */
export async function pagesFor(source: AiSource): Promise<number | null> {
  if (source.kind === 'text') return pagesForText(source.body);
  if (source.mime !== 'application/pdf') return PAGES_FOR_IMAGE;
  return pdfPageCount(source.base64);
}

/** Pages as a share of the week, for the bar and for "up to 20%". */
export function percentOfWeek(pages: number, of: number = WEEKLY_PAGES): number {
  if (of <= 0 || pages <= 0) return 0;
  // The floor of one is for the other end: a single page of sixty rounds to
  // 1.6%, and showing that as 0% would promise a reading that costs nothing
  // and then charge for it. Nothing is nothing; anything is at least one.
  return Math.min(100, Math.max(1, Math.round((pages / of) * 100)));
}

/**
 * The invented id, kept only as a fallback.
 *
 * `getAndroidId` has been known to come back empty on an emulator or a
 * half-provisioned device. A student on one of those should still get their
 * their own week, so there is something to fall back to — weaker, because it
 * dies with the app, but never worse than having no reading at all.
 */
async function inventedId(): Promise<string> {
  const saved = await readSetting(DEVICE_KEY);
  if (saved != null && saved.length >= 8) return saved;
  const made = `d${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await writeSetting(DEVICE_KEY, made);
  return made;
}

async function deviceId(): Promise<string | null> {
  if (!onAndroid) return null;
  try {
    const android = Application.getAndroidId();
    if (android != null && android.length >= 8) return android;
  } catch {
    // Unavailable on this device. The fallback below still gives the student
    // a week of their own; it just does not survive a reinstall.
  }
  return inventedId();
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
export async function readWithAI(source: AiSource, attempt?: string): Promise<AiReading> {
  const id = await deviceId();
  const platform = onAndroid ? 'android' : 'web';
  const payload =
    source.kind === 'text'
      ? { notes: source.body, deviceId: id, platform, attempt }
      : { file: source.base64, mime: source.mime, deviceId: id, platform, attempt };

  const stop = new AbortController();
  // A file takes longer than a paste: it has to be uploaded and then read.
  const timer = setTimeout(() => stop.abort(), source.kind === 'file' ? FILE_TIMEOUT_MS : TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(NIB_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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
