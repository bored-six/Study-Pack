import { create } from 'zustand';

import {
  getDeckById,
  listAnswersForDeck,
  listQuestions,
  saveAnswers,
  saveAttempt,
  type AnswerInput,
} from '@/lib/db';
import { gradeDraft, hasAnswer, type DraftValue } from '@/lib/draft';
import {
  availability,
  buildExam,
  buildOnePerQuestion,
  type ExamFormat,
  type ExamItem,
  type ExamRequest,
} from '@/lib/exam';
import type { AnswerRecord } from '@/lib/mastery';
import {
  advanceQueue,
  DEFAULT_MODE,
  fullRequests,
  MODES,
  paperSeconds,
  startQueue,
  SURVIVAL_STRIKES,
  weakestQuestions,
  WEAK_SPOT_LIMIT,
  type ExamMode,
  type QueueEntry,
} from '@/lib/mode';
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
  /** This deck's answer history, for the modes that pick their own questions. */
  deckAnswers: AnswerRecord[];
  available: Record<ExamFormat, number>;
  /** How many of each format the student asked for. */
  counts: Record<ExamFormat, number>;
  mode: ExamMode;

  items: ExamItem[];
  /** Pointer for the modes that walk the paper in order. */
  index: number;
  /** Mastery's pile of items still to retire; head is the current one. */
  queue: QueueEntry[];
  retired: number;
  /** Survival misses so far. */
  strikes: number;
  /** Survival rounds drawn, so a repeat item still gets a fresh id. */
  round: number;
  /**
   * Bumped every time the current item changes, including when mastery
   * brings the same item back. Screens key on it to remount a clean answer.
   */
  visits: number;

  /** Answers in progress, by item id — exam simulation lets you return. */
  drafts: Record<string, DraftValue>;
  flagged: string[];

  results: ItemResult[];
  /** What gets written to the answers table, and so feeds mastery. */
  answerLog: AnswerInput[];
  /** Formats already introduced this sitting, so the card shows once. */
  briefed: ExamFormat[];
  startedAt: number;
  /** Wall-clock end for a whole-paper timer, or null when there isn't one. */
  paperDeadline: number | null;
  durationMs: number;
  error: string | null;

  load: (deckId: string) => Promise<void>;
  setMode: (mode: ExamMode) => void;
  setCount: (format: ExamFormat, count: number) => void;
  total: () => number;
  start: () => void;
  current: () => ExamItem | null;
  markBriefed: (format: ExamFormat) => void;
  setDraft: (itemId: string, value: DraftValue) => void;
  toggleFlag: (itemId: string) => void;
  goTo: (index: number) => void;
  /** Records the result for the current item and moves on. */
  answer: (correct: boolean, timedOut?: boolean) => Promise<'next' | 'finished'>;
  /** Grades every draft at once — how a withheld paper ends. */
  submitPaper: () => Promise<void>;
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

/**
 * One survival round. Rounds after the first carry a suffix so a repeated
 * item is still its own question as far as results and drafts are concerned.
 */
function survivalRound(questions: Question[], seedText: string, round: number): ExamItem[] {
  const built = buildExam(questions, fullRequests(questions), `${seedText}:r${round}`);
  return round === 0 ? built : built.map((item) => ({ ...item, id: `${item.id}#${round}` }));
}

function requestsFrom(counts: Record<ExamFormat, number>): ExamRequest[] {
  return (Object.keys(counts) as ExamFormat[])
    .filter((format) => counts[format] > 0)
    .map((format) => ({ format, count: counts[format] }));
}

const FRESH = {
  items: [] as ExamItem[],
  index: 0,
  queue: [] as QueueEntry[],
  retired: 0,
  strikes: 0,
  round: 0,
  visits: 0,
  drafts: {} as Record<string, DraftValue>,
  flagged: [] as string[],
  results: [] as ItemResult[],
  answerLog: [] as AnswerInput[],
  briefed: [] as ExamFormat[],
  paperDeadline: null as number | null,
};

export const useExamStore = create<ExamState>((set, get) => {
  /** Ends the sitting and writes it down. */
  const finishWith = async (results: ItemResult[], answerLog: AnswerInput[]) => {
    const { deck, startedAt } = get();
    const completedAt = Date.now();
    const durationMs = completedAt - startedAt;
    const score = results.filter((r) => r.correct).length;

    set({ results, answerLog, status: 'finished', durationMs, paperDeadline: null });
    if (!deck) return;

    const attemptId = await saveAttempt({
      deckId: deck.id,
      score,
      total: results.length,
      durationMs,
      completedAt,
    });
    // Which questions were missed is what mastery and weak spots read;
    // the score alone could never tell them apart.
    await saveAnswers(attemptId, deck.id, answerLog);
  };

  return {
    status: 'idle',
    deck: null,
    questions: [],
    deckAnswers: [],
    available: { ...ZERO },
    counts: { ...ZERO },
    mode: DEFAULT_MODE,
    ...FRESH,
    startedAt: 0,
    durationMs: 0,
    error: null,

    load: async (deckId) => {
      set({ status: 'loading', error: null, ...FRESH });
      try {
        const [deck, questions, deckAnswers] = await Promise.all([
          getDeckById(deckId),
          listQuestions(deckId),
          listAnswersForDeck(deckId),
        ]);
        if (!deck || questions.length === 0) {
          set({ status: 'error', error: 'This subject has no questions yet.' });
          return;
        }
        const available = availability(questions);
        // Open on a sensible default: everything as multiple choice.
        const counts = { ...ZERO, multiple_choice: Math.min(10, available.multiple_choice) };
        set({
          status: 'setup',
          deck,
          questions,
          deckAnswers,
          available,
          counts,
          mode: DEFAULT_MODE,
        });
      } catch (e) {
        set({
          status: 'error',
          error: e instanceof Error ? e.message : 'Could not open this subject',
        });
      }
    },

    setMode: (mode) => set({ mode }),

    setCount: (format, count) => {
      const { available } = get();
      const clamped = Math.max(0, Math.min(count, available[format]));
      set((s) => ({ counts: { ...s.counts, [format]: clamped } }));
    },

    total: () => Object.values(get().counts).reduce((sum, n) => sum + n, 0),

    start: () => {
      const { questions, counts, deck, mode, deckAnswers } = get();
      const spec = MODES[mode];
      const seedText = `${deck?.id ?? 'exam'}:${mode}:${Date.now()}`;

      let items: ExamItem[];
      if (mode === 'weak_spots') {
        items = buildOnePerQuestion(
          weakestQuestions(questions, deckAnswers, WEAK_SPOT_LIMIT),
          seedText
        );
      } else if (mode === 'survival') {
        items = survivalRound(questions, seedText, 0);
      } else {
        items = buildExam(questions, requestsFrom(counts), seedText);
      }

      if (items.length === 0) {
        set({ status: 'error', error: 'Could not build an exam from those choices.' });
        return;
      }

      const startedAt = Date.now();
      set({
        ...FRESH,
        status: 'active',
        items,
        queue: spec.repetition === 'until_retired' ? startQueue(items) : [],
        startedAt,
        paperDeadline:
          spec.clock === 'whole' ? startedAt + paperSeconds(items) * 1000 : null,
      });
    },

    current: () => {
      const { mode, items, index, queue } = get();
      if (MODES[mode].repetition === 'until_retired') {
        const head = queue[0];
        return head ? (items.find((item) => item.id === head.itemId) ?? null) : null;
      }
      return items[index] ?? null;
    },

    markBriefed: (format) => {
      set((s) => (s.briefed.includes(format) ? s : { briefed: [...s.briefed, format] }));
    },

    setDraft: (itemId, value) => set((s) => ({ drafts: { ...s.drafts, [itemId]: value } })),

    toggleFlag: (itemId) =>
      set((s) => ({
        flagged: s.flagged.includes(itemId)
          ? s.flagged.filter((id) => id !== itemId)
          : [...s.flagged, itemId],
      })),

    goTo: (index) =>
      set((s) => ({
        index: Math.max(0, Math.min(index, s.items.length - 1)),
        visits: s.visits + 1,
      })),

    answer: async (correct, timedOut = false) => {
      const state = get();
      const item = get().current();
      if (!item) return 'finished';

      const results = [...state.results, { itemId: item.id, format: item.format, correct }];
      // A question the clock took off you is not evidence about what you
      // know, so it scores as a miss but never reaches mastery.
      const answerLog = timedOut
        ? state.answerLog
        : [
            ...state.answerLog,
            { questionId: item.questionId, correct, answeredAt: Date.now() },
          ];

      const spec = MODES[state.mode];

      if (spec.repetition === 'until_retired') {
        const queue = advanceQueue(state.queue, correct);
        const retired = state.retired + (queue.length < state.queue.length ? 1 : 0);
        if (queue.length === 0) {
          set({ queue, retired });
          await finishWith(results, answerLog);
          return 'finished';
        }
        set({ results, answerLog, queue, retired, visits: state.visits + 1 });
        return 'next';
      }

      if (spec.repetition === 'until_out') {
        const strikes = state.strikes + (correct ? 0 : 1);
        if (strikes >= SURVIVAL_STRIKES) {
          set({ strikes });
          await finishWith(results, answerLog);
          return 'finished';
        }
        // Never let the deck run dry — draw another round and keep going.
        let items = state.items;
        let round = state.round;
        if (state.index + 1 >= items.length) {
          round += 1;
          items = [
            ...items,
            ...survivalRound(state.questions, `${state.deck?.id ?? 'exam'}:survival`, round),
          ];
        }
        set({
          results,
          answerLog,
          strikes,
          items,
          round,
          index: state.index + 1,
          visits: state.visits + 1,
        });
        return 'next';
      }

      if (state.index + 1 < state.items.length) {
        set({ results, answerLog, index: state.index + 1, visits: state.visits + 1 });
        return 'next';
      }

      await finishWith(results, answerLog);
      return 'finished';
    },

    submitPaper: async () => {
      const { items, drafts } = get();
      const now = Date.now();

      const results = items.map((item) => ({
        itemId: item.id,
        format: item.format,
        correct: gradeDraft(item, drafts[item.id] ?? null),
      }));
      // A blank scores as wrong, the same as on a real paper — but it says
      // nothing about what you know, so it stays out of mastery.
      const answerLog = items
        .filter((item) => hasAnswer(item, drafts[item.id] ?? null))
        .map((item) => ({
          questionId: item.questionId,
          correct: gradeDraft(item, drafts[item.id] ?? null),
          answeredAt: now,
        }));

      await finishWith(results, answerLog);
    },

    reset: () =>
      set({
        status: 'idle',
        deck: null,
        questions: [],
        deckAnswers: [],
        mode: DEFAULT_MODE,
        error: null,
        ...FRESH,
      }),
  };
});
