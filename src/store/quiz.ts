import { create } from 'zustand';

import {
  getDeckById,
  listQuestions,
  saveAnswers,
  saveAttempt,
  type AnswerInput,
} from '@/lib/db';
import { retireSessionForDeck } from '@/lib/notifications';
import { useMomentsStore } from '@/store/moments';
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
  /** Per-question results for this run; persisted with the attempt. */
  answers: AnswerInput[];
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
  answers: [],
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
      answers: [],
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
    const question = questions[index];
    const correct = question.correctAnswer === answer;
    set((s) => ({
      selected: answer,
      score: correct ? s.score + 1 : s.score,
      answers: [
        ...s.answers,
        { questionId: question.id, correct, answeredAt: Date.now() },
      ],
    }));
  },

  advance: async () => {
    const { status, index, questions, selected } = get();
    if (status !== 'active' || selected == null) return 'question';
    if (index + 1 < questions.length) {
      set({ index: index + 1, selected: null });
      return 'question';
    }
    const { deck, score, startedAt, answers } = get();
    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;
    set({ status: 'finished', durationMs });
    if (deck) {
      const attemptId = await saveAttempt({
        deckId: deck.id,
        score,
        total: questions.length,
        durationMs,
        completedAt,
      });
      // Which questions were missed is what mastery and weak spots read;
      // the score alone could never tell them apart.
      await saveAnswers(attemptId, deck.id, answers);

      // Work out whether anything about this session was worth saying out
      // loud. Usually the answer is no, and that is what keeps the times
      // it says something worth reading.
      await useMomentsStore.getState().recordForAttempt({
        deckId: deck.id,
        deckName: deck.name,
        score,
        total: questions.length,
        completedAt,
        answers,
      });
      // Stop any reminder still pending for the sitting this deck was
      // planned in — finishing early must not earn you a nag.
      await retireSessionForDeck(deck.id, completedAt);
    }
    return 'finished';
  },
}));
