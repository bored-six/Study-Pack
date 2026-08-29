/**
 * The exam builder re-presents one stored question as several formats.
 * Nothing new is invented here, which means every item it emits must still
 * be gradeable: the true/false statement has to actually be true when it
 * says so, the modified-true/false correction has to repair the sentence,
 * and matching has to pair each term with its own meaning.
 *
 * It also asks the two questions a student would: does the picker deliver
 * what it offered, and is the retake the same exam?
 */

import { readFileSync } from 'fs';
import { join, resolve } from 'path';

import {
  availability,
  buildExam,
  type ExamFormat,
  type ExamItem,
  type ExamRequest,
} from '../../src/lib/exam';
import { parseNotes } from '../../src/lib/noteParser';
import type { Question } from '../../src/lib/types';
import { REALISTIC } from '../corpora';
import { Report } from '../report';
import { percent, toQuestion, unique } from '../util';

const ROOT = resolve(__dirname, '..', '..');

const FORMATS: ExamFormat[] = [
  'multiple_choice',
  'true_false',
  'modified_true_false',
  'identification',
  'fill_blank',
  'matching',
  'enumeration',
];

/** Formats whose text should never still contain a blank. */
const NO_BLANK: ExamFormat[] = [
  'true_false',
  'modified_true_false',
  'identification',
  'matching',
  'enumeration',
];

/** How many differently-seeded sittings to sample when probing variety. */
const SITTINGS = 20;

function deckFor(text: string, deckId: string): Question[] {
  return parseNotes(text).questions.map((q, i) => toQuestion(q, deckId, i));
}

/** Rebuilds the sentence a cloze prompt describes, with `word` in the gap. */
function fill(prompt: string, word: string): string {
  return prompt.replace(/_{4,}/, word);
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '').trim().toLowerCase();
}

function itemText(item: ExamItem): string {
  switch (item.format) {
    case 'multiple_choice':
    case 'identification':
    case 'fill_blank':
    case 'enumeration':
      return item.prompt;
    case 'true_false':
      return item.statement;
    case 'modified_true_false':
      return item.words.join(' ');
    case 'matching':
      return [...item.terms, ...item.meanings].join(' ');
  }
}

export function checkExam(): Report {
  const report = new Report(
    'Exam formats',
    'Each format is built from real questions and inspected: is a statement really true when it is labelled true, does the correction repair it, does matching pair correctly, does the picker deliver the counts it advertises, and does a retake differ from the first sitting?',
    'EXAM'
  );

  const decks = REALISTIC.map((corpus) => ({
    name: corpus.name,
    questions: deckFor(corpus.text, `note:${corpus.name}`),
  }));

  const shortfalls: string[] = [];
  const starved: string[] = [];
  const mislabelledTrueFalse: string[] = [];
  const leakedBlank: string[] = [];
  const brokenCorrection: string[] = [];
  const brokenMatching: string[] = [];
  const reusedQuestions: string[] = [];
  const duplicateIds: string[] = [];
  const emptyItems: string[] = [];
  const identicalRetakes: string[] = [];
  const deadVariety: string[] = [];

  let trueCount = 0;
  let trueFalseTotal = 0;
  const delivered: Record<string, number> = {};

  for (const deck of decks) {
    if (deck.questions.length === 0) continue;
    const byId = new Map(deck.questions.map((q) => [q.id, q]));
    const available = availability(deck.questions);
    const offered = FORMATS.filter((format) => available[format] > 0);

    // --- one format at a time: does the picker's number hold up? ---------

    const inspect: ExamItem[] = [];
    for (const format of offered) {
      const items = buildExam(
        deck.questions,
        [{ format, count: available[format] }],
        `${deck.name}-${format}`
      );
      const got = items.filter((i) => i.format === format).length;
      delivered[format] = (delivered[format] ?? 0) + got;
      inspect.push(...items);

      if (got < available[format]) {
        shortfalls.push(
          `[${deck.name}] ${format}: availability() promised ${available[format]}, buildExam delivered ${got}`
        );
      }
    }

    // --- several formats at once: do they starve each other? -------------

    const mixed = offered.filter((format) => available[format] >= 2);
    if (mixed.length >= 2) {
      const requests: ExamRequest[] = mixed.map((format) => ({ format, count: 2 }));
      const items = buildExam(deck.questions, requests, `${deck.name}-mixed`);
      const missed = mixed.filter((format) => items.filter((i) => i.format === format).length < 2);
      if (missed.length > 0) {
        starved.push(
          `[${deck.name}] asked for 2 of each ${mixed.join(', ')} — got none or one of ${missed.join(', ')}`
        );
      }

      const usedQuestionIds = items.map((i) => i.questionId);
      if (unique(usedQuestionIds).length !== usedQuestionIds.length) {
        reusedQuestions.push(`[${deck.name}] a question was used by two items in the same exam`);
      }
      const ids = items.map((i) => i.id);
      if (unique(ids).length !== ids.length) {
        duplicateIds.push(`[${deck.name}] duplicate exam item id`);
      }
    }

    // --- is every item actually gradeable? -------------------------------

    for (const item of inspect) {
      const source = byId.get(item.questionId);
      if (!source) continue;

      const visible = itemText(item);
      if (visible.trim().length === 0) {
        emptyItems.push(`[${deck.name}] ${item.format} rendered with no text`);
      }
      if (NO_BLANK.includes(item.format) && /_{4,}/.test(visible)) {
        leakedBlank.push(`[${deck.name}] ${item.format}: "${visible}"`);
      }

      if (item.format === 'true_false') {
        trueFalseTotal++;
        if (item.isTrue) trueCount++;

        const truth =
          source.kind === 'cloze'
            ? fill(source.prompt, source.correctAnswer)
            : (source.sourceLine ?? '');
        const matchesTruth = normalise(item.statement) === normalise(truth);
        if (item.isTrue && !matchesTruth) {
          mislabelledTrueFalse.push(
            `[${deck.name}] marked TRUE but differs from the note: "${item.statement}" vs "${truth}"`
          );
        }
        if (!item.isTrue && matchesTruth) {
          mislabelledTrueFalse.push(
            `[${deck.name}] marked FALSE but identical to the note: "${item.statement}"`
          );
        }
      }

      if (item.format === 'modified_true_false') {
        const inRange = item.falseWordIndex >= 0 && item.falseWordIndex < item.words.length;
        if (item.isTrue) {
          if (item.falseWordIndex !== -1) {
            brokenCorrection.push(`[${deck.name}] a true statement still names a false word`);
          }
        } else if (!inRange) {
          brokenCorrection.push(
            `[${deck.name}] falseWordIndex ${item.falseWordIndex} is outside a ${item.words.length}-word statement`
          );
        } else {
          const shown = item.words[item.falseWordIndex].replace(/[.,;:!?)"']+$/, '');
          if (shown === item.correctWord) {
            brokenCorrection.push(
              `[${deck.name}] the word to correct is already the correct word: "${shown}"`
            );
          }
          const repaired = [...item.words];
          repaired[item.falseWordIndex] = item.correctWord;
          const truth = fill(source.prompt, source.correctAnswer);
          if (normalise(repaired.join(' ')) !== normalise(truth)) {
            brokenCorrection.push(
              `[${deck.name}] correcting the tapped word does not restore the note: "${repaired.join(' ')}" vs "${truth}"`
            );
          }
        }
      }

      if (item.format === 'matching') {
        const n = item.terms.length;
        const permutation = [...item.correctIndexFor].sort((a, b) => a - b);
        const valid =
          item.meanings.length === n && permutation.every((value, index) => value === index);
        if (!valid) {
          brokenMatching.push(
            `[${deck.name}] correctIndexFor is not a permutation of the ${n} meanings: [${item.correctIndexFor.join(', ')}]`
          );
        }
        if (unique(item.terms).length !== n) {
          brokenMatching.push(`[${deck.name}] the same term appears twice in one matching block`);
        }
        if (unique(item.meanings).length !== item.meanings.length) {
          brokenMatching.push(`[${deck.name}] the same meaning appears twice in one matching block`);
        }
      }
    }

    // --- two sittings ------------------------------------------------------

    const requests: ExamRequest[] = offered.map((format) => ({ format, count: available[format] }));
    const first = buildExam(deck.questions, requests, 'sitting-0');

    // Seeding is supported — so check that it actually changes the exam.
    const variants = unique(
      Array.from({ length: SITTINGS }, (_, n) =>
        JSON.stringify(buildExam(deck.questions, requests, `sitting-${n}`))
      )
    ).length;
    if (variants <= 1 && first.length > 1) {
      deadVariety.push(`[${deck.name}] ${SITTINGS} different seeds produced ${variants} distinct exam`);
    }
  }

  /**
   * Whether a retake is a new paper is decided at the call site, not here.
   *
   * buildExam is deterministic in its seed by design — that is what lets a
   * survival round rebuild itself. So the thing worth checking is that the
   * store mixes something per-sitting into the seed rather than the deck and
   * the mode alone, which no amount of building exams in this file can show.
   */
  const storeSource = readFileSync(join(ROOT, 'src', 'store', 'exam.ts'), 'utf8');
  const seedLine = /const seedText = `([^`]*)`/.exec(storeSource)?.[1];
  if (!seedLine) {
    identicalRetakes.push('src/store/exam.ts no longer builds a seedText the audit can read');
  } else if (!/Date\.now\(\)|attempt|Math\.random|sitting|nonce/.test(seedLine)) {
    identicalRetakes.push(`the seed is \`${seedLine}\` — nothing in it changes between sittings`);
  }

  report.metric(
    'Items built (one format at a time)',
    FORMATS.map((f) => `${f.replace(/_/g, ' ')}:${delivered[f] ?? 0}`).join('  ')
  );
  report.metric(
    'True/false balance',
    `${percent(trueCount, trueFalseTotal)} true of ${trueFalseTotal}`,
    'far from 50% teaches students to guess one way'
  );

  report.flagIf(
    mislabelledTrueFalse.length > 0,
    'high',
    'A true/false statement is labelled the wrong way round',
    'The item carries the answer key; if the statement and the key disagree, a student who knows the material is marked wrong.',
    mislabelledTrueFalse,
    'src/lib/exam.ts → buildTrueFalse'
  );

  report.flagIf(
    brokenCorrection.length > 0,
    'high',
    'Modified true/false cannot be corrected into a true statement',
    'The format promises that fixing the tapped word repairs the sentence. Where it does not, the student is asked to correct something that was already right, or to fix a word that was never wrong.',
    brokenCorrection,
    'src/lib/exam.ts → buildModifiedTrueFalse'
  );

  report.flagIf(
    brokenMatching.length > 0,
    'high',
    'Matching key does not line up with the columns',
    'correctIndexFor must be a permutation over the shuffled meanings, and the same term or meaning must not appear twice in one block.',
    brokenMatching,
    'src/lib/exam.ts → buildMatching'
  );

  report.flagIf(
    leakedBlank.length > 0,
    'high',
    'A blank marker leaked into a format that has no blank',
    'A true/false, identification or matching item is showing "______" where the word should have been substituted in.',
    leakedBlank,
    'src/lib/exam.ts → fillBlank'
  );

  report.flagIf(
    deadVariety.length > 0,
    'high',
    'Seeding the exam changes nothing',
    'buildExam takes a seed so that two sittings differ, but twenty different seeds produced one exam. Whatever the seed is meant to drive is not reaching the shuffle.',
    deadVariety,
    'src/lib/exam.ts → seed'
  );

  report.flagIf(
    reusedQuestions.length > 0 || duplicateIds.length > 0,
    'medium',
    'One question used by two items in the same exam',
    'The same fact is asked twice in one sitting, in two formats, and the first item gives away the second.',
    [...reusedQuestions, ...duplicateIds],
    'src/lib/exam.ts → buildExam'
  );

  report.flagIf(
    shortfalls.length > 0,
    'medium',
    'availability() offers more items than buildExam can deliver',
    'Asked for one format on its own, at exactly the count availability() reported, the exam came back short. The number the picker shows has to be the number the student gets.',
    shortfalls,
    'src/lib/exam.ts → availability'
  );

  report.flagIf(
    starved.length > 0,
    'medium',
    'Formats starve each other when several are requested',
    'buildExam walks the requests in order and marks each question used, so a format listed earlier can consume the questions a later format needed. A student asking for a mix gets a lopsided paper.',
    starved,
    'src/lib/exam.ts → buildExam'
  );

  report.flagIf(
    identicalRetakes.length > 0,
    'medium',
    'Every sitting of a deck produces the identical exam',
    'buildExam is deterministic in its seed, so the whole question of whether a retake is a new paper comes down to what the call site passes. A seed built only from the deck and the mode gives the same items in the same order with the same true/false answers every sitting, and the retake tests recall of the last exam rather than of the notes.',
    identicalRetakes,
    'src/store/exam.ts → startExam'
  );

  report.flagIf(
    emptyItems.length > 0,
    'medium',
    'An exam item rendered with no text',
    'Nothing for the student to read.',
    emptyItems
  );

  report.flagIf(
    trueFalseTotal >= 10 && (trueCount / trueFalseTotal < 0.2 || trueCount / trueFalseTotal > 0.8),
    'low',
    'True/false answers are lopsided',
    `${percent(trueCount, trueFalseTotal)} of statements are true. buildTrueFalse aims for a coin flip so that always answering one way does not pay.`,
    undefined,
    'src/lib/exam.ts → buildTrueFalse'
  );

  return report;
}
