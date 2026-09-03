/**
 * Not a correctness assertion — a measurement of how loud the flags are.
 *
 * The whole design fails if most of a batch gets flagged: the review screen
 * becomes the wall it replaced, and a flag on everything means nothing. The
 * first version of the decoy rule flagged 85% of clean notes, which is what
 * this probe was written to catch.
 */
import { parseNotes } from '../noteParser';
import { flagsFor } from '../questionFlags';

function rate(label: string, notes: string) {
  const parsed = parseNotes(notes);
  const flags = flagsFor(parsed.questions);
  const flagged = flags.filter((f) => f != null);
  const byReason: Record<string, number> = {};
  for (const f of flagged) byReason[f!.reason] = (byReason[f!.reason] ?? 0) + 1;
  const pc = Math.round((flagged.length / Math.max(1, parsed.questions.length)) * 100);
  // eslint-disable-next-line no-console
  console.log(
    `\n  ${label}: ${parsed.questions.length} questions, ${flagged.length} flagged (${pc}%) ` +
      JSON.stringify(byReason)
  );
  return { total: parsed.questions.length, flagged: flagged.length, pc, byReason };
}

const CLEAN = `Cell Biology
Osmosis is the movement of water across a semi-permeable membrane.
Diffusion is the movement of particles from high to low concentration.
Active transport is the movement of substances against a concentration gradient using energy.
A semi-permeable membrane lets some molecules through but not others.
Mitosis is cell division producing two identical daughter cells.
Meiosis produces four genetically different gametes from one parent cell.
The stages of mitosis are prophase, metaphase, anaphase and telophase.
Photosynthesis converts light energy into chemical energy in the chloroplasts.
Respiration releases energy from glucose inside the mitochondria of a cell.
Enzymes are biological catalysts that speed up chemical reactions in cells.
Ribosomes make proteins from amino acids in the cytoplasm of the cell.`;

const SCRAPPY = `Chemistry
Chlorophyll is green.
The nucleus contains DNA.
Glucose is a simple sugar.
A catalyst lowers activation energy.
Turgor pressure pushes outward.
An atom has a nucleus.`;

it('stays quiet on clean notes', () => {
  const { pc } = rate('clean  ', CLEAN);
  // Anything approaching half is a wall, which is the thing being replaced.
  expect(pc).toBeLessThan(40);
});

it('does speak up on notes written in fragments', () => {
  const { flagged } = rate('scrappy', SCRAPPY);
  expect(flagged).toBeGreaterThan(0);
});
