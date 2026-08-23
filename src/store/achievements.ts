import { create } from 'zustand';

import {
  detectUnlocks,
  type AchievementContext,
  type Unlock,
} from '@/lib/achievements';
import {
  listAnswers,
  listAttempts,
  listAttemptTimestamps,
  listDecks,
  listQuestionIdsBySubject,
  listSchedules,
  readSetting,
  writeSetting,
} from '@/lib/db';
import { subjectMastery, weakSpots } from '@/lib/mastery';
import { computeStreaks } from '@/lib/streak';

const UNLOCKS_KEY = 'achievements_unlocked';
const PLANS_KEPT_KEY = 'plans_kept_total';
const PLAN_REACH_MIN = 60;

interface AttemptInput {
  deckId: string;
  score: number;
  total: number;
  completedAt: number;
}

interface AchievementsState {
  unlocked: Unlock[];
  /** Unlocks from the session just finished, awaiting their reveal. */
  pending: Unlock[];
  refresh: () => Promise<void>;
  checkAfterAttempt: (input: AttemptInput) => Promise<Unlock[]>;
  clearPending: () => void;
}

export const useAchievementsStore = create<AchievementsState>((set, get) => ({
  unlocked: [],
  pending: [],

  refresh: async () => {
    set({ unlocked: await readUnlocks() });
  },

  checkAfterAttempt: async (input) => {
    try {
      const [timestamps, answers, questionsBySubject, subjects, schedules, attempts, unlocked] =
        await Promise.all([
          listAttemptTimestamps(),
          listAnswers(),
          listQuestionIdsBySubject(),
          listDecks('notes'),
          listSchedules(),
          listAttempts(500),
          readUnlocks(),
        ]);

      const now = input.completedAt;
      const finished = new Date(now);
      const dayOf = (t: number) => {
        const d = new Date(t);
        return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
      };
      const today = dayOf(now);

      const subjectPercents = subjects
        .map((deck) => {
          const ids = questionsBySubject.get(deck.id) ?? [];
          if (ids.length === 0) return null;
          return subjectMastery(
            deck.id,
            deck.name,
            ids,
            answers.filter((a) => a.deckId === deck.id),
            now
          ).percent;
        })
        .filter((p): p is number => p != null);

      // Did this session leave a formerly-troubled subject with no weak
      // questions? "Formerly troubled" means 3+ weak before it.
      const deckAnswers = answers.filter((a) => a.deckId === input.deckId);
      const sessionStart = now - 1;
      const before = deckAnswers.filter((a) => dayOf(a.answeredAt) !== today || a.answeredAt < sessionStart - 30 * 60_000);
      const weakBefore = weakSpots(before, now).length;
      const weakAfter = weakSpots(deckAnswers, now).length;
      const clearedWeakSubject = weakBefore >= 3 && weakAfter === 0;

      const prior = timestamps.filter((t) => t !== now);
      const lastStudied = prior.length ? Math.max(...prior) : null;

      const minutesOfDay = finished.getHours() * 60 + finished.getMinutes();
      const keptPlan = schedules.some(
        (s) =>
          s.enabled &&
          s.deckId === input.deckId &&
          Math.abs(s.timeOfDay - minutesOfDay) <= PLAN_REACH_MIN
      );

      let plansKeptTotal = Number((await readSetting(PLANS_KEPT_KEY)) ?? '0');
      if (keptPlan) {
        plansKeptTotal += 1;
        await writeSetting(PLANS_KEPT_KEY, String(plansKeptTotal));
      }

      // This weekend: does the current Sat/Sun pair both hold sessions?
      const dow = finished.getDay();
      const saturday = today - ((dow + 1) % 7);
      const days = new Set(timestamps.map(dayOf));
      const weekendPair = days.has(saturday) && days.has(saturday + 1);

      const context: AchievementContext = {
        now,
        hourOfDay: finished.getHours(),
        streak: computeStreaks(timestamps, now).current,
        totalAttempts: timestamps.length,
        totalAnswers: answers.length,
        subjectPercents,
        subjectCount: subjects.length,
        perfectRounds: attempts.filter((a) => a.total >= 5 && a.score === a.total).length,
        distinctStudyDays: days.size,
        attemptsToday: timestamps.filter((t) => dayOf(t) === today).length,
        daysSinceLastStudy:
          lastStudied == null ? null : Math.floor((now - lastStudied) / 86_400_000),
        weekendPair,
        keptPlan,
        plansKeptTotal,
        clearedWeakSubject,
        score: input.score,
        total: input.total,
      };

      const fresh = detectUnlocks(context, unlocked);
      if (fresh.length === 0) {
        set({ pending: [], unlocked });
        return [];
      }

      const next = [...unlocked, ...fresh];
      await writeSetting(UNLOCKS_KEY, JSON.stringify(next));
      set({ pending: fresh, unlocked: next });
      return fresh;
    } catch (e) {
      // Achievements must never cost anyone their quiz result.
      console.warn('Could not check achievements', e);
      set({ pending: [] });
      return [];
    }
  },

  clearPending: () => set({ pending: [] }),
}));

async function readUnlocks(): Promise<Unlock[]> {
  try {
    const raw = await readSetting(UNLOCKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Unlock[]) : [];
  } catch {
    return [];
  }
}
