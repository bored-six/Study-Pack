/**
 * Counting the pages of a real PDF, on the phone.
 *
 * The count is what a student is shown before they spend anything, so the
 * thing worth proving is that it survives the file shapes a real chapter
 * arrives in — in particular the compressed object streams every modern
 * writer produces, where searching the bytes for `/Type /Page` finds nothing
 * and would price a whole chapter as a single page.
 */

import { PDFDocument } from 'pdf-lib';

import { pagesFor, pdfPageCount } from '../aiNotes';

async function pdfOf(pages: number, useObjectStreams: boolean): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  const bytes = await doc.save({ useObjectStreams });
  return Buffer.from(bytes).toString('base64');
}

describe('pdfPageCount', () => {
  it('counts a plain PDF', async () => {
    expect(await pdfPageCount(await pdfOf(7, false))).toBe(7);
  });

  it('counts one saved with compressed object streams', async () => {
    // The case a bytes-level search gets wrong, and the reason pdf-lib is
    // here rather than a regex.
    expect(await pdfPageCount(await pdfOf(30, true))).toBe(30);
  });

  it('counts a single page as one', async () => {
    expect(await pdfPageCount(await pdfOf(1, true))).toBe(1);
  });

  it('says nothing rather than guessing when the file will not open', async () => {
    expect(await pdfPageCount(Buffer.from('not a pdf').toString('base64'))).toBeNull();
    expect(await pdfPageCount('')).toBeNull();
  });
});

describe('pagesFor', () => {
  it('prices a paste at one page', async () => {
    expect(await pagesFor({ kind: 'text', body: 'anything at all' })).toBe(1);
  });

  it('prices a photo at one page without opening it', async () => {
    expect(
      await pagesFor({ kind: 'file', base64: 'xxxx', mime: 'image/jpeg', name: 'a.jpg' })
    ).toBe(1);
  });

  it('prices a PDF at what it really holds', async () => {
    expect(
      await pagesFor({
        kind: 'file',
        base64: await pdfOf(12, true),
        mime: 'application/pdf',
        name: 'chapter.pdf',
      })
    ).toBe(12);
  });
});
