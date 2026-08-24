import { create } from 'zustand';

import {
  getDeckById,
  listAnswersForDeck,
  listQuestions,
  saveAnswers,
  saveAttempt,
  type AnswerInput,
} from '@/lib/db';
import { classifyMiss, type SlipKind } from '@/lib/debrief';
import { gradeDraft, hasAnswer, type DraftValue } from '@/lib/draft';
import {
  availability,
  buildExam,
  capacityFor,
  emptyCounts,
  FORMAT_ORDER,
  spreadCounts,
  totalOf,
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
  type ExamMode,
  type QueueEntry,
} from '@/lib/mode';
import { clearSnapshot, readSnapshot, saveSnapshot } from '@/lib/resume';
import {
  firstSetup,
  FIRST_TARGET,
  readSavedSetup,
  saveSetup,
  trimSetup,
} from '@/lib/setup';
import type { Deck, Question } from '@/lib/types';

export type ExamStatus = 'idle' | 'loading' | 'setup' | 'active' | 'finished' | 'error';

export interface ItemResult {
  itemId: string;
  format: ExamFormat;
  correct: boolean;
  /**
   * How the mark was lost, or null when it wasn't. Worked out here rather
   * than at the end because a mastery sitting asks the same question again
   * until it's right, and by then the draft that missed is long overwritten.
   */
  slip: SlipKind | null;
  /** What was put down for this answer, kept for the same reason. */
  draft: DraftValue | null;
}

interface ExamState {
  status: ExamStatus;
  deck: Deck | null;
  questions: Question[];
  /** This deck's answer history, for the modes that pick their own questions. */
  deckAnswers: AnswerRecord[];
  available: Record<ExamFormat, number>;
  /** How many of each format the paper will hold. */
  counts: Record<ExamFormat, number>;
  /** The formats the student ticked. */
  picks: ExamFormat[];
  /** How many questions they asked for altogether, before the notes get a say. */
  target: number;
  /** True once the per-format amounts were typed by hand; `counts` then rules. */
  custom: boolean;
  mode: ExamMode;
  /** The mode this subject was last sat in, so the picker can point at it. */
  lastMode: ExamMode | null;

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
  /** Ticks or unticks a format, re-spreading the same total over what's left. */
  toggleFormat: (format: ExamFormat) => void;
  /** Asks for this many questions, spread across the ticked formats. */
  setTarget: (total: number) => void;
  /** Throws the whole paper at one format — how a results drill arrives. */
  setOnly: (format: ExamFormat, count: number) => void;
  /** The most questions the ticked formats can produce between them. */
  capacity: () => number;
  /** Sets one format's amount exactly, which is what `custom` means. */
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
  /** Picks an interrupted sitting back up, if there is one worth resuming. */
  resume: () => Promise<boolean>;
  reset: () => void;
}

/**
 * One survival round. Rounds after the first carry a suffix so a repeated
 * item is still its own question as far as results and drafts are concerned.
 */
function survivalRound(
  questions: Question[],
  history: readonly AnswerRecord[],
  seedText: string,
  round: number
): ExamItem[] {
  const built = buildExam(questions, fullRequests(questions), `${seedText}:r${round}`, history);
  return round === 0 ? built : built.map((item) => ({ ...item, id: `${item.id}#${round}` }));
}

function requestsFrom(counts: Record<ExamFormat, number>): ExamRequest[] {
  return FORMAT_ORDER.filter((format) => counts[format] > 0).map((format) => ({
    format,
    count: counts[format],
  }));
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
    // The paper is done; a leftover snapshot would offer to resume it.
    await clearSnapshot();
    if (!deck) return;

    const attemptId = await saveAttempt({
      deckId: deck.id,
      score,
      total: results.length,
      durationMs,
      completedAt,
    });
    // Which questions were missed is what mastery and the need-weighted
    // picker read; the score alone could never tell them apart.
    await saveAnswers(attemptId, deck.id, answerLog);
  };

  /**
   * Writes the sitting down mid-flight. Everything the student has actually
   * done lives here; the deck and question list are re-read on resume rather
   * than stored twice.
   */
  const checkpoint = () => {
    const s = get();
    if (s.status !== 'active' || !s.deck) return;
    void saveSnapshot(s.deck.id, s.deck.name, {
      mode: s.mode,
      items: s.items,
      index: s.index,
      queue: s.queue,
      retired: s.retired,
      strikes: s.strikes,
      round: s.round,
      visits: s.visits,
      drafts: s.drafts,
      flagged: s.flagged,
      results: s.results,
      answerLog: s.answerLog,
      briefed: s.briefed,
      startedAt: s.startedAt,
      paperDeadline: s.paperDeadline,
    });
  };

  return {
    status: 'idle',
    deck: null,
    questions: [],
    deckAnswers: [],
    available: emptyCounts(),
    counts: emptyCounts(),
    picks: [],
    target: FIRST_TARGET,
    custom: false,
    mode: DEFAULT_MODE,
    lastMode: null,
    ...FRESH,
    startedAt: 0,
    durationMs: 0,
    error: null,

    load: async (deckId) => {
      set({ status: 'loading', error: null, ...FRESH });
      try {
        const [deck, questions, deckAnswers, saved] = await Promise.all([
          getDeckById(deckId),
          listQuestions(deckId),
          listAnswersForDeck(deckId),
          readSavedSetup(deckId),
        ]);
        if (!deck || questions.length === 0) {
          set({ status: 'error', error: 'This subject has no questions yet.' });
          return;
        }
        const available = availability(questions);
        // Open on the paper they sat last time, as far as the notes still allow.
        const remembered = trimSetup(saved, available);
        const setup = remembered ?? firstSetup(available);
        set({
          status: 'setup',
          deck,
          questions,
          deckAnswers,
          available,
          counts: setup.counts,
          picks: setup.picks,
          target: setup.target,
          custom: setup.custom,
          mode: setup.mode,
          lastMode: remembered?.mode ?? null,
        });
      } catch (e) {
        set({
          status: 'error',
          error: e instanceof Error ? e.message : 'Could not open this subject',
        });
      }
    },

    setMode: (mode) => set({ mode }),

    toggleFormat: (format) => {
      const { available, picks, target, custom, counts } = get();
      if (available[format] === 0) return;
      const next = picks.includes(format)
        ? picks.filter((pick) => pick !== format)
        : FORMAT_ORDER.filter((pick) => pick === format || picks.includes(pick));
      // The number on screen carries over, hand-set or not: ticking a type
      // changes what you're asked, not how long you're sat there. The floor
      // keeps every ticked type worth at least one question.
      const wanted = Math.max(next.length, custom ? totalOf(counts) : target);
      set({
        picks: next,
        target: wanted,
        custom: false,
        counts: spreadCounts(next, wanted, available),
      });
    },

    setTarget: (wanted) => {
      const { available, picks } = get();
      const target = Math.max(picks.length, Math.trunc(wanted) || 0);
      set({ target, custom: false, counts: spreadCounts(picks, target, available) });
    },

    setOnly: (format, count) => {
      const { available } = get();
      const counts = emptyCounts();
      counts[format] = Math.max(0, Math.min(count, available[format]));
      set({
        counts,
        picks: counts[format] > 0 ? [format] : [],
        target: counts[format],
        custom: false,
      });
    },

    capacity: () => capacityFor(get().picks, get().available),

    setCount: (format, count) => {
      const { available, counts } = get();
      const clamped = Math.max(0, Math.min(count, available[format]));
      const next = { ...counts, [format]: clamped };
      set({
        counts: next,
        custom: true,
        picks: FORMAT_ORDER.filter((pick) => next[pick] > 0),
        target: totalOf(next),
      });
    },

    total: () => totalOf(get().counts),

    start: () => {
      const { questions, counts, deck, mode, deckAnswers, picks, target, custom } = get();
      const spec = MODES[mode];
      const seedText = `${deck?.id ?? 'exam'}:${mode}:${Date.now()}`;

      let items: ExamItem[];
      if (mode === 'survival') {
        items = survivalRound(questions, deckAnswers, seedText, 0);
      } else {
        // The answer log decides which of the deck's questions fill the
        // request — the shaky and the unseen first. See lib/pick.ts.
        items = buildExam(questions, requestsFrom(counts), seedText, deckAnswers);
      }

      if (items.length === 0) {
        set({ status: 'error', error: 'Could not build an exam from those choices.' });
        return;
      }

      // Remembered so the next sitting on this subject opens on this paper.
      if (deck) void saveSetup(deck.id, { mode, picks, target, custom, counts });

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
      checkpoint();
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

    setDraft: (itemId, value) => {
      set((s) => ({ drafts: { ...s.drafts, [itemId]: value } }));
      checkpoint();
    },

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

      const draft = state.drafts[item.id] ?? null;
      const results = [
        ...state.results,
        {
          itemId: item.id,
          format: item.format,
          correct,
          slip: correct ? null : classifyMiss(item, draft, timedOut),
          draft,
        },
      ];
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
        checkpoint();
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
            ...survivalRound(
              state.questions,
              state.deckAnswers,
              `${state.deck?.id ?? 'exam'}:survival`,
              round
            ),
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
        checkpoint();
        return 'next';
      }

      if (state.index + 1 < state.items.length) {
        set({ results, answerLog, index: state.index + 1, visits: state.visits + 1 });
        checkpoint();
        return 'next';
      }

      await finishWith(results, answerLog);
      return 'finished';
    },

    submitPaper: async () => {
      const { items, drafts } = get();
      const now = Date.now();

      const results = items.map((item) => {
        const draft = drafts[item.id] ?? null;
        const correct = gradeDraft(item, draft);
        return {
          itemId: item.id,
          format: item.format,
          correct,
          slip: correct ? null : classifyMiss(item, draft),
          draft,
        };
      });
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

    reset: () => {
      void clearSnapshot();
      set({
        status: 'idle',
        deck: null,
        questions: [],
        deckAnswers: [],
        available: emptyCounts(),
        counts: emptyCounts(),
        picks: [],
        target: FIRST_TARGET,
        custom: false,
        mode: DEFAULT_MODE,
        lastMode: null,
        error: null,
        ...FRESH,
      });
    },

    /**
     * Restores an unfinished sitting. The deck and its questions are re-read
     * from the database — only what the student did is taken from the
     * snapshot, so a resumed paper can't disagree with their notes.
     */
    resume: async () => {
      const snapshot = await readSnapshot();
      if (!snapshot) return false;

      try {
        const [deck, questions, deckAnswers] = await Promise.all([
          getDeckById(snapshot.deckId),
          listQuestions(snapshot.deckId),
          listAnswersForDeck(snapshot.deckId),
        ]);
        if (!deck || questions.length === 0) {
          await clearSnapshot();
          return false;
        }

        const saved = snapshot.state as Record<string, unknown>;
        const items = saved.items as ExamItem[] | undefined;
        if (!Array.isArray(items) || items.length === 0) {
          await clearSnapshot();
          return false;
        }

        set({
          status: 'active',
          deck,
          questions,
          deckAnswers,
          available: availability(questions),
          error: null,
          ...FRESH,
          ...saved,
        } as Partial<ExamState> as ExamState);
        return true;
      } catch {
        await clearSnapshot();
        return false;
      }
    },
  };
});
