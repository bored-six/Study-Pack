/**
 * Mastery: how well a subject is actually known, from the history of
 * individual answers. Pure functions over answer records — no I/O — so the
 * model is testable and identical wherever it runs.
 *
 * This replaces "best score", which froze at your luckiest moment and then
 * never moved again. Mastery rises with repeated correct answers, falls
 * when you miss, and fades slowly if you never revisit — so the number
 * tracks what you know now rather than what you once got right.
 */

/** One answer to one question, as recorded during a quiz. */
export interface AnswerRecord {
  questionId: string;
  correct: boolean;
  answeredAt: number;
}

export interface QuestionMastery {
  questionId: string;
  /** 0–1, already faded for time since the last answer. */
  score: number;
  attempts: number;
  lastAnsweredAt: number | null;
  /** True when the most recent answer was wrong. */
  missedLast: boolean;
}

export interface SubjectMastery {
  deckId: string;
  deckName: string;
  /** 0–100, rounded — the number shown to the student. */
  percent: number;
  questionCount: number;
  /** Questions never answered even once. */
  unseen: number;
  weak: number;
}

/**
 * Weight of the newest answer in the running average. 0.4 means one
 * correct answer earns 40%, two earn 64%, five earn ~92% — you have to be
 * right repeatedly to approach mastery, and a single lucky guess is
 * visibly not enough.
 */
const ALPHA = 0.4;

/** Knowledge fades this far, and no further — you never forget everything. */
const FADE_FLOOR = 0.45;

/** Days of neglect that take a question all the way down to the floor. */
const FADE_DAYS = 50;

const DAY_MS = 86_400_000;

/** Below this a question counts as a weak spot worth drilling. */
export const WEAK_THRESHOLD = 0.5;

function fade(lastAnsweredAt: number, now: number): number {
  const days = Math.max(0, (now - lastAnsweredAt) / DAY_MS);
  return Math.max(FADE_FLOOR, 1 - days / FADE_DAYS);
}

/**
 * Exponential moving average over a question's answers, oldest first,
 * then faded by how long ago the last one was.
 */
export function questionMastery(
  answers: readonly AnswerRecord[],
  now = Date.now()
): QuestionMastery {
  const questionId = answers[0]?.questionId ?? '';
  if (answers.length === 0) {
    return { questionId, score: 0, attempts: 0, lastAnsweredAt: null, missedLast: false };
  }

  const ordered = [...answers].sort((a, b) => a.answeredAt - b.answeredAt);
  let ema = 0;
  for (const answer of ordered) {
    ema = ema + ALPHA * ((answer.correct ? 1 : 0) - ema);
  }

  const last = ordered[ordered.length - 1];
  return {
    questionId,
    score: ema * fade(last.answeredAt, now),
    attempts: ordered.length,
    lastAnsweredAt: last.answeredAt,
    missedLast: !last.correct,
  };
}

/** Groups a flat answer log by question. */
export function byQuestion(
  answers: readonly AnswerRecord[]
): Map<string, AnswerRecord[]> {
  const map = new Map<string, AnswerRecord[]>();
  for (const answer of answers) {
    const list = map.get(answer.questionId);
    if (list) list.push(answer);
    else map.set(answer.questionId, [answer]);
  }
  return map;
}

/**
 * A subject's mastery is the mean across *every* question in it, including
 * ones never seen. Adding new notes therefore lowers the percentage, which
 * is the honest result: you now have more to learn.
 */
export function subjectMastery(
  deckId: string,
  deckName: string,
  questionIds: readonly string[],
  answers: readonly AnswerRecord[],
  now = Date.now()
): SubjectMastery {
  const grouped = byQuestion(answers);

  let total = 0;
  let unseen = 0;
  let weak = 0;

  for (const questionId of questionIds) {
    const history = grouped.get(questionId) ?? [];
    const mastery = questionMastery(history, now);
    total += mastery.score;
    if (mastery.attempts === 0) unseen++;
    else if (mastery.score < WEAK_THRESHOLD) weak++;
  }

  const percent =
    questionIds.length === 0 ? 0 : Math.round((total / questionIds.length) * 100);

  return { deckId, deckName, percent, questionCount: questionIds.length, unseen, weak };
}

/**
 * Questions worth drilling: seen at least once, still below the threshold.
 * Worst first, so a short drill hits the most painful ones.
 */
export function weakSpots(
  answers: readonly AnswerRecord[],
  now = Date.now()
): QuestionMastery[] {
  return [...byQuestion(answers).values()]
    .map((history) => questionMastery(history, now))
    .filter((mastery) => mastery.attempts > 0 && mastery.score < WEAK_THRESHOLD)
    .sort((a, b) => a.score - b.score);
}

/** Plain-language band for a percentage, so the number has a meaning. */
export function masteryLabel(percent: number): string {
  if (percent >= 85) return 'Solid';
  if (percent >= 60) return 'Getting there';
  if (percent >= 30) return 'Shaky';
  return 'Just started';
}
