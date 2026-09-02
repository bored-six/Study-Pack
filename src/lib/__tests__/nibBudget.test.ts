/**
 * The week, in pages.
 *
 * Two rules are being held to here, and both of them are about money moving
 * the right way. A reading is never charged more pages than questions it gave
 * back, and a reading that gave back nothing is never charged at all — which
 * is what the server's comment always claimed and what its code, until now,
 * did not do.
 *
 * The costing rule is duplicated rather than imported because it lives in a
 * Vercel handler that cannot be loaded under jest without a request. If the
 * two ever drift, the last test in this file is the one that fails.
 */

import { PAGES_FOR_IMAGE, TEXT_CHARS_PER_PAGE, pagesForText, percentOfWeek } from '../aiNotes';

/** Mirrors `cost` in api/nib.ts. */
function cost(pages: number, questions: number, allowance: number, used: number): number {
  return questions === 0 ? 0 : Math.min(pages, questions, Math.max(0, allowance - used));
}

/**
 * A week to do the arithmetic against. The size is not the point here — these
 * are checks on the shape of the rule, and they hold at any budget. That the
 * number matches the real one is guarded in api/__tests__/nibCharging, where
 * the client and server constants are compared directly.
 */
const WEEK = 150;

describe('what a reading costs', () => {
  it('charges nothing at all when nothing came back', () => {
    expect(cost(30, 0, WEEK, 0)).toBe(0);
    expect(cost(1, 0, WEEK, 0)).toBe(0);
    // The bug this file exists for: a full page taken for an empty answer.
    expect(cost(1, 0, WEEK, WEEK - 1)).toBe(0);
  });

  it('never charges more pages than questions it gave back', () => {
    // The picture-heavy chapter: thirty pages in, five questions out.
    expect(cost(30, 5, WEEK, 0)).toBe(5);
    expect(cost(30, 1, WEEK, 0)).toBe(1);
  });

  it('charges the whole file when the file earned it', () => {
    // A dense chapter yielding more questions than it has pages pays in full.
    expect(cost(12, 45, WEEK, 0)).toBe(12);
    expect(cost(1, 8, WEEK, 0)).toBe(1);
  });

  it('cannot push a week below zero', () => {
    expect(cost(30, 30, WEEK, WEEK - 2)).toBe(2);
    expect(cost(30, 30, WEEK, WEEK)).toBe(0);
  });

  it('prices a photo at one page', () => {
    expect(cost(PAGES_FOR_IMAGE, 9, WEEK, 0)).toBe(1);
  });

  /**
   * Measured, not assumed: Gemini charges a PDF page about 525 tokens
   * whatever is on it, a thousand characters of text 180, and ten thousand
   * 1,772. A full box of pasted notes is therefore worth roughly three and a
   * half pages, and used to be charged one.
   */
  it('prices a paste by how much of it there is', () => {
    expect(pagesForText('')).toBe(1);
    expect(pagesForText('a short line')).toBe(1);
    expect(pagesForText('x'.repeat(TEXT_CHARS_PER_PAGE))).toBe(1);
    expect(pagesForText('x'.repeat(TEXT_CHARS_PER_PAGE + 1))).toBe(2);
    // The biggest paste the box will take, against the measurement above.
    expect(pagesForText('x'.repeat(10_000))).toBe(4);
  });

  it('still never charges a paste more than the questions it gave', () => {
    // Four pages of notes that yielded two questions costs two.
    expect(cost(pagesForText('x'.repeat(10_000)), 2, WEEK, 0)).toBe(2);
  });

  it('is never negative, whatever it is given', () => {
    for (const pages of [0, 1, 7, 60, 500]) {
      for (const questions of [0, 1, 50]) {
        for (const used of [0, 30, WEEK, WEEK + 39]) {
          expect(cost(pages, questions, WEEK, used)).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('the week as a percentage', () => {
  it('reads full at full and empty at empty', () => {
    expect(percentOfWeek(WEEK, WEEK)).toBe(100);
    expect(percentOfWeek(0, WEEK)).toBe(0);
  });

  it('rounds a real slice to something a student can act on', () => {
    expect(percentOfWeek(30, 60)).toBe(50);
    expect(percentOfWeek(12, 60)).toBe(20);
    expect(percentOfWeek(3, 3)).toBe(100);
  });

  it('never rounds a page that will be charged down to nothing', () => {
    // One page of sixty is 1.6%, and must not be shown as 0% — a cost of
    // zero is a promise, and this one would be broken at the till.
    expect(percentOfWeek(1, 60)).toBe(2);
    expect(percentOfWeek(1, 500)).toBe(1);
  });

  it('never reports more than a whole week', () => {
    expect(percentOfWeek(90, 60)).toBe(100);
  });

  it('does not divide by a week of nothing', () => {
    expect(percentOfWeek(5, 0)).toBe(0);
  });
});
