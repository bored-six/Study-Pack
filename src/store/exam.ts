import { create } from 'zustand';

import { getDeckById, listQuestions, saveAttempt } from '@/lib/db';
import {
  availability,
  buildExam,
  type ExamFormat,
  type ExamItem,
  type ExamRequest,
} from '@/lib/exam';
import type { Deck, Question } from '@/lib/types';

export type ExamStatus = 'idle' | 'loading' | 'setup' | 'active' | 'finished' | 'error';

export interface ItemResult {
  itemId: string;
  format: ExamFormat;
  correct: boolean;
}

interface ExamState {
  status: ExamStatus;
  deck: Deck | null;
  questions: Question[];
  available: Record<ExamFormat, number>;
  /** How many of each format the student asked for. */
  counts: Record<ExamFormat, number>;
  items: ExamItem[];
  index: number;
  results: ItemResult[];
  /** Formats already introduced this sitting, so the card shows once. */
  briefed: ExamFormat[];
  startedAt: number;
  durationMs: number;
  error: string | null;

  load: (deckId: string) => Promise<void>;
  setCount: (format: ExamFormat, count: number) => void;
  total: () => number;
  start: () => void;
  markBriefed: (format: ExamFormat) => void;
  /** Records the result for the current item and moves on. */
  submit: (correct: boolean) => Promise<'next' | 'finished'>;
  reset: () => void;
}

const ZERO: Record<ExamFormat, number> = {
  multiple_choice: 0,
  true_false: 0,
  modified_true_false: 0,
  identification: 0,
  fill_blank: 0,
  matching: 0,
  enumeration: 0,
};

export const useExamStore = create<ExamState>((set, get) => ({
  status: 'idle',
  deck: null,
  questions: [],
  available: { ...ZERO },
  counts: { ...ZERO },
  items: [],
  index: 0,
  results: [],
  briefed: [],
  startedAt: 0,
  durationMs: 0,
  error: null,

  load: async (deckId) => {
    set({ status: 'loading', error: null, items: [], results: [], index: 0, briefed: [] });
    try {
      const [deck, questions] = await Promise.all([getDeckById(deckId), listQuestions(deckId)]);
      if (!deck || questions.length === 0) {
        set({ status: 'error', error: 'This subject has no questions yet.' });
        return;
      }
      const available = availability(questions);
      // Open on a sensible default: everything as multiple choice.
      const counts = { ...ZERO, multiple_choice: Math.min(10, available.multiple_choice) };
      set({ status: 'setup', deck, questions, available, counts });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : 'Could not open this subject',
      });
    }
  },

  setCount: (format, count) => {
    const { available } = get();
    const clamped = Math.max(0, Math.min(count, available[format]));
    set((s) => ({ counts: { ...s.counts, [format]: clamped } }));
  },

  total: () => Object.values(get().counts).reduce((sum, n) => sum + n, 0),

  start: () => {
    const { questions, counts, deck } = get();
    const requests: ExamRequest[] = (Object.keys(counts) as ExamFormat[])
      .filter((format) => counts[format] > 0)
      .map((format) => ({ format, count: counts[format] }));

    const items = buildExam(questions, requests, `${deck?.id ?? 'exam'}:${Date.now()}`);
    if (items.length === 0) {
      set({ status: 'error', error: 'Could not build an exam from those choices.' });
      return;
    }
    set({ status: 'active', items, index: 0, results: [], briefed: [], startedAt: Date.now() });
  },

  markBriefed: (format) => {
    set((s) => (s.briefed.includes(format) ? s : { briefed: [...s.briefed, format] }));
  },

  submit: async (correct) => {
    const { items, index, results, deck, startedAt } = get();
    const item = items[index];
    if (!item) return 'finished';

    const nextResults = [...results, { itemId: item.id, format: item.format, correct }];

    if (index + 1 < items.length) {
      set({ results: nextResults, index: index + 1 });
      return 'next';
    }

    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;
    const score = nextResults.filter((r) => r.correct).length;
    set({ results: nextResults, status: 'finished', durationMs });

    if (deck) {
      await saveAttempt({
        deckId: deck.id,
        score,
        total: nextResults.length,
        durationMs,
        completedAt,
      });
    }
    return 'finished';
  },

  reset: () =>
    set({
      status: 'idle',
      deck: null,
      questions: [],
      items: [],
      results: [],
      index: 0,
      briefed: [],
      error: null,
    }),
}));
