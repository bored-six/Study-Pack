import { create } from 'zustand';

import {
  listAnswers,
  listAttempts,
  listAttemptTimestamps,
  listDecks,
  listQuestionIdsBySubject,
  type AttemptWithDeck,
} from '@/lib/db';
import { subjectMastery, weakSpots, type SubjectMastery } from '@/lib/mastery';
import { computeStreaks } from '@/lib/streak';

interface ProgressState {
  attempts: AttemptWithDeck[];
  totalAttempts: number;
  /** One row per subject, strongest first. */
  subjects: SubjectMastery[];
  /** Questions seen but still shaky, across every subject. */
  weakCount: number;
  currentStreak: number;
  longestStreak: number;
  /** Rounds taken per local calendar day, keyed 'YYYY-MM-DD'. */
  dayCounts: Record<string, number>;
  /** Every answer recorded, for the running total. */
  totalAnswers: number;
  status: 'idle' | 'loading' | 'ready';
  refresh: () => Promise<void>;
}

/** Local calendar day key — the grid must match the user's own midnight. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  attempts: [],
  totalAttempts: 0,
  subjects: [],
  weakCount: 0,
  currentStreak: 0,
  longestStreak: 0,
  dayCounts: {},
  totalAnswers: 0,
  status: 'idle',

  refresh: async () => {
    if (get().status === 'idle') set({ status: 'loading' });
    try {
      const [attempts, timestamps, answers, questionsBySubject, subjectDecks] =
        await Promise.all([
          listAttempts(50),
          listAttemptTimestamps(),
          listAnswers(),
          listQuestionIdsBySubject(),
          listDecks('notes'),
        ]);

      const now = Date.now();
      const subjects = subjectDecks
        .map((deck) =>
          subjectMastery(
            deck.id,
            deck.name,
            questionsBySubject.get(deck.id) ?? [],
            answers.filter((answer) => answer.deckId === deck.id),
            now
          )
        )
        .filter((subject) => subject.questionCount > 0)
        .sort((a, b) => b.percent - a.percent);

      const { current, longest } = computeStreaks(timestamps);

      const dayCounts: Record<string, number> = {};
      for (const timestamp of timestamps) {
        const key = dayKey(timestamp);
        dayCounts[key] = (dayCounts[key] ?? 0) + 1;
      }

      set({
        attempts,
        totalAttempts: timestamps.length,
        subjects,
        weakCount: weakSpots(answers, now).length,
        currentStreak: current,
        longestStreak: longest,
        dayCounts,
        totalAnswers: answers.length,
        status: 'ready',
      });
    } catch (e) {
      console.warn('Progress refresh failed', e);
      set({ status: 'ready' });
    }
  },
}));
