import { create } from 'zustand';

import {
  getBestScoreRatio,
  listAttempts,
  listAttemptTimestamps,
  type AttemptWithDeck,
} from '@/lib/db';
import { computeStreaks } from '@/lib/streak';

interface ProgressState {
  attempts: AttemptWithDeck[];
  totalAttempts: number;
  bestPct: number | null;
  currentStreak: number;
  longestStreak: number;
  status: 'idle' | 'loading' | 'ready';
  refresh: () => Promise<void>;
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  attempts: [],
  totalAttempts: 0,
  bestPct: null,
  currentStreak: 0,
  longestStreak: 0,
  status: 'idle',

  refresh: async () => {
    if (get().status === 'idle') set({ status: 'loading' });
    try {
      const [attempts, timestamps, bestRatio] = await Promise.all([
        listAttempts(50),
        listAttemptTimestamps(),
        getBestScoreRatio(),
      ]);
      const { current, longest } = computeStreaks(timestamps);
      set({
        attempts,
        totalAttempts: timestamps.length,
        bestPct: bestRatio == null ? null : Math.round(bestRatio * 100),
        currentStreak: current,
        longestStreak: longest,
        status: 'ready',
      });
    } catch (e) {
      console.warn('Progress refresh failed', e);
      set({ status: 'ready' });
    }
  },
}));
