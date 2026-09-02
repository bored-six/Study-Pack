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

import { createHmac } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';

import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Chosen by measurement, not by the documentation, which is wrong here.
 *
 * The docs give every Flash model 1,500 requests a day. This key gets twenty
 * — measured, on both gemini-3.6-flash and gemini-3.5-flash, a wall reachable
 * in two minutes. Twenty a day is the whole app, not one student.
 *
 * flash-lite took 179 calls without the daily cap firing at all. It is a
 * smaller model, so the wrong answers it invents are a little less devious
 * and bad handwriting is where it will slip first — but a better model
 * nobody can reach is worth nothing.
 */
const MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** Mirrors LIMITS.maxQuestions in the app. A review screen has to be finishable. */
const MAX_QUESTIONS = 50;
/** Mirrors LIMITS.maxInputChars. Anything longer is a mistake, not a paste. */
const MAX_INPUT_CHARS = 10_000;
/** What Gemini can read and a student is likely to have. */
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
/** 3MB of file, which is about 4MB once base64 has had its way with it. */
const MAX_FILE_B64 = Math.ceil((3 * 1024 * 1024 * 4) / 3);
/**
 * The allowance, and why there are two of them.
 *
 * On Android the week is counted against the phone itself, which cannot be
 * thrown away and remade — so the number can be generous, because the person
 * holding it is the same person next week.
 *
 * In a browser there is nothing of the sort to hold on to. A private window
 * starts life with no memory and ends it with none, so anything we leave
 * there is gone by choice at any moment. All that survives is the address the
 * request came from, and that is shared by a whole school. So the browser
 * gets one reading: enough to see what Nib does, not enough to be worth
 * farming, and the honest answer to someone who wants more is the app.
 */
export const WEEKLY_PAGES_DEVICE = 150;
export const WEEKLY_PAGES_WEB = 20;

/**
 * What a page is, and why the week is measured in them.
 *
 * Gemini does not read a PDF as text. It turns every page into a picture and
 * charges about the same for each one, so a page holding three words costs
 * very nearly what a page holding eight hundred does. That makes pages the
 * honest unit: it is what the reading actually costs, it is knowable before
 * a single byte is spent, and it is a thing a student already understands.
 *
 * A photo is one page. A pasted page of notes is one page. A PDF is however
 * many pages it really has, counted rather than guessed at.
 */
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
const TEXT_CHARS_PER_PAGE = 3_000;

/** A page at minimum, because nothing sent is still something read. */
function pagesForText(body: string): number {
  return Math.max(1, Math.ceil(body.trim().length / TEXT_CHARS_PER_PAGE));
}
const PAGES_FOR_IMAGE = 1;
/**
 * Everyone, every day — in pages, the same unit as everything else here.
 *
 * It used to count requests, on the reasoning that one call is one call
 * however little it turned out to be worth. True of hammering, and wrong
 * about cost: Gemini is paid by the page, so four hundred one-page pastes
 * and four hundred fifty-page chapters are the same number and fifty times
 * apart in what they actually spend. A ceiling that cannot tell those apart
 * is not measuring the thing it exists to protect.
 *
 * Three thousand is roughly four times the busiest day a hundred students
 * would produce, which leaves a real surge alone and still stops a stranger.
 */
const DAILY_PAGES_GLOBAL = 3_000;

/**
 * And a request ceiling underneath it, doing the other job.
 *
 * Google's free tier counts requests, not pages: about a thousand a day on
 * this model. Pages
 * cannot see that limit — three thousand pages is a thousand requests if they
 * arrive as chapters and three thousand if they arrive as pastes. So this one
 * is not a budget at all, it is the wall that keeps us inside Google's, set
 * below it so a student meets our sentence rather than Google's error code.
 */
const DAILY_REQUESTS_GLOBAL = 800;

/**
 * The same counting, by where the request came from.
 *
 * The device id used to be a courtesy rather than a lock — the app invented
 * one and kept it in its own storage, so an uninstall threw it away and the
 * allowance began again. Android hands out an id of its own instead, the same
 * one every time the app is installed on that phone, and that is what the
 * week is counted against now. Reinstalling gains nothing; only a factory
 * reset does, which nobody performs for ten questions.
 *
 * What that id still cannot do is prove there is a phone at the other end. A
 * script can put any string in the field. Play Integrity is what closes that,
 * and until it is in place this ceiling is what stands in its way.
 *
 * An address is not chosen by the caller, so it survives all of that. It is
 * still not a person — a school or a house shares one, which is the whole
 * reason this number is what it is. Thirty requests a day meant about fifteen
 * students at one school got through and the rest were refused for nothing
 * they had done. Four hundred pages is a classroom: eight students taking a
 * fifty-page chapter each, or a great many pastes.
 */
const DAILY_PAGES_PER_ADDRESS = 400;

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

/**
 * The memory counter, reachable by name.
 *
 * Only ever the fallback — with a store connected nothing reads this. It is
 * exported so a test can act as the operator does, writing a block straight
 * into the ledger and then asking the handler what it makes of it.
 */
export const __fallbackForTests = fallback;

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

/**
 * What a finished reading was, kept under the attempt that produced it.
 *
 * The charge happens here and the answer travels back over the network, so
 * there is a moment where a student has paid and has nothing: the reading
 * worked, the reply was lost. Asking again would ordinarily cost a second.
 *
 * So an attempt carries an id, a retry reuses it, and a reading already done
 * under that id is handed back from here — free, and identical. It is the
 * only thing that makes "nothing was used up" true rather than hopeful.
 */
const HOUR = 60 * 60;

async function recall(key: string): Promise<unknown | null> {
  if (!persistent) return fallbackResults.get(key) ?? null;
  try {
    const value = await redis(['GET', key]);
    return typeof value === 'string' ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function remember(key: string, value: unknown): Promise<void> {
  if (!persistent) {
    fallbackResults.set(key, value);
    return;
  }
  try {
    await redis(['SET', key, JSON.stringify(value), 'EX', HOUR]);
  } catch {
    // Worst case the retry costs a reading, which is where we were before.
  }
}

const fallbackResults = new Map<string, unknown>();

/**
 * Adds an amount, and gives the key a life just past the period it counts.
 *
 * An amount rather than always one, because a week is counted in pages now
 * and a reading can be worth several of them. Nothing is written for an
 * amount of zero: a reading that found nothing must leave no mark at all.
 */
async function charge(key: string, ttl: number, amount = 1): Promise<void> {
  if (amount <= 0) return;
  if (!persistent) {
    fallback.set(key, (fallback.get(key) ?? 0) + amount);
    return;
  }
  try {
    const now = await redis(['INCRBY', key, amount]);
    if (Number(now) === amount) await redis(['EXPIRE', key, ttl]);
  } catch {
    // A reading already happened; failing to write it down is not worth
    // taking away from the student.
  }
}

/**
 * Turns whoever is asking into a name for a counter, and nothing else.
 *
 * An Android id belongs to a phone, and a phone belongs to a student, so it
 * is the kind of thing that should never be written down as it arrived. This
 * runs it through a keyed hash first: the counters still tell one student
 * from another, but what is stored cannot be turned back into the id, and a
 * copy of the database is not a list of anybody's devices.
 *
 * The salt is a server secret. Changing it forgets every count at once, which
 * is worth knowing before rotating it mid-week.
 */
const ID_SALT = process.env.NIB_ID_SALT ?? 'nib-unsalted';

function fingerprint(value: string): string {
  return createHmac('sha256', ID_SALT).update(value).digest('hex').slice(0, 32);
}

/**
 * One person, turned off, without touching anybody else.
 *
 * `SET nib:blocked:<fingerprint> 1` in Redis and that phone stops being
 * served. There is no TTL on purpose — a block ends when it is deleted.
 *
 * A store that cannot be reached reports nothing rather than refusing, for
 * the same reason the counters do: a broken database must not become a
 * broken app for everyone who is not blocked.
 */
async function blocked(holder: string): Promise<boolean> {
  return (await spent(`nib:blocked:${holder}`)) > 0;
}

/**
 * How many pages are really in this PDF.
 *
 * Counted properly rather than by looking for `/Type /Page` in the bytes:
 * anything saved by a modern writer keeps its page tree inside a compressed
 * object stream, where a search of the raw file finds nothing at all and
 * would quietly price a whole chapter as a single page.
 *
 * A file that cannot be opened is charged as one page, not refused. A student
 * with an odd PDF should get their reading; the worst this can cost is that
 * an unreadable file is priced generously, and the reading itself will fail
 * on its own if the file really is broken.
 */
async function pdfPages(base64: string): Promise<number> {
  try {
    const doc = await PDFDocument.load(Buffer.from(base64, 'base64'), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return Math.max(1, doc.getPageCount());
  } catch {
    return 1;
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
  kind: 'definition' | 'cloze' | 'enumeration';
  items?: string[];
  ordered?: boolean;
}

const QUESTION_SHAPE = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
    correctAnswer: { type: 'string' },
    wrongAnswers: { type: 'array', items: { type: 'string' } },
    sourceLine: { type: 'string' },
    kind: { type: 'string', enum: ['definition', 'cloze', 'enumeration'] },
    /** Enumeration only: every item in the list. */
    items: { type: 'array', items: { type: 'string' } },
    /** Enumeration only: true when the order is part of the answer. */
    ordered: { type: 'boolean' },
  },
  required: ['prompt', 'correctAnswer', 'wrongAnswers', 'sourceLine', 'kind'],
} as const;

/**
 * The shape Gemini must answer in. Given a schema it fills the fields rather
 * than writing prose about them, so there is no output to parse loosely.
 */
const SCHEMA_TEXT = {
  type: 'object',
  properties: { questions: { type: 'array', items: QUESTION_SHAPE } },
  required: ['questions'],
} as const;

/**
 * A file needs one extra field. Grounding works by checking every quote
 * against the notes — and for a PDF the server never sees the notes, only
 * the bytes. So the model returns what it read as well as what it asked, and
 * the quotes are checked against that. It cannot both invent a fact and hide
 * it, because the invented line would have to appear in the text it hands
 * back, where a student can see it.
 */
const SCHEMA_FILE = {
  type: 'object',
  properties: {
    sourceText: { type: 'string' },
    questions: { type: 'array', items: QUESTION_SHAPE },
  },
  required: ['sourceText', 'questions'],
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
   questions is always better than padding with weak ones.

THE THREE KINDS, AND WHY THEY MATTER

A question is sat in one of seven exam formats, and which ones it can be
depends entirely on the "kind" you give it. Write a mixture — a paper made
of nothing but one kind is a duller paper.

"definition" — a question you have written, with a short answer.
  "prompt" is a real question ending in "?".
  Becomes: multiple choice, identification, true/false, matching.
  Use for: a term and its meaning, a cause, a name, a number.

"cloze" — the sentence from the notes with one word taken out.
  "prompt" MUST be the sentence with the missing word replaced by exactly
  six underscores: ______
  "correctAnswer" is the word that was taken out. Prefer ONE word — a
  one-word answer unlocks a format a two-word answer cannot.
  Becomes: multiple choice, fill in the blank, true/false, and — only with a
  one-word answer — modified true/false.
  Example prompt: "Osmosis is the movement of ______ across a membrane."

"enumeration" — a list the notes give as a list.
  "prompt" asks for the list ("Name the three states of matter.").
  "items" holds every item, between three and six of them.
  "ordered" is true only when the order is part of the answer (a sequence,
  a ranking); false for a set.
  "correctAnswer" is the first item, "wrongAnswers" can be empty.
  Becomes: enumeration.
  Only use this where the notes actually list things. Never invent a list.

Aim for roughly half definitions, a third cloze, and enumerations wherever
the notes genuinely list something.`;

/** Added when the notes arrive as a file rather than as typed text. */
const FILE_INSTRUCTIONS = `
This time the notes are a file — a PDF, a photo of a page, or a scan.

First read it and put what it says into "sourceText": one fact per line, in
the words the document uses, headings and page furniture left out. That field
is what every "sourceLine" is checked against, so a question whose line is not
in it will be thrown away.

Then write the questions from "sourceText" and nothing else. Everything above
still applies — especially that you must not use anything you know that the
document does not say.

Cover the whole document, but choose: the best forty questions from a chapter
beat two hundred a student will never finish reviewing.`;

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
  const file: unknown = body.file;
  const mime: unknown = body.mime;
  const deviceId: unknown = body.deviceId;
  // Anything that is not the app is treated as the browser, which is the
  // smaller allowance — so a caller lying about this only cheats itself.
  const onAndroid = body.platform === 'android';

  // The browser has no id worth asking for; Android always has one.
  if (onAndroid && (typeof deviceId !== 'string' || deviceId.length < 8)) {
    res.status(400).json({ reason: 'unavailable', message: 'Missing device id.' });
    return;
  }

  const isFile = typeof file === 'string' && file.length > 0;

  if (isFile) {
    if (typeof mime !== 'string' || !ACCEPTED_TYPES.includes(mime)) {
      res.status(400).json({ reason: 'unavailable', message: 'Nib reads PDFs and photos.' });
      return;
    }
    // Vercel caps a request body around 4.5MB and base64 adds about a third,
    // so the file itself has to stay under three — checked on the phone too,
    // where it can be said before the upload rather than after.
    if (file.length > MAX_FILE_B64) {
      res.status(413).json({ reason: 'unavailable', message: 'That file is too big — 3 MB is the most Nib can take.' });
      return;
    }
  } else {
    if (typeof notes !== 'string' || notes.trim().length === 0) {
      res.status(400).json({ reason: 'unavailable', message: 'No notes were sent.' });
      return;
    }
    if (notes.length > MAX_INPUT_CHARS) {
      res.status(400).json({ reason: 'unavailable', message: 'Those notes are too long to read.' });
      return;
    }
  }

  const now = new Date();
  const week = weekKey(now);
  const today = dayKey(now);
  const address = callerAddress(req);

  // Keys carry their own period, so nothing has to be compared or swept —
  // yesterday's key is simply never asked for again, and expires by itself.
  const globalKey = `nib:all:${today}`;
  /** The same day, counted the other way — see DAILY_REQUESTS_GLOBAL. */
  const globalCallsKey = `nib:calls:${today}`;
  const addressKey = `nib:ip:${address}:${today}`;

  /**
   * The same attempt asked twice.
   *
   * Handed back before any limit is looked at, let alone charged: a student
   * whose connection died holding the answer is not over their allowance,
   * they are owed the thing they already paid for. Scoped to the address so
   * one caller cannot replay another's id.
   */
  const attempt = typeof body.attempt === 'string' ? body.attempt.slice(0, 64) : null;
  const attemptKey =
    attempt && attempt.length >= 8 ? `nib:try:${fingerprint(`${address}:${attempt}`)}` : null;

  if (attemptKey) {
    const already = await recall(attemptKey);
    if (already != null) {
      res.status(200).json(already);
      return;
    }
  }

  // Who the week belongs to. On Android that is the phone, which an uninstall
  // does not change; in a browser there is only the address, which is why the
  // browser's budget is three pages and not sixty.
  const holder = onAndroid
    ? fingerprint(`dev:${deviceId as string}`)
    : fingerprint(`ip:${address}`);
  const allowance = onAndroid ? WEEKLY_PAGES_DEVICE : WEEKLY_PAGES_WEB;
  const weekly = `nib:${onAndroid ? 'dev' : 'web'}:${holder}:${week}`;

  // Asked first, and before any counting: someone who has been turned off
  // should not be told how many readings they have left.
  if (await blocked(holder)) {
    res.status(403).json({ reason: 'unavailable', message: 'Nib is not available on this device.' });
    return;
  }

  const [globalPages, globalCalls, addressPages, used] = await Promise.all([
    spent(globalKey),
    spent(globalCallsKey),
    spent(addressKey),
    spent(weekly),
  ]);

  // Two ceilings over everyone, measuring two different things: what the day
  // has cost, and how many times Google has been asked. Either can be the one
  // that runs out first, depending entirely on whether the day arrived as
  // chapters or as pastes.
  if (globalPages >= DAILY_PAGES_GLOBAL || globalCalls >= DAILY_REQUESTS_GLOBAL) {
    res.status(429).json({ reason: 'unavailable', message: 'Nib is resting. Try tomorrow.' });
    return;
  }

  // Checked before the device allowance, because this is the one a fresh
  // private window cannot reset. The message stays vague on purpose: a
  // stranger probing the endpoint learns nothing about how it is counted.
  if (addressPages >= DAILY_PAGES_PER_ADDRESS) {
    res.status(429).json({ reason: 'unavailable', message: 'Nib is resting. Try later.' });
    return;
  }

  if (used >= allowance) {
    res.status(429).json({
      reason: 'spent',
      message: 'No pages left this week. They come back Monday.',
      credits: { left: 0, of: allowance },
    });
    return;
  }

  /**
   * What was sent, in pages.
   *
   * A ceiling, not a bill. What the student is finally charged is worked out
   * after the reading, from what came back — see the note over `cost`.
   */
  const pages = isFile
    ? mime === 'application/pdf'
      ? await pdfPages(file as string)
      : PAGES_FOR_IMAGE
    : pagesForText(notes as string);

  const request = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: isFile ? INSTRUCTIONS + FILE_INSTRUCTIONS : INSTRUCTIONS }],
      },
      contents: [
        {
          role: 'user',
          parts: isFile
            ? [
                { inlineData: { mimeType: mime as string, data: file as string } },
                { text: 'Read this and make questions from it.' },
              ]
            : [{ text: `Here are the notes:\n\n${notes as string}` }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: isFile ? SCHEMA_FILE : SCHEMA_TEXT,
        temperature: 0.3,
      },
    }),
  };

  let payload: { questions?: Question[]; sourceText?: string };
  try {
    /**
     * One retry, and only for a server fault.
     *
     * Four tries with widening gaps looked right against "high demand" 503s
     * and was measured making things worse: the quota this runs on is small,
     * so every retry spends a share of the day's readings on a call that has
     * already failed, and the waiting pushed one production reading past two
     * minutes before it gave up anyway.
     *
     * 429 is deliberately NOT retried. It means the allowance is gone, and
     * asking again cannot conjure more of it — it only spends the student's
     * wait on a refusal that was already final.
     */
    let upstream = await fetch(ENDPOINT, request);
    if (upstream.status >= 500) {
      await new Promise((wake) => setTimeout(wake, 1_500));
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
  //
  // For a file that corpus is what the model says it read, because the server
  // never sees inside a PDF. Weaker than checking against the student's own
  // typing, but it still forces an invention to be written down where the
  // student can see it, rather than appearing only as an answer.
  const corpus = isFile ? (payload.sourceText ?? '') : (notes as string);
  const lines = new Set(
    corpus
      .split('\n')
      .map((line) => normalize(line))
      .filter((line) => line.length > 0)
  );

  const answers = new Set<string>();
  const kept: Record<string, unknown>[] = [];

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

    const prompt = q.prompt.trim();

    // An enumeration carries its whole list in `answers` instead of decoys.
    // Three to six is what the app's grid is built for.
    if (q.kind === 'enumeration') {
      const items = (Array.isArray(q.items) ? q.items : [])
        .map((a) => String(a).trim())
        .filter((a) => a.length > 0);
      if (items.length < 3 || items.length > 6) continue;
      answers.add(key);
      kept.push({
        prompt,
        correctAnswer: items[0],
        answers: items,
        kind: 'enumeration',
        ordered: q.ordered === true,
        sourceLine:
          corpus.split('\n').find((line) => normalize(line) === quoted)?.trim() ?? null,
      });
      continue;
    }

    // A cloze without a blank in it is just a sentence, and loses the two
    // formats it exists for. Six underscores is what the app looks for.
    if (q.kind === 'cloze' && !/_{6,}/.test(prompt)) continue;

    const wrong = (Array.isArray(q.wrongAnswers) ? q.wrongAnswers : [])
      .map((a) => String(a).trim())
      .filter((a) => a.length > 0 && a.toLowerCase() !== key);
    // Four options or nothing — three decoys is what the app's UI expects.
    if (new Set(wrong.map((a) => a.toLowerCase())).size < 3) continue;

    answers.add(key);
    kept.push({
      prompt,
      correctAnswer: correct,
      answers: shuffle([correct, ...wrong.slice(0, 3)]),
      kind: q.kind === 'cloze' ? 'cloze' : 'definition',
      // The line as the student wrote it, not the normalized form — the app
      // matches this against its own skipped list.
      sourceLine:
        corpus.split('\n').find((line) => normalize(line) === quoted)?.trim() ?? null,
    });
  }

  /**
   * What the reading is finally worth.
   *
   * Never more pages than questions it gave back. A thirty-page PDF of
   * diagrams that yields five questions costs five pages, not thirty — the
   * student is charged for what they got rather than for what they sent, and
   * a reading that returns nothing at all is free.
   *
   * This is what the comment here used to promise and the code did not do: a
   * reading that survived the grounding check with nothing left still took a
   * full credit off somebody who had been given no questions for it.
   *
   * Clamped to what is left so a big file cannot push a week below zero.
   */
  const cost =
    kept.length === 0 ? 0 : Math.min(pages, kept.length, Math.max(0, allowance - used));

  // Eight days and two, so a key outlives the period it counts and cannot
  // expire early on somebody mid-week.
  const answer = {
    questions: kept,
    credits: { left: Math.max(0, allowance - (used + cost)), of: allowance },
  };

  // Remembered before it is charged, never after. Getting this order wrong
  // the other way round means a write that fails leaves a charge with no
  // record of what it bought, and the retry pays for the same reading twice.
  if (attemptKey) await remember(attemptKey, answer);

  await Promise.all([
    charge(weekly, DAY * 8, cost),
    // The page ceilings are charged what the reading was worth, exactly as
    // the student's own week is — a reading that gave nothing back costs
    // everybody nothing.
    charge(addressKey, DAY * 2, cost),
    charge(globalKey, DAY * 2, cost),
    // The request ceiling is charged the call itself, worth or no worth:
    // Google counted it either way, and that is the whole thing it tracks.
    charge(globalCallsKey, DAY * 2),
  ]);

  res.status(200).json(answer);
}
