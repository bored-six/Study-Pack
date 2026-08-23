import { create } from 'zustand';

import { createNoteDeck, deleteDeck, listDecks } from '@/lib/db';
import { parseNotes, type ParseResult, type ParsedQuestion } from '@/lib/noteParser';
import type { Deck } from '@/lib/types';

interface NotesState {
  decks: Deck[];
  /** The questions awaiting review after a parse; edited in place before saving. */
  draft: ParsedQuestion[];
  stats: ParseResult['stats'] | null;
  title: string;
  refresh: () => Promise<void>;
  /** Runs the offline parser and stages the result for review. */
  parse: (title: string, raw: string) => ParseResult;
  removeDraftQuestion: (index: number) => void;
  clearDraft: () => void;
  /** Persists the reviewed draft as a deck. Returns the new deck id. */
  saveDraft: () => Promise<string>;
  remove: (deckId: string) => Promise<void>;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  decks: [],
  draft: [],
  stats: null,
  title: '',

  refresh: async () => {
    set({ decks: await listDecks('notes') });
  },

  parse: (title, raw) => {
    const result = parseNotes(raw);
    set({ draft: result.questions, stats: result.stats, title: title.trim() || 'My notes' });
    return result;
  },

  removeDraftQuestion: (index) => {
    set((s) => ({ draft: s.draft.filter((_, i) => i !== index) }));
  },

  clearDraft: () => set({ draft: [], stats: null, title: '' }),

  saveDraft: async () => {
    const { draft, title } = get();
    if (draft.length === 0) throw new Error('Nothing to save');
    const deckId = await createNoteDeck(
      title,
      draft.map((q) => ({
        prompt: q.prompt,
        correctAnswer: q.correctAnswer,
        answers: q.answers,
      }))
    );
    set({ draft: [], stats: null, title: '', decks: await listDecks('notes') });
    return deckId;
  },

  remove: async (deckId) => {
    await deleteDeck(deckId);
    set({ decks: await listDecks('notes') });
  },
}));
