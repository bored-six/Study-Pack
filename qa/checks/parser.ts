/**
 * Does a generated question actually work as a question?
 *
 * Everything here is checked against the notes it came from. A quiz item is
 * only sound if the right answer is among the options, exactly one option
 * can be right, nothing gives the answer away, and every word of it can be
 * traced back to something the student actually pasted.
 */

import { ENUM_LIMITS, LIMITS, parseNotes, type ParsedQuestion } from '../../src/lib/noteParser';
import { checkAnswer, normalizeAnswer } from '../../src/lib/grade';
import { REALISTIC, type Corpus } from '../corpora';
import { Report } from '../report';
import { canonical, contains, distractors, percent, words } from '../util';

/** Word-boundary containment, so "cell" does not match "cellular". */
function containsWord(haystack: string, needle: string): boolean {
  const n = canonical(needle).replace(/[^a-z0-9 ]/g, ' ').trim();
  if (n.length < 3) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(
    canonical(haystack).replace(/[^a-z0-9 ]/g, ' ')
  );
}

function label(corpus: Corpus, question: ParsedQuestion): string {
  return `[${corpus.name}] ${question.prompt}  →  ${question.correctAnswer}`;
}

export function checkParser(): Report {
  const report = new Report(
    'Question integrity',
    'Every generated question is checked against the notes it was built from: right answer present, exactly one right answer, nothing given away, nothing invented.',
    'PARSE'
  );

  const noAnswerInOptions: string[] = [];
  const collidingOptions: string[] = [];
  const wrongOptionCount: string[] = [];
  const secondCorrectOption: string[] = [];
  const giveaways: string[] = [];
  const brokenCloze: string[] = [];
  const inventedSource: string[] = [];
  const inventedDistractor: string[] = [];
  const badEnumeration: string[] = [];
  const overLongAnswer: string[] = [];
  const untidyPrompt: string[] = [];
  const nondeterministic: string[] = [];

  const failingQuestions = new Set<string>();
  /** Every per-question issue list, so "how many questions are bad" is exact. */
  const perQuestion = [
    noAnswerInOptions,
    collidingOptions,
    wrongOptionCount,
    secondCorrectOption,
    giveaways,
    brokenCloze,
    inventedSource,
    inventedDistractor,
    badEnumeration,
    overLongAnswer,
    untidyPrompt,
  ];
  const issueCount = () => perQuestion.reduce((total, list) => total + list.length, 0);

  let questionTotal = 0;
  const kinds: Record<string, number> = { definition: 0, cloze: 0, enumeration: 0 };
  const skipReasons: Record<string, number> = {};

  for (const corpus of REALISTIC) {
    const result = parseNotes(corpus.text);
    const again = parseNotes(corpus.text);

    if (JSON.stringify(result.questions) !== JSON.stringify(again.questions)) {
      nondeterministic.push(`[${corpus.name}] two parses of identical input disagreed`);
    }

    questionTotal += result.questions.length;
    for (const skip of result.stats.skipped) {
      skipReasons[skip.reason] = (skipReasons[skip.reason] ?? 0) + 1;
    }

    if (result.questions.length > LIMITS.maxQuestions) {
      report.add(
        'medium',
        'More questions than the documented cap',
        `LIMITS.maxQuestions is ${LIMITS.maxQuestions} but ${corpus.name} produced ${result.questions.length}.`,
        undefined,
        'src/lib/noteParser.ts'
      );
    }

    for (const question of result.questions) {
      kinds[question.kind] = (kinds[question.kind] ?? 0) + 1;
      const wrong = distractors(question);
      const issuesBefore = issueCount();

      if (!question.answers.includes(question.correctAnswer)) {
        noAnswerInOptions.push(label(corpus, question));
      }

      const normalized = question.answers.map(normalizeAnswer);
      if (new Set(normalized).size !== normalized.length) {
        collidingOptions.push(`${label(corpus, question)}  options: ${question.answers.join(' | ')}`);
      }

      if (question.kind !== 'enumeration' && question.answers.length !== 4) {
        wrongOptionCount.push(
          `${label(corpus, question)}  (${question.answers.length} options)`
        );
      }

      // Typed formats grade with checkAnswer. If a wrong option passes that
      // check, the same question has two right answers depending on format.
      for (const decoy of wrong) {
        if (checkAnswer(decoy, question.correctAnswer).correct) {
          secondCorrectOption.push(`${label(corpus, question)}  also accepted: "${decoy}"`);
        }
      }

      if (question.kind !== 'enumeration' && containsWord(question.prompt, question.correctAnswer)) {
        giveaways.push(`${label(corpus, question)}  (answer visible in the prompt)`);
      }

      if (question.kind === 'cloze') {
        const blanks = (question.prompt.match(/_{4,}/g) ?? []).length;
        if (blanks !== 1) {
          brokenCloze.push(`${label(corpus, question)}  (${blanks} blanks in the prompt)`);
        }
      }

      // A list question's source line is assembled from a heading plus its
      // items, so it is checked piece by piece rather than as one string.
      const sourceParts =
        question.kind === 'enumeration'
          ? (question.sourceLine ?? '').split(/:\s*|,\s*/).filter((part) => part.trim().length > 0)
          : [question.sourceLine];
      const unsourced = sourceParts.filter((part) => part && !contains(corpus.text, part));
      if (question.sourceLine && unsourced.length > 0) {
        inventedSource.push(
          `${label(corpus, question)}  not in the notes: ${unsourced.map((p) => `"${p}"`).join(', ')}`
        );
      }

      // Numeric decoys are computed on purpose ("1919" → "1924"), so only
      // word answers are expected to trace back to the notes.
      if (!/^-?[\d.,]+%?$/.test(question.correctAnswer.trim())) {
        for (const decoy of wrong) {
          if (!contains(corpus.text, decoy)) {
            inventedDistractor.push(`${label(corpus, question)}  decoy not in notes: "${decoy}"`);
          }
        }
      }

      if (question.kind === 'enumeration') {
        const items = question.answers;
        const duplicated = new Set(items.map(normalizeAnswer)).size !== items.length;
        const outOfRange = items.length < ENUM_LIMITS.min || items.length > ENUM_LIMITS.max;
        const missing = items.filter((item) => !contains(corpus.text, item));
        if (duplicated || outOfRange || missing.length > 0) {
          badEnumeration.push(
            `${label(corpus, question)}  items: ${items.join(' | ')}${
              missing.length ? `  · not in notes: ${missing.join(', ')}` : ''
            }`
          );
        }
      } else if (words(question.correctAnswer).length > LIMITS.maxAnswerWords) {
        overLongAnswer.push(label(corpus, question));
      }

      const prompt = question.prompt;
      if (
        prompt.trim() !== prompt ||
        prompt.length === 0 ||
        /\s{2,}/.test(prompt) ||
        /\s[.,;:?!]/.test(prompt) ||
        /[,;:]\s*\?$/.test(prompt)
      ) {
        untidyPrompt.push(`${label(corpus, question)}  prompt: "${prompt}"`);
      }

      if (issueCount() > issuesBefore) failingQuestions.add(`${corpus.name}:${question.prompt}`);
    }
  }

  report.metric('Questions generated', questionTotal, `across ${REALISTIC.length} note sets`);
  report.metric(
    'By kind',
    Object.entries(kinds)
      .map(([k, v]) => `${k}:${v}`)
      .join('  '),
    'a healthy mix means the parser is reading structure, not one pattern'
  );
  report.metric(
    'Lines skipped',
    Object.entries(skipReasons)
      .map(([k, v]) => `${k}:${v}`)
      .join('  ') || 'none',
    'every skipped line is shown to the student with this reason'
  );

  report.flagIf(
    noAnswerInOptions.length > 0,
    'high',
    'Right answer missing from the options',
    'The question cannot be answered correctly — whatever the student taps is marked wrong.',
    noAnswerInOptions,
    'src/lib/noteParser.ts → parseNotes'
  );

  report.flagIf(
    collidingOptions.length > 0,
    'high',
    'Two options are the same answer once normalised',
    'Two buttons say the same thing, so one correct-looking tap is scored wrong. Normalisation here matches grade.ts, which is what typed formats use.',
    collidingOptions,
    'src/lib/noteParser.ts → termDistractors'
  );

  report.flagIf(
    secondCorrectOption.length > 0,
    'high',
    'A wrong option is accepted as correct by the grader',
    'The same question has two right answers depending on the format it is shown in: multiple choice marks the decoy wrong, identification accepts it.',
    secondCorrectOption,
    'src/lib/grade.ts → checkAnswer'
  );

  report.flagIf(
    inventedSource.length > 0,
    'high',
    'Question traced to a line that is not in the notes',
    'The source sentence shown beside a question does not appear in what the student pasted.',
    inventedSource,
    'src/lib/noteParser.ts'
  );

  report.flagIf(
    inventedDistractor.length > 0,
    'high',
    'Wrong answers that appear nowhere in the notes',
    'Distractors are meant to come from other terms in the same notes. Options from outside them are filler, and filler is obvious to a student.',
    inventedDistractor,
    'src/lib/noteParser.ts → termDistractors'
  );

  report.flagIf(
    giveaways.length > 0,
    'medium',
    'The prompt contains its own answer',
    'A student can answer without knowing anything — the term appears in the definition being read out.',
    giveaways,
    'src/lib/noteParser.ts → definitionPrompt'
  );

  report.flagIf(
    wrongOptionCount.length > 0,
    'medium',
    'Multiple choice without exactly four options',
    'Option count varies between questions, which changes the odds of a lucky guess from one question to the next.',
    wrongOptionCount
  );

  report.flagIf(
    brokenCloze.length > 0,
    'medium',
    'Fill-in-the-blank without exactly one blank',
    'Zero blanks leaves nothing to fill; more than one makes the answer ambiguous. This also breaks the true/false builder, which locates the blank by index.',
    brokenCloze,
    'src/lib/noteParser.ts → buildCloze'
  );

  report.flagIf(
    badEnumeration.length > 0,
    'medium',
    'Enumeration list is malformed',
    'A list question must have between ' +
      `${ENUM_LIMITS.min} and ${ENUM_LIMITS.max} distinct items, all of them present in the notes.`,
    badEnumeration
  );

  report.flagIf(
    nondeterministic.length > 0,
    'high',
    'Parsing the same notes twice gave different questions',
    'The parser is documented as deterministic; the shuffle is seeded for exactly this reason. Non-determinism means a review screen and the saved deck can disagree.',
    nondeterministic
  );

  report.flagIf(
    overLongAnswer.length > 0,
    'low',
    'Answer longer than the documented maximum',
    `LIMITS.maxAnswerWords is ${LIMITS.maxAnswerWords}; longer answers do not fit an option button on a phone.`,
    overLongAnswer
  );

  report.flagIf(
    untidyPrompt.length > 0,
    'low',
    'Prompt has visible formatting damage',
    'Doubled spaces, a space before punctuation, or stray leading/trailing whitespace — small, but it is the first thing a student reads.',
    untidyPrompt
  );

  report.metric(
    'Questions failing at least one check',
    `${failingQuestions.size} of ${questionTotal} (${percent(failingQuestions.size, questionTotal)})`,
    'lower is better'
  );

  return report;
}
