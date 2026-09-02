/**
 * The reader, charged end to end.
 *
 * Not a copy of the rule — the real handler, with Gemini answered by a stub
 * and no Redis connected, so the counters fall back to memory and can be read
 * between calls. What is being proved is only ever about money: that a
 * reading which gave nothing back takes nothing, that a fat file which gave
 * little back is charged little, and that the two budgets are the two
 * budgets.
 */

import { PDFDocument } from 'pdf-lib';

import {
  WEEKLY_PAGES_DEVICE as CLIENT_DEVICE,
  WEEKLY_PAGES_WEB as CLIENT_WEB,
} from '../../src/lib/aiNotes';

import handler, { WEEKLY_PAGES_DEVICE, WEEKLY_PAGES_WEB, __fallbackForTests } from '../nib';

type Body = Record<string, unknown>;

/** A page of notes the questions can honestly be traced back to. */
const NOTES = [
  'Mitochondria are the powerhouse of the cell.',
  'Photosynthesis happens in the chloroplast.',
  'Osmosis is the movement of water across a membrane.',
  'The nucleus holds the cell DNA.',
  'Ribosomes build proteins.',
  'Enzymes lower activation energy.',
].join('\n');

/** Questions in the shape the grounding check will accept, quoting real lines. */
function questionsFrom(lines: string[]) {
  return lines.map((line, i) => ({
    prompt: `What does line ${i + 1} say?`,
    correctAnswer: `answer${i}`,
    wrongAnswers: [`w${i}a`, `w${i}b`, `w${i}c`],
    sourceLine: line,
    kind: 'definition',
  }));
}

let gemini: { questions: unknown[]; sourceText?: string } = { questions: [] };

beforeAll(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.NIB_ID_SALT = 'test-salt';
  // No Redis on purpose: the handler falls back to an in-memory counter,
  // which is exactly the observable ledger this test needs.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;

  global.fetch = jest.fn(async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(gemini) }] } }],
      }),
    }) as unknown as Response
  ) as unknown as typeof fetch;
});

/** One call, returning whatever the handler wrote. */
async function ask(body: Body, ip = '10.0.0.1') {
  const req = { method: 'POST', body, headers: { 'x-forwarded-for': ip } };
  let status = 0;
  let payload: Record<string, unknown> = {};
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(value: Record<string, unknown>) {
      payload = value;
      return this;
    },
  };
  await handler(req as never, res as never);
  return { status, ...payload } as {
    status: number;
    questions?: unknown[];
    credits?: { left: number; of: number };
    reason?: string;
  };
}

async function pdfOf(pages: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save({ useObjectStreams: true })).toString('base64');
}

/** A fresh phone each time, so one test's spending is not another's. */
let phone = 0;
const nextPhone = () => `androidid${(phone++).toString().padStart(6, '0')}`;

describe('what the week costs', () => {
  it('gives the phone a bigger week than the browser', async () => {
    gemini = { questions: questionsFrom([NOTES.split('\n')[0]]) };

    const app = await ask({ notes: NOTES, deviceId: nextPhone(), platform: 'android' });
    expect(app.credits?.of).toBe(WEEKLY_PAGES_DEVICE);

    const web = await ask({ notes: NOTES, platform: 'web' }, '10.0.0.99');
    expect(web.credits?.of).toBe(WEEKLY_PAGES_WEB);
    // The browser's is deliberately the smaller of the two.
    expect(WEEKLY_PAGES_WEB).toBeLessThan(WEEKLY_PAGES_DEVICE);
  });

  it('charges nothing for a reading that gave nothing back', async () => {
    // Grounded in nothing: every question quotes a line that is not there.
    gemini = { questions: questionsFrom(['a line the student never wrote']) };
    const id = nextPhone();

    const first = await ask({ notes: NOTES, deviceId: id, platform: 'android' });
    expect(first.questions).toHaveLength(0);
    expect(first.credits?.left).toBe(WEEKLY_PAGES_DEVICE);

    // And again — a student cannot be drained by readings that give nothing.
    const second = await ask({ notes: NOTES, deviceId: id, platform: 'android' });
    expect(second.credits?.left).toBe(WEEKLY_PAGES_DEVICE);
  });

  it('charges a paste one page when it worked', async () => {
    gemini = { questions: questionsFrom(NOTES.split('\n').slice(0, 4)) };
    const out = await ask({ notes: NOTES, deviceId: nextPhone(), platform: 'android' });
    expect(out.questions).toHaveLength(4);
    expect(out.credits?.left).toBe(WEEKLY_PAGES_DEVICE - 1);
  });

  it('charges a thirty-page PDF five pages when it gave five questions', async () => {
    // The picture-heavy chapter. Thirty pages in, five questions out.
    gemini = {
      questions: questionsFrom(NOTES.split('\n').slice(0, 5)),
      sourceText: NOTES,
    };
    const out = await ask({
      file: await pdfOf(30),
      mime: 'application/pdf',
      deviceId: nextPhone(),
      platform: 'android',
    });
    expect(out.questions).toHaveLength(5);
    expect(out.credits?.left).toBe(WEEKLY_PAGES_DEVICE - 5);
  });

  it('charges a small PDF in full when it earned it', async () => {
    // Two pages, six questions — the file is the smaller number, so it pays.
    gemini = { questions: questionsFrom(NOTES.split('\n')), sourceText: NOTES };
    const out = await ask({
      file: await pdfOf(2),
      mime: 'application/pdf',
      deviceId: nextPhone(),
      platform: 'android',
    });
    expect(out.questions).toHaveLength(6);
    expect(out.credits?.left).toBe(WEEKLY_PAGES_DEVICE - 2);
  });

  it('runs a browser out at the end of its week, and says so', async () => {
    // One question per reading, so a paste costs exactly one page and the
    // count walks down by one — however wide the browser's week is set.
    gemini = { questions: questionsFrom(NOTES.split('\n').slice(0, 1)) };
    const ip = '10.0.0.55';

    for (let spent = 1; spent <= WEEKLY_PAGES_WEB; spent++) {
      const out = await ask({ notes: NOTES, platform: 'web' }, ip);
      expect(out.credits?.left).toBe(WEEKLY_PAGES_WEB - spent);
    }

    const done = await ask({ notes: NOTES, platform: 'web' }, ip);
    expect(done.status).toBe(429);
    expect(done.reason).toBe('spent');
  });

  it('keeps one phone spending out of another phone`s week', async () => {
    gemini = { questions: questionsFrom(NOTES.split('\n').slice(0, 2)) };
    const mine = nextPhone();
    await ask({ notes: NOTES, deviceId: mine, platform: 'android' });
    const yours = await ask({ notes: NOTES, deviceId: nextPhone(), platform: 'android' });
    expect(yours.credits?.left).toBe(WEEKLY_PAGES_DEVICE - 1);
  });
});

describe('the two budgets agree', () => {
  it('offers the app what the app says it offers', () => {
    // The screen shows this number before the server has said anything, so a
    // client that disagrees with the server tells a student a figure their
    // first reading then contradicts.
    expect(CLIENT_DEVICE).toBe(WEEKLY_PAGES_DEVICE);
    expect(CLIENT_WEB).toBe(WEEKLY_PAGES_WEB);
  });

  it('keeps the browser well under the app', () => {
    expect(WEEKLY_PAGES_WEB).toBeLessThan(WEEKLY_PAGES_DEVICE);
    expect(WEEKLY_PAGES_WEB).toBeGreaterThan(0);
  });
});

describe('the blocklist', () => {
  it('refuses a blocked phone without telling it anything', async () => {
    gemini = { questions: questionsFrom(NOTES.split('\n').slice(0, 2)) };
    const id = nextPhone();

    // Spend once so the phone exists in the ledger, then block its
    // fingerprint the way an operator would from the Redis console. The
    // ledger is diffed rather than searched: earlier tests have left their
    // own phones in it, and the first one found is somebody else's.
    const was = new Set(__fallbackForTests.keys());
    const before = await ask({ notes: NOTES, deviceId: id, platform: 'android' });
    expect(before.status).toBe(200);

    // Taken out of the ledger rather than worked out here. The salt is read
    // when the module loads, so a test cannot set it — and reading the name
    // back off the counter proves the handler really keys on a fingerprint
    // rather than on anything a caller sent.
    const counter = [...__fallbackForTests.keys()].find(
      (k) => k.startsWith('nib:dev:') && !was.has(k)
    );
    expect(counter).toBeDefined();
    const holder = (counter as string).split(':')[2];
    expect(holder).toHaveLength(32);
    expect(holder).not.toContain(id);

    __fallbackForTests.set(`nib:blocked:${holder}`, 1);

    const after = await ask({ notes: NOTES, deviceId: id, platform: 'android' });
    expect(after.status).toBe(403);
    expect(after.credits).toBeUndefined();
  });
});
