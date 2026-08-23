import { create } from 'zustand';

import { addQuestionsToDeck, createSubject, deleteDeck, listDecks } from '@/lib/db';
import { parseNotes, type ParseResult, type ParsedQuestion } from '@/lib/noteParser';
import type { Deck } from '@/lib/types';

interface NotesState {
  /** Subjects are notes decks: Biology, History, … */
  subjects: Deck[];
  /** Subject the next paste will be added to. */
  targetId: string | null;
  /** Questions awaiting review after a parse; edited in place before saving. */
  draft: ParsedQuestion[];
  stats: ParseResult['stats'] | null;
  refresh: () => Promise<void>;
  setTarget: (deckId: string) => void;
  addSubject: (name: string) => Promise<string>;
  /** Runs the offline parser and stages the result for review. */
  parse: (raw: string) => ParseResult;
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

  refresh: async () => {
    const subjects = await listDecks('notes');
    const { targetId } = get();
    const stillExists = subjects.some((s) => s.id === targetId);
    set({
      subjects,
      targetId: stillExists ? targetId : (subjects[0]?.id ?? null),
    });
  },

  setTarget: (deckId) => set({ targetId: deckId }),

  addSubject: async (name) => {
    const deckId = await createSubject(name.trim() || 'My notes');
    set({ subjects: await listDecks('notes'), targetId: deckId });
    return deckId;
  },

  parse: (raw) => {
    const result = parseNotes(raw);
    set({ draft: result.questions, stats: result.stats });
    return result;
  },

  reviseDraftQuestion: (index, patch) => {
    set((s) => ({
      draft: s.draft.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    }));
  },

  removeDraftQuestion: (index) => {
    set((s) => ({ draft: s.draft.filter((_, i) => i !== index) }));
  },

  clearDraft: () => set({ draft: [], stats: null }),

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
    set({ draft: [], stats: null, subjects: await listDecks('notes') });
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
