/**
 * Grading: does a right answer get marked right, and a wrong one wrong?
 *
 * The typed formats (identification, fill the blank, enumeration) live or
 * die on this. A grader that is too strict punishes a student who knew the
 * answer; one that is too loose tells them they knew something they didn't.
 */

import { checkAnswer, checkEnumeration, normalizeAnswer } from '../../src/lib/grade';
import { parseNotes } from '../../src/lib/noteParser';
import { REALISTIC } from '../corpora';
import { Report } from '../report';
import { distractors, percent } from '../util';

/** A plausible typo: drop one character from the middle. */
function typo(text: string): string {
  const middle = Math.floor(text.length / 2);
  return text.slice(0, middle) + text.slice(middle + 1);
}

function looksNumeric(text: string): boolean {
  return /\d/.test(text) && /^[\d.,%\s-]+$/.test(text.trim());
}

export function checkGrading(): Report {
  const report = new Report(
    'Grading',
    'Right answers accepted, wrong answers refused, and the "nearly right" hint reserved for answers that really are nearly right.',
    'GRADE'
  );

  const answers = REALISTIC.flatMap((corpus) =>
    parseNotes(corpus.text).questions.map((q) => ({ corpus: corpus.name, question: q }))
  );

  const rejectedOwnAnswer: string[] = [];
  const rejectedVariant: string[] = [];
  const acceptedEmpty: string[] = [];
  const numericNearMiss: string[] = [];
  const missedTypo: string[] = [];
  let nearMissFalsePositives = 0;
  let decoyPairs = 0;

  for (const { corpus, question } of answers) {
    if (question.kind === 'enumeration') continue;
    const correct = question.correctAnswer;

    if (!checkAnswer(correct, correct).correct) {
      rejectedOwnAnswer.push(`[${corpus}] "${correct}" rejected as an answer to its own question`);
    }

    // The documented tolerances: case, surrounding space, trailing stop,
    // a leading article.
    for (const variant of [
      correct.toUpperCase(),
      correct.toLowerCase(),
      `  ${correct}  `,
      `${correct}.`,
      `the ${correct}`,
    ]) {
      if (!checkAnswer(variant, correct).correct) {
        rejectedVariant.push(`[${corpus}] "${variant}" rejected for expected "${correct}"`);
      }
    }

    if (checkAnswer('', correct).correct || checkAnswer('   ', correct).correct) {
      acceptedEmpty.push(`[${corpus}] blank accepted for "${correct}"`);
    }

    // A misspelling is what the near-miss hint exists for.
    if (!looksNumeric(correct) && normalizeAnswer(correct).length >= 6) {
      const check = checkAnswer(typo(correct), correct);
      if (!check.correct && !check.nearMiss) {
        missedTypo.push(`[${corpus}] "${typo(correct)}" not recognised as a near miss for "${correct}"`);
      }
    }

    // A different number is a different fact, never "so close".
    if (looksNumeric(correct)) {
      const bumped = correct.replace(/\d(?=\D*$)/, (d) => String((Number(d) + 1) % 10));
      if (bumped !== correct) {
        const check = checkAnswer(bumped, correct);
        if (check.nearMiss) {
          numericNearMiss.push(`[${corpus}] "${bumped}" called a near miss for "${correct}"`);
        }
      }
    }

    for (const decoy of distractors(question)) {
      decoyPairs++;
      if (checkAnswer(decoy, correct).nearMiss) nearMissFalsePositives++;
    }
  }

  // --- enumeration --------------------------------------------------------

  const enumerations = answers
    .filter(({ question }) => question.kind === 'enumeration')
    .map(({ corpus, question }) => ({ corpus, items: question.answers, ordered: question.ordered }));

  const enumRejectedExact: string[] = [];
  const enumOrderIgnored: string[] = [];
  const enumDuplicateCredit: string[] = [];
  const enumOverAnswer: string[] = [];

  for (const { corpus, items } of enumerations) {
    if (!checkEnumeration(items, items, false).correct) {
      enumRejectedExact.push(`[${corpus}] the exact list was marked wrong: ${items.join(', ')}`);
    }
    if (!checkEnumeration(items, items, true).correct) {
      enumRejectedExact.push(`[${corpus}] the exact list in order was marked wrong: ${items.join(', ')}`);
    }

    const reversed = [...items].reverse();
    if (items.length > 1 && checkEnumeration(reversed, items, true).correct) {
      enumOrderIgnored.push(`[${corpus}] a reversed list still passed an ordered question`);
    }

    const repeated = Array(items.length).fill(items[0]);
    const repeatedCheck = checkEnumeration(repeated, items, false);
    if (repeatedCheck.matchedCount > 1) {
      enumDuplicateCredit.push(
        `[${corpus}] answering "${items[0]}" ${items.length}× scored ${repeatedCheck.matchedCount}/${items.length}`
      );
    }

    // Listing everything you can think of should not be a winning strategy.
    const padded = [...items, 'zzz filler one', 'zzz filler two', 'zzz filler three'];
    if (checkEnumeration(padded, items, false).correct) {
      enumOverAnswer.push(
        `[${corpus}] a list padded with 3 wrong extras still scored full marks (${items.length}/${items.length})`
      );
    }
  }

  report.metric('Answers exercised', answers.length);
  report.metric('Enumeration questions exercised', enumerations.length);
  report.metric(
    'Wrong options called "nearly right"',
    `${nearMissFalsePositives} of ${decoyPairs} (${percent(nearMissFalsePositives, decoyPairs)})`,
    'a decoy should read as wrong, not as a spelling slip'
  );

  report.flagIf(
    rejectedOwnAnswer.length > 0,
    'high',
    'A question rejects its own answer',
    'Typing exactly the stored answer is marked wrong. Nothing else in the app matters if this happens.',
    rejectedOwnAnswer,
    'src/lib/grade.ts → checkAnswer'
  );

  report.flagIf(
    acceptedEmpty.length > 0,
    'high',
    'An empty answer is accepted',
    'Skipping the question scores a point.',
    acceptedEmpty,
    'src/lib/grade.ts → checkAnswer'
  );

  report.flagIf(
    enumRejectedExact.length > 0,
    'high',
    'A perfect list answer is marked wrong',
    'Typing back exactly the stored items did not score full marks.',
    enumRejectedExact,
    'src/lib/grade.ts → checkEnumeration'
  );

  report.flagIf(
    rejectedVariant.length > 0,
    'medium',
    'A documented tolerance is not honoured',
    'grade.ts says case, surrounding space, a trailing full stop and a leading article are noise. One of those forms was refused.',
    rejectedVariant,
    'src/lib/grade.ts → normalizeAnswer'
  );

  report.flagIf(
    enumDuplicateCredit.length > 0,
    'high',
    'Repeating one item fills several slots',
    'The comment in checkEnumeration promises each typed entry is consumed once. Typing the same word repeatedly should not score.',
    enumDuplicateCredit,
    'src/lib/grade.ts → checkEnumeration'
  );

  report.flagIf(
    enumOrderIgnored.length > 0,
    'medium',
    'Order is not enforced on an ordered list',
    'A question flagged as order-sensitive accepted the items backwards, so the ordering flag means nothing to the student.',
    enumOrderIgnored,
    'src/lib/grade.ts → checkEnumeration'
  );

  report.flagIf(
    enumOverAnswer.length > 0,
    'medium',
    'Padding a list with wrong items is not penalised',
    'Extra entries are ignored rather than counted against the answer, so listing every term in the notes scores full marks on every list question.',
    enumOverAnswer,
    'src/lib/grade.ts → checkEnumeration'
  );

  report.flagIf(
    numericNearMiss.length > 0,
    'medium',
    '"Nearly right" shown for a different number',
    'grade.ts states numbers are exact or nothing — 36 and 35 are different facts. A one-digit difference is being softened into a near miss, which teaches the wrong number.',
    numericNearMiss,
    'src/lib/grade.ts → checkAnswer'
  );

  report.flagIf(
    missedTypo.length > 0,
    'low',
    'A one-character typo is not recognised as a near miss',
    'The near-miss hint is the feature that tells a student they knew the term and mistyped it. It is not firing on a single dropped character.',
    missedTypo,
    'src/lib/grade.ts → editDistance'
  );

  report.flagIf(
    decoyPairs > 0 && nearMissFalsePositives / decoyPairs > 0.1,
    'low',
    'Wrong options are often reported as nearly right',
    `${percent(nearMissFalsePositives, decoyPairs)} of decoys are graded as near misses, so the encouragement lands on answers that were simply wrong.`
  );

  return report;
}
