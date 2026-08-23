import { create } from 'zustand';

import { getDeckById, listQuestions, saveAttempt } from '@/lib/db';
import type { Deck, Question } from '@/lib/types';

type QuizStatus = 'idle' | 'loading' | 'active' | 'finished' | 'error';

interface QuizState {
  status: QuizStatus;
  deck: Deck | null;
  questions: Question[];
  index: number;
  /** The answer picked for the current question; null until answered. */
  selected: string | null;
  score: number;
  startedAt: number;
  durationMs: number;
  error: string | null;
  /** Loads a downloaded deck from sqlite. Never touches the network. */
  start: (deckId: string) => Promise<void>;
  choose: (answer: string) => void;
  /** Moves to the next question, or saves the attempt and finishes. */
  advance: () => Promise<'question' | 'finished'>;
}

export const useQuizStore = create<QuizState>((set, get) => ({
  status: 'idle',
  deck: null,
  questions: [],
  index: 0,
  selected: null,
  score: 0,
  startedAt: 0,
  durationMs: 0,
  error: null,

  start: async (deckId) => {
    set({
      status: 'loading',
      deck: null,
      questions: [],
      index: 0,
      selected: null,
      score: 0,
      durationMs: 0,
      error: null,
    });
    try {
      const deck = await getDeckById(deckId);
      const questions = await listQuestions(deckId);
      if (!deck || deck.downloadedAt == null || questions.length === 0) {
        set({ status: 'error', error: 'This deck is not downloaded on this device.' });
        return;
      }
      set({ status: 'active', deck, questions, startedAt: Date.now() });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Could not load the quiz',
      });
    }
  },

  choose: (answer) => {
    const { status, selected, questions, index } = get();
    if (status !== 'active' || selected != null) return;
    const correct = questions[index].correctAnswer === answer;
    set((s) => ({ selected: answer, score: correct ? s.score + 1 : s.score }));
  },

  advance: async () => {
    const { status, index, questions, selected } = get();
    if (status !== 'active' || selected == null) return 'question';
    if (index + 1 < questions.length) {
      set({ index: index + 1, selected: null });
      return 'question';
    }
    const { deck, score, startedAt } = get();
    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;
    set({ status: 'finished', durationMs });
    if (deck) {
      await saveAttempt({
        deckId: deck.id,
        score,
        total: questions.length,
        durationMs,
        completedAt,
      });
    }
    return 'finished';
  },
}));
