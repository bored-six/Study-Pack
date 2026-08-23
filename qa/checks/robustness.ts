/**
 * Whatever the lecturer typed, a student will paste. Nothing in here should
 * throw, hang, or produce a question that cannot be answered — and the junk
 * inputs should produce *nothing*, quietly, rather than nonsense questions.
 */

import { availability, buildExam, type ExamRequest, type ExamFormat } from '../../src/lib/exam';
import { checkAnswer, checkEnumeration } from '../../src/lib/grade';
import { LIMITS, parseNotes } from '../../src/lib/noteParser';
import { ADVERSARIAL, REALISTIC } from '../corpora';
import { Report } from '../report';
import { normalizeAnswer } from '../../src/lib/grade';
import { toQuestion, timed } from '../util';

/** Inputs that should sensibly yield nothing at all. */
const EXPECT_EMPTY = ['empty', 'whitespace', 'single-word', 'all-headings', 'all-tasks'];

/** Budget for one paste, in ms. Well above what the parser needs. */
const PARSE_BUDGET_MS = 400;

const FORMATS: ExamFormat[] = [
  'multiple_choice',
  'true_false',
  'modified_true_false',
  'identification',
  'fill_blank',
  'matching',
  'enumeration',
];

/** Deterministic pseudo-random slicer, for fuzzing without flaky runs. */
function* slices(text: string, count: number): Generator<string> {
  let h = 2166136261;
  for (let n = 0; n < count; n++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const start = h % Math.max(1, text.length);
    h = (h * 1103515245 + 12345) >>> 0;
    const end = start + (h % Math.max(1, text.length - start + 1));
    yield text.slice(start, end);
  }
}

export function checkRobustness(): Report {
  const report = new Report(
    'Robustness',
    'Hostile and malformed input through the whole chain — parser, exam builder, grader — checking for crashes, runaway time, and junk questions produced from junk input.',
    'FUZZ'
  );

  const crashes: string[] = [];
  const slow: string[] = [];
  const junkQuestions: string[] = [];
  const brokenUnderStress: string[] = [];
  const limitBreaches: string[] = [];

  let slowest = { name: '', ms: 0 };

  for (const corpus of ADVERSARIAL) {
    let questions;
    try {
      const run = timed(() => parseNotes(corpus.text));
      questions = run.result.questions;
      if (run.ms > slowest.ms) slowest = { name: corpus.name, ms: run.ms };
      if (run.ms > PARSE_BUDGET_MS) {
        slow.push(`${corpus.name}: ${run.ms}ms for ${corpus.text.length} chars`);
      }
    } catch (e) {
      crashes.push(`parseNotes threw on "${corpus.name}": ${(e as Error).message}`);
      continue;
    }

    if (EXPECT_EMPTY.includes(corpus.name) && questions.length > 0) {
      junkQuestions.push(
        `${corpus.name} (${corpus.intent}) produced ${questions.length}: ${questions
          .map((q) => q.prompt)
          .join(' | ')}`
      );
    }

    if (corpus.name === 'duplicate-lines' && questions.length > 1) {
      junkQuestions.push(
        `the same line pasted five times produced ${questions.length} questions`
      );
    }

    if (questions.length > LIMITS.maxQuestions) {
      limitBreaches.push(`${corpus.name}: ${questions.length} questions, cap is ${LIMITS.maxQuestions}`);
    }

    // The core invariants have to hold on hostile input too.
    for (const question of questions) {
      const options = question.answers;
      const normalised = options.map(normalizeAnswer);
      if (!options.includes(question.correctAnswer)) {
        brokenUnderStress.push(`[${corpus.name}] right answer missing: "${question.prompt}"`);
      }
      if (new Set(normalised).size !== normalised.length) {
        brokenUnderStress.push(`[${corpus.name}] duplicate options: ${options.join(' | ')}`);
      }
      if (question.kind === 'cloze' && (question.prompt.match(/_{4,}/g) ?? []).length !== 1) {
        brokenUnderStress.push(
          `[${corpus.name}] cloze with ${(question.prompt.match(/_{4,}/g) ?? []).length} blanks: "${question.prompt}"`
        );
      }
      if (question.prompt.trim().length === 0 || question.correctAnswer.trim().length === 0) {
        brokenUnderStress.push(`[${corpus.name}] empty prompt or answer`);
      }
    }

    // …and the exam builder has to survive whatever came out.
    try {
      const deck = questions.map((q, i) => toQuestion(q, `note:${corpus.name}`, i));
      const available = availability(deck);
      const requests: ExamRequest[] = FORMATS.filter((f) => available[f] > 0).map((format) => ({
        format,
        count: available[format],
      }));
      const items = buildExam(deck, requests, corpus.name);
      for (const item of items) {
        if (item.format === 'modified_true_false') {
          const outside = item.falseWordIndex >= item.words.length;
          if (outside) {
            brokenUnderStress.push(
              `[${corpus.name}] modified true/false points at word ${item.falseWordIndex} of ${item.words.length}`
            );
          }
        }
      }
    } catch (e) {
      crashes.push(`buildExam threw on "${corpus.name}": ${(e as Error).message}`);
    }
  }

  // --- random slices of real notes ---------------------------------------

  let sliceCount = 0;
  for (const corpus of REALISTIC) {
    for (const slice of slices(corpus.text, 60)) {
      sliceCount++;
      try {
        const result = parseNotes(slice);
        for (const question of result.questions) {
          if (!question.answers.includes(question.correctAnswer)) {
            brokenUnderStress.push(
              `[slice of ${corpus.name}] right answer missing from options: "${question.prompt}"`
            );
          }
        }
      } catch (e) {
        crashes.push(`parseNotes threw on a slice of ${corpus.name}: ${(e as Error).message}`);
      }
    }
  }

  // --- grader fuzz --------------------------------------------------------

  const hostileAnswers = [
    '',
    '   ',
    '\n\t',
    'a'.repeat(5000),
    '$& $1 $` $\'',
    '(){}[]*+?^|\\',
    '🔋🔋🔋',
    'مرحبا',
    '0'.repeat(300),
    'The  double   spaced   answer',
  ];

  for (const typed of hostileAnswers) {
    for (const expected of ['Mitochondrion', '1919', '', '🔋', 'a'.repeat(400)]) {
      try {
        checkAnswer(typed, expected);
        checkEnumeration([typed], [expected], false);
        checkEnumeration([typed, typed], [expected, expected], true);
      } catch (e) {
        crashes.push(
          `grader threw on typed=${JSON.stringify(typed.slice(0, 20))} expected=${JSON.stringify(
            expected.slice(0, 20)
          )}: ${(e as Error).message}`
        );
      }
    }
  }

  report.metric('Hostile note sets', ADVERSARIAL.length);
  report.metric('Random slices parsed', sliceCount);
  report.metric('Grader fuzz pairs', hostileAnswers.length * 5);
  report.metric('Slowest parse', `${slowest.ms}ms (${slowest.name})`, `budget ${PARSE_BUDGET_MS}ms`);

  report.flagIf(
    crashes.length > 0,
    'high',
    'Input that crashes the app',
    'These are pastes a student could realistically make. A throw here takes down the review screen with nothing saved.',
    crashes
  );

  report.flagIf(
    brokenUnderStress.length > 0,
    'high',
    'Unanswerable questions produced from awkward input',
    'The invariants that hold on tidy notes stop holding here — a missing right answer, duplicate options, or a fill-in-the-blank with the wrong number of blanks.',
    brokenUnderStress
  );

  report.flagIf(
    junkQuestions.length > 0,
    'medium',
    'Questions generated from input with nothing to test',
    'A table of contents, a to-do list or one word should yield nothing and say so, rather than a quiz the student cannot answer.',
    junkQuestions
  );

  report.flagIf(
    limitBreaches.length > 0,
    'medium',
    'Documented limits exceeded under stress',
    'The caps in LIMITS are what keep the review screen usable.',
    limitBreaches
  );

  report.flagIf(
    slow.length > 0,
    'medium',
    'Parsing takes long enough to freeze the screen',
    `Parsing runs on the JS thread when the student taps Generate. Anything over ${PARSE_BUDGET_MS}ms is a visible stall.`,
    slow
  );

  return report;
}
