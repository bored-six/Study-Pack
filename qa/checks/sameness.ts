/**
 * "Am I getting the same results no matter what I feed it?"
 *
 * A generator can pass every correctness check and still be broken in the
 * way that matters: producing output that barely depends on its input.
 * Four different measurements of that here.
 *
 *   1. Collision   — do two note sets with no shared vocabulary produce
 *                    the same questions?
 *   2. Rewrite     — rewrite every domain word in a note, keeping the
 *                    structure identical. The quiz must keep its shape and
 *                    change its content. Same content out = the input was
 *                    never really read.
 *   3. Recycling   — is one handful of terms doing duty as the wrong answer
 *                    on most questions?
 *   4. Position    — is the right answer always in the same slot?
 */

import { parseNotes } from '../../src/lib/noteParser';
import { REALISTIC, rewriteVocabulary } from '../corpora';
import { Report } from '../report';
import { distractors, jaccard, percent } from '../util';

/** The part of a prompt that is not boilerplate — the bit taken from notes. */
function promptContent(prompt: string): string {
  return prompt
    .replace(/^Which term (?:means|is short for)[:\s]*/i, '')
    .replace(/^List the \d+:\s*/i, '')
    .replace(/_{4,}/g, ' ')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function answerSet(text: string): Set<string> {
  return new Set(parseNotes(text).questions.map((q) => q.correctAnswer.toLowerCase()));
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

export function checkSameness(): Report {
  const report = new Report(
    'Repetition & input sensitivity',
    'Measures how much the generated quiz actually depends on the notes it was given — collisions between unrelated note sets, behaviour under a content rewrite, recycled wrong answers, and answer-position bias.',
    'SAME'
  );

  const parsed = REALISTIC.map((corpus) => ({
    corpus,
    questions: parseNotes(corpus.text).questions,
  }));

  // --- 1. collisions between unrelated note sets -------------------------

  const promptOwners = new Map<string, Set<string>>();
  for (const { corpus, questions } of parsed) {
    for (const question of questions) {
      const key = question.prompt.toLowerCase();
      const owners = promptOwners.get(key) ?? new Set<string>();
      owners.add(corpus.name);
      promptOwners.set(key, owners);
    }
  }
  const shared = [...promptOwners.entries()].filter(([, owners]) => owners.size > 1);

  report.flagIf(
    shared.length > 0,
    'high',
    'The same question appears in unrelated note sets',
    'These note sets share no vocabulary, so an identical question in two of them was not read out of either.',
    shared.map(([prompt, owners]) => `${[...owners].join(' + ')}: ${prompt}`)
  );

  let worstPair = { pair: '', score: 0 };
  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const score = jaccard(
        new Set(parsed[i].questions.map((q) => q.correctAnswer.toLowerCase())),
        new Set(parsed[j].questions.map((q) => q.correctAnswer.toLowerCase()))
      );
      if (score > worstPair.score) {
        worstPair = { pair: `${parsed[i].corpus.name} ↔ ${parsed[j].corpus.name}`, score };
      }
    }
  }
  report.metric(
    'Worst answer overlap between note sets',
    `${(worstPair.score * 100).toFixed(1)}%  (${worstPair.pair || 'n/a'})`,
    'should be near zero — these notes have nothing in common'
  );
  report.flagIf(
    worstPair.score > 0.15,
    'medium',
    'Unrelated note sets produce overlapping answers',
    `${worstPair.pair} share ${(worstPair.score * 100).toFixed(1)}% of their answers despite covering different subjects.`
  );

  // --- 2. the rewrite control -------------------------------------------

  const rewriteRows: string[] = [];
  const insensitive: string[] = [];
  const shapeShifts: string[] = [];

  for (const { corpus, questions } of parsed) {
    const rewritten = parseNotes(rewriteVocabulary(corpus.text)).questions;

    const before = new Set(questions.map((q) => promptContent(q.prompt)));
    const after = new Set(rewritten.map((q) => promptContent(q.prompt)));
    const contentOverlap = jaccard(before, after);

    const answerOverlap = jaccard(
      new Set(questions.map((q) => q.correctAnswer.toLowerCase())),
      new Set(rewritten.map((q) => q.correctAnswer.toLowerCase()))
    );

    const countDelta = rewritten.length - questions.length;
    rewriteRows.push(
      `${corpus.name}: ${questions.length} → ${rewritten.length} questions, ` +
        `content overlap ${(contentOverlap * 100).toFixed(0)}%, answer overlap ${(answerOverlap * 100).toFixed(0)}%`
    );

    // Every long word changed, so any substantial carry-over is content
    // that did not come from the notes.
    if (contentOverlap > 0.25 || answerOverlap > 0.35) {
      insensitive.push(
        `${corpus.name}: rewriting every domain word left ${(contentOverlap * 100).toFixed(0)}% of prompt content and ${(answerOverlap * 100).toFixed(0)}% of answers unchanged`
      );
    }

    // The structure was untouched, so the question count should barely move.
    if (questions.length > 0 && Math.abs(countDelta) / questions.length > 0.25) {
      shapeShifts.push(
        `${corpus.name}: ${questions.length} → ${rewritten.length} questions from structurally identical notes`
      );
    }
  }

  report.metric('Rewrite control', rewriteRows.join(' · '), 'same structure, different words');

  report.flagIf(
    insensitive.length > 0,
    'high',
    'Output barely changed when the content did',
    'Notes were rewritten so that every domain word differs while punctuation, capitalisation, word length and line structure stay identical. Questions that survive that unchanged are not being read from the input.',
    insensitive
  );

  report.flagIf(
    shapeShifts.length > 0,
    'low',
    'Question count swings on vocabulary alone',
    'Structurally identical notes produced a noticeably different number of questions, so extraction is leaning on specific words rather than on the shape of the line. Not wrong, but it makes output unpredictable across subjects.',
    shapeShifts
  );

  // --- 3. recycled wrong answers ----------------------------------------

  const recyclers: string[] = [];
  let slotTotal = 0;
  let distinctTotal = 0;

  for (const { corpus, questions } of parsed) {
    const pool = questions.filter((q) => q.kind !== 'enumeration');
    const slots = pool.flatMap((q) => distractors(q).map((d) => d.toLowerCase()));
    if (slots.length === 0) continue;
    slotTotal += slots.length;
    distinctTotal += new Set(slots).size;

    const frequency = new Map<string, number>();
    for (const slot of slots) frequency.set(slot, (frequency.get(slot) ?? 0) + 1);
    const [term, count] = [...frequency.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = count / pool.length;
    if (share > 0.5 && pool.length >= 6) {
      recyclers.push(
        `${corpus.name}: "${term}" is an option on ${count} of ${pool.length} questions (${(share * 100).toFixed(0)}%)`
      );
    }
  }

  report.metric(
    'Distinct wrong answers',
    `${distinctTotal} across ${slotTotal} slots (${percent(distinctTotal, slotTotal)})`,
    'low means the same few decoys keep reappearing'
  );

  report.flagIf(
    recyclers.length > 0,
    'medium',
    'The same term is a wrong answer on most questions',
    'When one decoy appears everywhere, students learn to eliminate it on sight and the quiz gets easier the longer it runs.',
    recyclers,
    'src/lib/noteParser.ts → termDistractors'
  );

  // --- 4. where the right answer sits ------------------------------------

  const positions = [0, 0, 0, 0];
  let positioned = 0;
  for (const { questions } of parsed) {
    for (const question of questions) {
      if (question.kind === 'enumeration' || question.answers.length !== 4) continue;
      const index = question.answers.indexOf(question.correctAnswer);
      if (index >= 0) {
        positions[index]++;
        positioned++;
      }
    }
  }

  report.metric(
    'Right-answer position',
    positions.map((n, i) => `${'ABCD'[i]}:${percent(n, positioned)}`).join('  '),
    'even spread means position tells the student nothing'
  );

  if (positioned >= 20) {
    const worst = Math.max(...positions) / positioned;
    const least = Math.min(...positions) / positioned;
    const worstSlot = positions.indexOf(Math.max(...positions));

    // A single slot holding nearly everything is not bias, it is a shuffle
    // that never ran. Say so, and say where to look.
    const collapsed = worst > 0.9;
    const diagnosis = collapsed
      ? `\n\nThis is not bias, it is a shuffle that never moves anything. seededShuffle() in noteParser.ts draws its swap index with \`h = (h * 1103515245 + 12345) >>> 0\` and then \`j = h % (i + 1)\`. That multiply lands above 2^53, so the low bits of the product are lost to floating-point rounding and come back as zeros — \`j\` is therefore always 0. Fisher-Yates with j pinned to 0 is a rotation, and it deposits the first element (the correct answer, which is passed in first) in the last slot every single time.\n\nKeeping the low bits fixes it: \`h = (Math.imul(h, 1103515245) + 12345) >>> 0\`, or draw the index from the high bits with \`j = (h >>> 16) % (i + 1)\`. The same arithmetic appears in exam.ts → seed(), which survives only because it reads the high bits via \`h / 0x100000000\`.`
      : '';

    report.flagIf(
      worst > 0.45,
      collapsed ? 'high' : 'medium',
      collapsed
        ? 'The options are never shuffled — the answer is always in the last slot'
        : 'The right answer favours one position',
      `Slot ${'ABCD'[worstSlot]} holds the answer ${(worst * 100).toFixed(0)}% of the time across ${positioned} questions. Guessing that slot beats knowing the material.${diagnosis}`,
      undefined,
      collapsed ? 'src/lib/noteParser.ts → seededShuffle' : undefined
    );
    report.flagIf(
      least < 0.08 && worst <= 0.45,
      'low',
      'One position almost never holds the answer',
      `Slot ${'ABCD'[positions.indexOf(Math.min(...positions))]} is correct only ${(least * 100).toFixed(0)}% of the time, so it can be eliminated for free.`
    );
  }

  // --- 5. does output track input size at all? ---------------------------

  const counts = parsed.map((p) => p.questions.length);
  const lengths = parsed.map((p) => p.corpus.text.length);
  report.metric(
    'Questions per note set',
    parsed.map((p) => `${p.corpus.name}:${p.questions.length}`).join('  '),
    `input sizes ${Math.min(...lengths)}–${Math.max(...lengths)} chars`
  );
  report.flagIf(
    stdev(counts) === 0 && new Set(lengths).size > 1,
    'high',
    'Every note set produces exactly the same number of questions',
    'Different inputs of different lengths returning an identical question count is the signature of a fixed template rather than real extraction.'
  );

  // --- 6. repetition inside one note set ---------------------------------

  const internalRepeats: string[] = [];
  for (const { corpus, questions } of parsed) {
    const prompts = questions.map((q) => q.prompt.toLowerCase());
    if (new Set(prompts).size !== prompts.length) {
      internalRepeats.push(`${corpus.name}: duplicate prompts within one set`);
    }
    const answers = questions.map((q) => q.correctAnswer.toLowerCase());
    const frequency = new Map<string, number>();
    for (const answer of answers) frequency.set(answer, (frequency.get(answer) ?? 0) + 1);
    const repeated = [...frequency.entries()].filter(([, n]) => n > 1);
    if (repeated.length > 0) {
      internalRepeats.push(
        `${corpus.name}: same answer used by several questions — ${repeated
          .map(([a, n]) => `"${a}" ×${n}`)
          .join(', ')}`
      );
    }
  }
  report.flagIf(
    internalRepeats.length > 0,
    'low',
    'Repetition inside a single note set',
    'The same prompt or the same right answer coming round more than once in one quiz reads as padding.',
    internalRepeats
  );

  return report;
}
