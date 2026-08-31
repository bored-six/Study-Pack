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
 * PHASE 0: `readWithAI` is not wired to anything. It always fails, which means
 * every caller lands in its failure path from the day it ships. That is the
 * point — the fallback is proven in the student's hands long before there is
 * anything to fall back from.
 */

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
 * Ask the reader to make questions out of notes the parser could not use.
 *
 * Two rules the caller depends on, and which the wired version must keep:
 *
 *   1. It throws on every failure. There is no half-result — a caller that
 *      catches keeps whatever the parser already gave it and loses nothing.
 *   2. `credits` is whatever the server reported after the work was done. The
 *      app never counts a reading itself, so a request that dies on the way
 *      home cannot cost a student anything.
 */
export async function readWithAI(_source: AiSource): Promise<AiReading> {
  throw aiFailure('offline');
}
