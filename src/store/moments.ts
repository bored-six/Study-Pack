import { create } from 'zustand';

import {
  listAnswers,
  listAttemptTimestamps,
  listQuestionIdsBySubject,
  listSchedules,
  readSetting,
  writeSetting,
  type AnswerInput,
} from '@/lib/db';
import { subjectMastery, weakSpots } from '@/lib/mastery';
import {
  appendMoment,
  detectMoment,
  type Moment,
  type MomentContext,
} from '@/lib/moments';
import { computeStreaks } from '@/lib/streak';

const LOG_KEY = 'moments_log';

/** A session counts as planned if it lands near a scheduled slot. */
const PLAN_REACH_MIN = 60;

interface RecordInput {
  deckId: string;
  deckName: string;
  score: number;
  total: number;
  completedAt: number;
  /** The answers just saved for this attempt. */
  answers: readonly AnswerInput[];
}

interface MomentsState {
  log: Moment[];
  /** The moment from the session just finished, shown once on results. */
  latest: Moment | null;
  refresh: () => Promise<void>;
  recordForAttempt: (input: RecordInput) => Promise<Moment | null>;
  clearLatest: () => void;
}

export const useMomentsStore = create<MomentsState>((set, get) => ({
  log: [],
  latest: null,

  refresh: async () => {
    set({ log: await readLog() });
  },

  recordForAttempt: async (input) => {
    try {
      const [allAnswers, timestamps, questionsBySubject, schedules, log] =
        await Promise.all([
          listAnswers(),
          listAttemptTimestamps(),
          listQuestionIdsBySubject(),
          listSchedules(),
          readLog(),
        ]);

      // Everything except what this session just added is the "before".
      const justNow = new Set(
        input.answers.map((a) => `${a.questionId}@${a.answeredAt}`)
      );
      const before = allAnswers.filter(
        (a) => !justNow.has(`${a.questionId}@${a.answeredAt}`)
      );

      const questionIds = questionsBySubject.get(input.deckId) ?? [];
      const deckBefore = before.filter((a) => a.deckId === input.deckId);
      const deckAfter = allAnswers.filter((a) => a.deckId === input.deckId);

      const masteryBefore = questionIds.length
        ? subjectMastery(input.deckId, input.deckName, questionIds, deckBefore, input.completedAt)
            .percent
        : null;
      const masteryAfter = questionIds.length
        ? subjectMastery(input.deckId, input.deckName, questionIds, deckAfter, input.completedAt)
            .percent
        : null;

      const weakBefore = new Set(
        weakSpots(deckBefore, input.completedAt).map((spot) => spot.questionId)
      );
      const weakAfter = new Set(
        weakSpots(deckAfter, input.completedAt).map((spot) => spot.questionId)
      );
      const weakFixed = [...weakBefore].filter((id) => !weakAfter.has(id)).length;

      const priorTimestamps = timestamps.filter((t) => t !== input.completedAt);
      const previousStreak = computeStreaks(priorTimestamps, input.completedAt).current;
      const streak = computeStreaks(timestamps, input.completedAt).current;

      const lastStudied = priorTimestamps.length ? Math.max(...priorTimestamps) : null;
      const daysSinceLastStudy =
        lastStudied == null
          ? null
          : Math.floor((input.completedAt - lastStudied) / 86_400_000);

      const finished = new Date(input.completedAt);
      const minutesOfDay = finished.getHours() * 60 + finished.getMinutes();
      const keptPlan = schedules.some(
        (schedule) =>
          schedule.enabled &&
          schedule.deckId === input.deckId &&
          Math.abs(schedule.timeOfDay - minutesOfDay) <= PLAN_REACH_MIN
      );

      const context: MomentContext = {
        now: input.completedAt,
        hourOfDay: finished.getHours(),
        streak,
        previousStreak,
        totalAttempts: timestamps.length,
        daysSinceLastStudy,
        score: input.score,
        total: input.total,
        deckId: input.deckId,
        deckName: input.deckName,
        masteryBefore,
        masteryAfter,
        weakFixed,
        keptPlan,
      };

      const moment = detectMoment(
        context,
        log.map((entry) => entry.id)
      );
      if (!moment) {
        set({ latest: null, log });
        return null;
      }

      const next = appendMoment(log, moment);
      await writeSetting(LOG_KEY, JSON.stringify(next));
      set({ latest: moment, log: next });
      return moment;
    } catch (e) {
      // A missed moment must never cost someone their quiz result.
      console.warn('Could not record moment', e);
      set({ latest: null });
      return null;
    }
  },

  clearLatest: () => set({ latest: null }),
}));

async function readLog(): Promise<Moment[]> {
  try {
    const raw = await readSetting(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Moment[]) : [];
  } catch {
    return [];
  }
}
