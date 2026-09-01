import { create } from 'zustand';

import {
  addQuestionsToDeck,
  createSubject,
  deleteDeck,
  listAnswerPool,
  listDecks,
} from '@/lib/db';
import {
  AI_FAILURE_MESSAGE,
  failureReason,
  readWithAI,
  type Credits,
} from '@/lib/aiNotes';
import { LIMITS, parseNotes, type ParseResult, type ParsedQuestion } from '@/lib/noteParser';
import type { Deck } from '@/lib/types';

/**
 * Two questions are the same question when they want the same answer typed
 * back. It is the parser's own rule for `duplicate` — reused here so a rescue
 * cannot hand back a question the parser already built from the same line.
 */
function answerKey(question: ParsedQuestion): string {
  return question.correctAnswer.trim().toLowerCase();
}

interface NotesState {
  /** Subjects are notes decks: Biology, History, … */
  subjects: Deck[];
  /**
   * Subject the reviewed draft will be saved to. Chosen on the review
   * screen, never on the paste screen — you assign notes once you can see
   * what came out of them.
   */
  targetId: string | null;
  /** Questions awaiting review after a parse; edited in place before saving. */
  draft: ParsedQuestion[];
  stats: ParseResult['stats'] | null;
  /**
   * The notes the draft was built from, kept so a rescue has something to
   * send. The parse only needs `raw` for as long as it runs; the review
   * screen may need it again minutes later.
   */
  source: string | null;
  /** A reading is in flight. Guards the button against a second press. */
  rescuing: boolean;
  /** How many questions the last reading added, or null if none has run. */
  rescueAdded: number | null;
  /** Why the last reading did not happen; cleared when another is tried. */
  rescueError: string | null;
  /** What the server said is left. Null until a reading comes back. */
  credits: Credits | null;
  refresh: () => Promise<void>;
  setTarget: (deckId: string) => void;
  addSubject: (name: string) => Promise<string>;
  /** Runs the offline parser and stages the result for review. */
  parse: (raw: string) => ParseResult;
  /**
   * Parses, then asks for a reading in one go, for notes the shape read says
   * the parser will get little out of. Returns how many questions are staged.
   *
   * The parse still runs first and its questions are still kept: a reading
   * that fails leaves the student exactly where pressing Scan would have.
   */
  scanWithReader: (raw: string) => Promise<number>;
  /**
   * Reads a PDF or a photo and stages what comes back.
   *
   * No parse runs first, because there is nothing on the phone that can read
   * inside a file — so unlike every other path into the review screen, this
   * one has no offline half. It returns how many questions are staged, and
   * zero means the failure is in `rescueError`.
   */
  readFile: (file: { base64: string; mime: string; name: string }) => Promise<number>;
  /**
   * Asks the reader to make questions from the lines the parser skipped, and
   * merges what comes back into the draft under review.
   *
   * Never replaces the parse. On any failure the draft is exactly as it was —
   * the parser's work is not something a dropped connection can take away.
   */
  rescue: () => Promise<void>;
  /** Options already saved in a subject, to borrow wrong answers from. */
  poolFor: (deckId: string) => Promise<string[]>;
  /**
   * Stages one hand-written question for the same review screen the parser
   * uses, so a question you wrote is read over before saving just like one
   * we built for you.
   */
  stageCustom: (question: ParsedQuestion, deckId: string | null) => void;
  reviseDraftQuestion: (index: number, patch: Partial<ParsedQuestion>) => void;
  removeDraftQuestion: (index: number) => void;
  clearDraft: () => void;
  /** Appends the reviewed draft to the target subject. */
  saveDraft: () => Promise<void>;
  remove: (deckId: string) => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  subjects: [],
  targetId: null,
  draft: [],
  stats: null,
  source: null,
  rescuing: false,
  rescueAdded: null,
  rescueError: null,
  credits: null,

  refresh: async () => {
    const subjects = await listDecks('notes');
    const { targetId } = get();
    const stillExists = subjects.some((s) => s.id === targetId);
    // No falling back to the first subject: an unpicked draft must stay
    // unpicked, or notes quietly land somewhere the student never chose.
    set({ subjects, targetId: stillExists ? targetId : null });
  },

  setTarget: (deckId) => set({ targetId: deckId }),

  addSubject: async (name) => {
    const deckId = await createSubject(name.trim() || 'My notes');
    set({ subjects: await listDecks('notes'), targetId: deckId });
    return deckId;
  },

  parse: (raw) => {
    const result = parseNotes(raw);
    // Every scan arrives at review unassigned — the subject is a decision
    // made about *these* questions, not one inherited from last time.
    // `source` is kept for the rescue; the outcome of any earlier one is not,
    // or a new scan would open showing what the last scan's reading did.
    set({
      draft: result.questions,
      stats: result.stats,
      targetId: null,
      source: raw,
      rescueAdded: null,
      rescueError: null,
    });
    return result;
  },

  readFile: async (file) => {
    set({ rescuing: true, rescueError: null, rescueAdded: null });
    try {
      const reading = await readWithAI({ kind: 'file', ...file });
      const questions = reading.questions.slice(0, LIMITS.maxQuestions);
      set({
        draft: questions,
        stats: {
          linesRead: questions.length,
          linesUsed: questions.length,
          skipped: [],
          truncatedInput: false,
          cappedQuestions: reading.questions.length > questions.length,
        },
        targetId: null,
        // Nothing to rescue afterwards: the reading already was the reading,
        // and the file is not text this app can hand back to itself.
        source: null,
        credits: reading.credits,
        rescueAdded: questions.length,
        rescuing: false,
      });
      return questions.length;
    } catch (error) {
      set({ rescuing: false, rescueError: AI_FAILURE_MESSAGE[failureReason(error)] });
      return 0;
    }
  },

  scanWithReader: async (raw) => {
    get().parse(raw);
    // rescue() reports failure through state rather than throwing, so the
    // parser's questions survive a reading that never arrives.
    await get().rescue();
    return get().draft.length;
  },

  rescue: async () => {
    const { source, draft, stats, rescuing } = get();
    // Nothing to send, nowhere to put it, or one already in flight.
    if (rescuing || source == null || stats == null) return;

    set({ rescuing: true, rescueError: null });
    try {
      const reading = await readWithAI({ kind: 'text', body: source });

      // Keep every question the parser built. Only genuinely new answers are
      // appended — deduped against the draft *and* within the reading itself,
      // or one repeated answer in the response lands twice.
      const seen = new Set(draft.map(answerKey));
      const fresh = reading.questions.filter((question) => {
        const key = answerKey(question);
        if (key.length === 0 || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // maxQuestions is a review-burden rule, not a parser limitation, so it
      // holds here too: a reading that turns a page of prose into three
      // hundred questions leaves a review screen nobody finishes.
      const room = Math.max(0, LIMITS.maxQuestions - draft.length);
      const added = fresh.slice(0, room);

      // A line that finally produced a question is no longer a skipped line.
      const rescued = new Set(
        added.map((question) => question.sourceLine).filter((line): line is string => line != null)
      );

      set({
        draft: [...draft, ...added],
        stats: {
          ...stats,
          linesUsed: stats.linesUsed + added.length,
          skipped: stats.skipped.filter((line) => !rescued.has(line.text)),
          cappedQuestions: stats.cappedQuestions || added.length < fresh.length,
        },
        credits: reading.credits,
        rescueAdded: added.length,
        rescuing: false,
      });
    } catch (error) {
      // The draft is untouched on purpose. Whatever the parser gave the
      // student is still there, and no reading was spent getting here.
      set({
        rescuing: false,
        rescueError: AI_FAILURE_MESSAGE[failureReason(error)],
      });
    }
  },

  poolFor: async (deckId) => listAnswerPool(deckId),

  stageCustom: (question, deckId) => {
    // The review screen only renders once a scan has happened, and one
    // written question is a scan of one line that produced one question.
    set({
      draft: [question],
      stats: {
        linesRead: 1,
        linesUsed: 1,
        skipped: [],
        truncatedInput: false,
        cappedQuestions: false,
      },
      targetId: deckId,
      // A question the student wrote has no notes behind it, so there is
      // nothing a reading could be asked to go back over.
      source: null,
      rescueAdded: null,
      rescueError: null,
    });
  },

  reviseDraftQuestion: (index, patch) => {
    set((s) => ({
      draft: s.draft.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    }));
  },

  removeDraftQuestion: (index) => {
    set((s) => ({ draft: s.draft.filter((_, i) => i !== index) }));
  },

  clearDraft: () =>
    set({ draft: [], stats: null, source: null, rescueAdded: null, rescueError: null }),

  saveDraft: async () => {
    const { draft, targetId } = get();
    if (!targetId) throw new Error('Pick a subject first');
    if (draft.length === 0) throw new Error('Nothing to save');

    await addQuestionsToDeck(
      targetId,
      // kind/sourceLine/ordered must survive the save — they are what decide
      // which exam formats a question can become.
      draft.map((q) => ({
        prompt: q.prompt,
        correctAnswer: q.correctAnswer,
        answers: q.answers,
        kind: q.kind,
        sourceLine: q.sourceLine,
        ordered: q.ordered ?? false,
      }))
    );
    set({
      draft: [],
      stats: null,
      source: null,
      rescueAdded: null,
      rescueError: null,
      subjects: await listDecks('notes'),
    });
  },

  remove: async (deckId) => {
    await deleteDeck(deckId);
    const subjects = await listDecks('notes');
    set((s) => ({
      subjects,
      targetId: s.targetId === deckId ? (subjects[0]?.id ?? null) : s.targetId,
    }));
  },
}));
