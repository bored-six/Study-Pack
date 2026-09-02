/**
 * Working out what a picked file actually is.
 *
 * The picker is usually right and sometimes silent. When it was silent the
 * old code assumed PDF, so a photo reached Google labelled as a document, was
 * refused, and the student was told only that the reader could not be
 * reached. Everything here is about that failure never being silent again.
 */

import { fileType } from '../aiNotes';

/** Real first bytes, base64'd — what the sniffer actually reads. */
function bytesAsBase64(...bytes: number[]): string {
  const padded = [...bytes, ...new Array(64).fill(0)];
  return Buffer.from(Uint8Array.from(padded)).toString('base64');
}

const PDF = bytesAsBase64(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const PNG = bytesAsBase64(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytesAsBase64(0xff, 0xd8, 0xff, 0xe0);
const WEBP = bytesAsBase64(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
/** `ftyp` at four, brand `heic` at eight. */
const HEIC = bytesAsBase64(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63);
/** The same box, but a video. Must not be mistaken for a photo. */
const MP4 = bytesAsBase64(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d);

describe('when the picker says what it is', () => {
  it('believes it', () => {
    expect(fileType('a.pdf', 'application/pdf', PDF)).toBe('application/pdf');
    expect(fileType('a.jpg', 'image/jpeg', JPEG)).toBe('image/jpeg');
  });

  it('ignores a type Nib does not read, and works it out instead', () => {
    // Some providers report octet-stream for everything they do not know.
    expect(fileType('scan.png', 'application/octet-stream', PNG)).toBe('image/png');
  });
});

describe('when the picker says nothing', () => {
  it('reads the name', () => {
    expect(fileType('chapter.pdf', null, '')).toBe('application/pdf');
    expect(fileType('IMG_2041.JPG', undefined, '')).toBe('image/jpeg');
    expect(fileType('notes.jpeg', null, '')).toBe('image/jpeg');
    expect(fileType('board.PNG', null, '')).toBe('image/png');
    expect(fileType('shot.heic', null, '')).toBe('image/heic');
  });

  it('reads the bytes when the name is no help either', () => {
    // The case this whole file exists for: a photo with no type and no
    // usable name, which used to be sent to Google as a PDF.
    expect(fileType('download', null, JPEG)).toBe('image/jpeg');
    expect(fileType('download', null, PNG)).toBe('image/png');
    expect(fileType('download', null, PDF)).toBe('application/pdf');
    expect(fileType('download', null, WEBP)).toBe('image/webp');
    expect(fileType('download', null, HEIC)).toBe('image/heic');
  });
});

describe('when it cannot be worked out', () => {
  it('says so rather than guessing', () => {
    // Guessing PDF here is exactly the bug. Null lets the screen say
    // something a student can act on.
    expect(fileType('download', null, '')).toBeNull();
    expect(fileType('mystery.xyz', null, bytesAsBase64(1, 2, 3, 4))).toBeNull();
  });

  it('does not mistake a video for a photo', () => {
    // An MP4 carries the same `ftyp` box as a HEIC, four bytes in.
    expect(fileType('clip', null, MP4)).toBeNull();
  });
});
