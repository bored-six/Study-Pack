/**
 * Nib — the reader, and the only server Flipp has.
 *
 * It exists for one reason: the API key must never ship inside the app. An
 * app on a phone can be taken apart by anyone who has it, and a key found
 * that way spends the owner's account. So the phone talks to this, and only
 * this talks to Google.
 *
 * What it does, in order:
 *   1. checks the caller has readings left this week
 *   2. asks Gemini to turn the notes into questions, in a fixed shape
 *   3. throws away every question it cannot find in the original notes
 *   4. reports what is left of the allowance
 *
 * Step 3 is the important one. A study app that invents a fact teaches it,
 * and the student then gets rewarded for repeating it back. So a question is
 * only kept if the model can quote the line it came from, word for word, out
 * of the notes the student actually sent.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Google retired gemini-2.5-flash for new keys and names this as the
 * replacement. Reads images and PDFs too, which is what Phase 2 needs.
 */
const MODEL = 'gemini-3.6-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** Mirrors LIMITS.maxQuestions in the app. A review screen has to be finishable. */
const MAX_QUESTIONS = 50;
/** Mirrors LIMITS.maxInputChars. Anything longer is a mistake, not a paste. */
const MAX_INPUT_CHARS = 10_000;
const WEEKLY_PER_DEVICE = 10;
/**
 * Everyone, every day. The free tier bills nothing, so the worst case here is
 * a used-up quota rather than a bill — but a stranger hammering the endpoint
 * would spend the whole app's quota by lunchtime, and this is what stops that.
 */
const DAILY_GLOBAL = 400;

/**
 * The same counting, by where the request came from.
 *
 * The device id is a courtesy, not a lock: it lives in the app's own storage,
 * so a private browsing window or a reinstall invents a fresh one and the
 * weekly allowance starts over. Nothing stored on a machine can stop the
 * person holding that machine.
 *
 * An address is not chosen by the caller, so it survives all of that. It is
 * still not a person — a school or a house shares one — which is why this
 * ceiling is well above what any single student would ever use, and why it is
 * a backstop rather than the allowance itself.
 */
const DAILY_PER_ADDRESS = 30;

// --- counting that survives ---------------------------------------------
//
// Counts used to live in a variable inside this function, which Vercel throws
// away the moment the function goes idle — so the limits reset every few
// minutes and anyone willing to wait walked straight past them.
//
// They live in Redis now, keyed with the period they belong to so nothing has
// to be compared or swept: the key for last week simply stops being asked
// for, and expires on its own.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
/** No store connected yet: fall back to memory rather than to no limit. */
const persistent = Boolean(REDIS_URL && REDIS_TOKEN);
const fallback = new Map<string, number>();

const DAY = 60 * 60 * 24;

async function redis(command: (string | number)[]): Promise<unknown> {
  const response = await fetch(REDIS_URL as string, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${REDIS_TOKEN as string}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`redis ${response.status}`);
  return ((await response.json()) as { result: unknown }).result;
}

/**
 * How many readings this key has spent. A store that is unreachable reports
 * zero rather than throwing: a broken counter must not become a broken app,
 * and the global ceiling is still there underneath.
 */
async function spent(key: string): Promise<number> {
  if (!persistent) return fallback.get(key) ?? 0;
  try {
    const value = await redis(['GET', key]);
    return value == null ? 0 : Number(value) || 0;
  } catch {
    return 0;
  }
}

/** Adds one, and gives the key a life just past the period it counts. */
async function charge(key: string, ttl: number): Promise<void> {
  if (!persistent) {
    fallback.set(key, (fallback.get(key) ?? 0) + 1);
    return;
  }
  try {
    const now = await redis(['INCR', key]);
    if (Number(now) === 1) await redis(['EXPIRE', key, ttl]);
  } catch {
    // A reading already happened; failing to write it down is not worth
    // taking away from the student.
  }
}

/** Vercel puts the caller first in x-forwarded-for; everything after is proxies. */
function callerAddress(req: VercelRequest): string {
  const header = req.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header[0] : header;
  return (raw ?? '').split(',')[0].trim() || 'unknown';
}

/** ISO-ish week key, e.g. 2026-W35. Resets everyone at the same moment. */
function weekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Thursday of this week decides the year, which is what makes the turn of
  // the year land on one week rather than two half ones.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

interface Question {
  prompt: string;
  correctAnswer: string;
  wrongAnswers: string[];
  sourceLine: string;
  kind: 'definition' | 'cloze';
}

/**
 * The shape Gemini must answer in. Given a schema it fills the fields rather
 * than writing prose about them, so there is no output to parse loosely.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          correctAnswer: { type: 'string' },
          wrongAnswers: { type: 'array', items: { type: 'string' } },
          sourceLine: { type: 'string' },
          kind: { type: 'string', enum: ['definition', 'cloze'] },
        },
        required: ['prompt', 'correctAnswer', 'wrongAnswers', 'sourceLine', 'kind'],
      },
    },
  },
  required: ['questions'],
} as const;

const INSTRUCTIONS = `You write quiz questions from a student's own study notes.

Rules, in order of importance:

1. Every question must come from something the notes actually say. Never use
   outside knowledge, never fill a gap, never infer a fact that is not written
   down. If the notes do not say it, there is no question in it.
2. "sourceLine" must be copied WORD FOR WORD from the notes — one complete
   line, exactly as it appears, no tidying, no shortening. It is checked
   against the original and the question is discarded if it does not match.
3. "correctAnswer" must be short: at most five words, ideally one or two. It
   has to fit on a button.
4. "wrongAnswers" must be exactly three, plausible, the same kind of thing as
   the correct answer, and clearly wrong to somebody who studied the notes.
   Take them from other terms in the same notes wherever you can.
5. Ask about things worth knowing — a term, a number, a name, a cause, a
   result. Do not ask about the wording of the sentence itself.
6. One question per fact. Do not ask the same thing twice.
7. If a line has no testable fact in it, skip it. Returning fewer good
   questions is always better than padding with weak ones.`;

/** Fisher-Yates. The correct answer must not sit in a predictable slot. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Collapses whitespace and case, so a quote is compared on its words. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'unavailable', message: 'POST only.' });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // Never echo anything about the key itself, including that it is missing,
    // beyond what the app needs to show a student.
    res.status(500).json({ reason: 'unavailable', message: 'Reader is not configured.' });
    return;
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
  const notes: unknown = body.notes;
  const deviceId: unknown = body.deviceId;

  if (typeof notes !== 'string' || notes.trim().length === 0) {
    res.status(400).json({ reason: 'unavailable', message: 'No notes were sent.' });
    return;
  }
  if (notes.length > MAX_INPUT_CHARS) {
    res.status(400).json({ reason: 'unavailable', message: 'Those notes are too long to read.' });
    return;
  }
  if (typeof deviceId !== 'string' || deviceId.length < 8) {
    res.status(400).json({ reason: 'unavailable', message: 'Missing device id.' });
    return;
  }

  const now = new Date();
  const week = weekKey(now);
  const today = dayKey(now);
  const address = callerAddress(req);

  // Keys carry their own period, so nothing has to be compared or swept —
  // yesterday's key is simply never asked for again, and expires by itself.
  const globalKey = `nib:all:${today}`;
  const addressKey = `nib:ip:${address}:${today}`;
  const deviceKey = `nib:dev:${deviceId}:${week}`;

  const [globalUsed, addressUsed, used] = await Promise.all([
    spent(globalKey),
    spent(addressKey),
    spent(deviceKey),
  ]);

  if (globalUsed >= DAILY_GLOBAL) {
    res.status(429).json({ reason: 'unavailable', message: 'Nib is resting. Try tomorrow.' });
    return;
  }

  // Checked before the device allowance, because this is the one a fresh
  // private window cannot reset. The message stays vague on purpose: a
  // stranger probing the endpoint learns nothing about how it is counted.
  if (addressUsed >= DAILY_PER_ADDRESS) {
    res.status(429).json({ reason: 'unavailable', message: 'Nib is resting. Try later.' });
    return;
  }

  if (used >= WEEKLY_PER_DEVICE) {
    res.status(429).json({
      reason: 'spent',
      message: 'No readings left this week. They come back Monday.',
      credits: { left: 0, of: WEEKLY_PER_DEVICE },
    });
    return;
  }

  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
      contents: [{ role: 'user', parts: [{ text: `Here are the notes:\n\n${notes}` }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        temperature: 0.3,
      },
    }),
  };

  let payload: { questions?: Question[] };
  try {
    let upstream = await fetch(ENDPOINT, request);

    // The free tier goes briefly unavailable under ordinary use — "this model
    // is currently experiencing high demand" is a 503 that clears in seconds.
    // One retry turns most of those into a reading instead of an apology.
    if (upstream.status >= 500) {
      await new Promise((wake) => setTimeout(wake, 1200));
      upstream = await fetch(ENDPOINT, request);
    }

    if (!upstream.ok) {
      res.status(502).json({ reason: 'unavailable', message: "Couldn't reach the reader." });
      return;
    }

    const json = await upstream.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      res.status(502).json({ reason: 'unavailable', message: 'The reader sent nothing back.' });
      return;
    }
    payload = JSON.parse(text);
  } catch {
    res.status(502).json({ reason: 'unavailable', message: "Couldn't reach the reader." });
    return;
  }

  // --- the grounding check ------------------------------------------------
  //
  // Every line of the student's notes, indexed by its words. A question
  // survives only if the line it claims to come from is really in there.
  const lines = new Set(
    notes
      .split('\n')
      .map((line) => normalize(line))
      .filter((line) => line.length > 0)
  );

  const answers = new Set<string>();
  const kept = [];

  for (const q of payload.questions ?? []) {
    if (kept.length >= MAX_QUESTIONS) break;
    if (!q || typeof q.prompt !== 'string' || typeof q.correctAnswer !== 'string') continue;

    const quoted = normalize(String(q.sourceLine ?? ''));
    // The quote has to be a whole line the student wrote. `has` rather than a
    // substring search on purpose: a model that returns three words found
    // somewhere in the notes has not shown its working.
    if (quoted.length === 0 || !lines.has(quoted)) continue;

    const correct = q.correctAnswer.trim();
    if (correct.length === 0 || wordCount(correct) > 5) continue;

    // Same de-duplication rule the parser uses: one question per answer.
    const key = correct.toLowerCase();
    if (answers.has(key)) continue;

    const wrong = (Array.isArray(q.wrongAnswers) ? q.wrongAnswers : [])
      .map((a) => String(a).trim())
      .filter((a) => a.length > 0 && a.toLowerCase() !== key);
    // Four options or nothing — three decoys is what the app's UI expects.
    if (new Set(wrong.map((a) => a.toLowerCase())).size < 3) continue;

    answers.add(key);
    kept.push({
      prompt: q.prompt.trim(),
      correctAnswer: correct,
      answers: shuffle([correct, ...wrong.slice(0, 3)]),
      kind: q.kind === 'cloze' ? 'cloze' : 'definition',
      // The line as the student wrote it, not the normalized form — the app
      // matches this against its own skipped list.
      sourceLine:
        notes.split('\n').find((line) => normalize(line) === quoted)?.trim() ?? null,
    });
  }

  // Charged only now, and only because there is something to show for it. A
  // reading that failed on the way here has cost the student nothing.
  // Eight days and two, so a key outlives the period it counts and cannot
  // expire early on somebody mid-week.
  await Promise.all([
    charge(deviceKey, DAY * 8),
    charge(addressKey, DAY * 2),
    charge(globalKey, DAY * 2),
  ]);

  res.status(200).json({
    questions: kept,
    credits: { left: Math.max(0, WEEKLY_PER_DEVICE - (used + 1)), of: WEEKLY_PER_DEVICE },
  });
}
