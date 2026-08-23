/**
 * Mastery replaces "best score". It has to move: up with repeated correct
 * answers, down with misses, and downward again with neglect. A number
 * that sits still whatever the student does is worse than no number.
 */

import {
  WEAK_THRESHOLD,
  masteryLabel,
  questionMastery,
  subjectMastery,
  weakSpots,
  type AnswerRecord,
} from '../../src/lib/mastery';
import { Report } from '../report';
import { unique } from '../util';

const DAY_MS = 86_400_000;
const NOW = new Date(2026, 2, 2, 12, 0, 0).getTime();

function history(questionId: string, pattern: boolean[], endingDaysAgo = 0): AnswerRecord[] {
  return pattern.map((correct, i) => ({
    questionId,
    correct,
    answeredAt: NOW - (endingDaysAgo + (pattern.length - 1 - i)) * DAY_MS,
  }));
}

export function checkMastery(): Report {
  const report = new Report(
    'Mastery model',
    'Checks that the mastery number actually tracks how a student is doing: rising with repeated success, falling on a miss, fading with neglect, and never leaving 0–100.',
    'MAST'
  );

  const failures: string[] = [];
  const outOfRange: string[] = [];

  const scoreAfter = (pattern: boolean[], daysAgo = 0) =>
    questionMastery(history('q1', pattern, daysAgo), NOW).score;

  const oneCorrect = scoreAfter([true]);
  const threeCorrect = scoreAfter([true, true, true]);
  const sixCorrect = scoreAfter([true, true, true, true, true, true]);
  const allWrong = scoreAfter([false, false, false]);
  const recovered = scoreAfter([false, false, true, true]);
  const relapsed = scoreAfter([true, true, false]);
  const faded = scoreAfter([true, true, true], 30);

  if (!(threeCorrect > oneCorrect)) failures.push('three correct answers scored no better than one');
  if (!(sixCorrect > threeCorrect)) failures.push('six correct answers scored no better than three');
  if (allWrong !== 0) failures.push(`a question answered wrong every time scored ${allWrong.toFixed(3)}`);
  if (!(relapsed < threeCorrect)) failures.push('missing the most recent answer did not lower the score');
  if (!(recovered > allWrong)) failures.push('recovering after two misses did not raise the score');
  if (!(faded < threeCorrect)) failures.push('a month of neglect did not fade the score');

  for (const [name, value] of Object.entries({
    oneCorrect,
    threeCorrect,
    sixCorrect,
    allWrong,
    recovered,
    relapsed,
    faded,
  })) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      outOfRange.push(`${name} = ${value}`);
    }
  }

  // Order of the answer log must not matter — it is sorted internally.
  const log = history('q1', [true, false, true, true]);
  const shuffled = [log[2], log[0], log[3], log[1]];
  if (questionMastery(log, NOW).score !== questionMastery(shuffled, NOW).score) {
    failures.push('the same answers in a different order produced a different score');
  }

  // --- does the subject number move at all? ------------------------------

  const questionIds = ['d:0', 'd:1', 'd:2', 'd:3'];
  const profiles: Record<string, AnswerRecord[]> = {
    'never studied': [],
    'all wrong': questionIds.flatMap((id) => history(id, [false, false])),
    'half right': questionIds.flatMap((id, i) => history(id, i % 2 === 0 ? [true, true] : [false])),
    'all right once': questionIds.flatMap((id) => history(id, [true])),
    'drilled': questionIds.flatMap((id) => history(id, [true, true, true, true, true])),
    'drilled, then a month off': questionIds.flatMap((id) => history(id, [true, true, true, true, true], 30)),
  };

  const percents = Object.entries(profiles).map(([name, answers]) => ({
    name,
    percent: subjectMastery('d', 'Deck', questionIds, answers, NOW).percent,
  }));

  for (const row of percents) {
    if (!Number.isInteger(row.percent) || row.percent < 0 || row.percent > 100) {
      outOfRange.push(`${row.name} = ${row.percent}%`);
    }
  }

  const distinct = unique(percents.map((p) => p.percent)).length;

  // Unseen questions must dilute the number, or adding notes would look
  // like instant progress.
  const drilled = subjectMastery('d', 'Deck', questionIds, profiles.drilled, NOW).percent;
  const diluted = subjectMastery(
    'd',
    'Deck',
    [...questionIds, 'd:4', 'd:5', 'd:6', 'd:7'],
    profiles.drilled,
    NOW
  ).percent;
  if (!(diluted < drilled)) {
    failures.push('adding unanswered questions did not lower the subject percentage');
  }

  const weak = weakSpots(profiles['half right'], NOW);
  if (weak.some((w) => w.attempts === 0)) {
    failures.push('weakSpots included a question that was never answered');
  }
  if (weak.some((w, i) => i > 0 && w.score < weak[i - 1].score)) {
    failures.push('weakSpots is not sorted worst-first');
  }

  const labels = unique([0, 15, 30, 45, 60, 75, 85, 95, 100].map(masteryLabel));

  report.metric(
    'Subject percentage by study profile',
    percents.map((p) => `${p.name}:${p.percent}%`).join('  '),
    'these should be spread out, not clustered'
  );
  report.metric('Distinct percentages across profiles', `${distinct} of ${percents.length}`);
  report.metric('Question score after n correct answers', `1:${oneCorrect.toFixed(2)}  3:${threeCorrect.toFixed(2)}  6:${sixCorrect.toFixed(2)}`);
  report.metric('Labels used', labels.join(' → '));

  report.flagIf(
    failures.length > 0,
    'high',
    'Mastery does not respond to how the student is doing',
    'Each of these is a property the module documents about itself.',
    failures,
    'src/lib/mastery.ts'
  );

  report.flagIf(
    outOfRange.length > 0,
    'high',
    'Mastery value outside its stated range',
    'Question scores are 0–1 and subject percentages are whole numbers 0–100; anything else reaches the UI as a broken figure.',
    outOfRange,
    'src/lib/mastery.ts'
  );

  report.flagIf(
    distinct <= 2,
    'high',
    'Different study histories produce the same percentage',
    'Six very different profiles — never studied, all wrong, drilled — collapsed onto almost one number, so the figure cannot tell a student anything.',
    percents.map((p) => `${p.name}: ${p.percent}%`)
  );

  report.flagIf(
    oneCorrect < WEAK_THRESHOLD,
    'info',
    'One correct answer still counts as a weak spot',
    `A first correct answer scores ${oneCorrect.toFixed(2)}, below the ${WEAK_THRESHOLD} weak threshold, so a question answered correctly on the first try is still listed as something to drill. That is deliberate under the documented EMA, but it means a student who gets everything right first time sees a screen full of weak spots.`,
    undefined,
    'src/lib/mastery.ts → WEAK_THRESHOLD'
  );

  return report;
}
