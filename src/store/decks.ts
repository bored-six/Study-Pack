import { create } from 'zustand';

import { ApiError, fetchCategories, fetchQuestions, type ApiQuestion } from '@/lib/api';
import {
  listDecks,
  removeDownload as dbRemoveDownload,
  saveDeckDownload,
  upsertCatalog,
} from '@/lib/db';
import { shuffle } from '@/lib/shuffle';
import { DIFFICULTIES, type Deck } from '@/lib/types';

const DECK_SIZE = 20;
/** Some category/difficulty pairs have fewer than 20 questions; fall back once. */
const FALLBACK_SIZES = [DECK_SIZE, 10];

async function fetchDeckQuestions(deck: Deck): Promise<ApiQuestion[]> {
  let lastError: unknown;
  for (const amount of FALLBACK_SIZES) {
    try {
      return await fetchQuestions(deck.categoryId, deck.difficulty, amount);
    } catch (e) {
      lastError = e;
      if (!(e instanceof ApiError && e.code === 'no_results')) throw e;
    }
  }
  throw lastError;
}

interface DecksState {
  decks: Deck[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** True when the network failed and we're showing the locally cached catalog. */
  fromCache: boolean;
  error: string | null;
  /** Deck ids currently downloading (queued behind the API rate limit). */
  downloading: Record<string, true>;
  refresh: () => Promise<void>;
  downloadDeck: (deck: Deck) => Promise<void>;
  removeDownload: (deckId: string) => Promise<void>;
}

export const useDecksStore = create<DecksState>((set, get) => ({
  decks: [],
  status: 'idle',
  fromCache: false,
  error: null,
  downloading: {},

  refresh: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });
    try {
      const categories = await fetchCategories();
      const catalog = categories.flatMap((category) =>
        DIFFICULTIES.map((difficulty) => ({
          id: `${category.id}:${difficulty}`,
          categoryId: category.id,
          name: category.name,
          difficulty,
          questionCount: DECK_SIZE,
        }))
      );
      await upsertCatalog(catalog);
      set({ decks: await listDecks(), status: 'ready', fromCache: false });
    } catch (e) {
      // Offline-first: fall back to whatever catalog we already have on device.
      const cached = await listDecks();
      if (cached.length > 0) {
        set({ decks: cached, status: 'ready', fromCache: true });
      } else {
        set({
          status: 'error',
          error: e instanceof Error ? e.message : 'Could not load decks',
        });
      }
    }
  },

  downloadDeck: async (deck) => {
    if (get().downloading[deck.id] || deck.downloadedAt != null) return;
    set((s) => ({ downloading: { ...s.downloading, [deck.id]: true } }));
    try {
      const apiQuestions = await fetchDeckQuestions(deck);
      const questions = apiQuestions.map((q) => ({
        prompt: q.prompt,
        correctAnswer: q.correctAnswer,
        // Shuffled once here, then frozen in the database.
        answers: shuffle([q.correctAnswer, ...q.incorrectAnswers]),
      }));
      await saveDeckDownload(deck.id, questions);
      set({ decks: await listDecks() });
    } finally {
      set((s) => {
        const next = { ...s.downloading };
        delete next[deck.id];
        return { downloading: next };
      });
    }
  },

  removeDownload: async (deckId) => {
    await dbRemoveDownload(deckId);
    set({ decks: await listDecks() });
  },
}));
