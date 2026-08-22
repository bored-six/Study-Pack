import { create } from 'zustand';

import { fetchCategories } from '@/lib/api';
import { listDecks, upsertCatalog } from '@/lib/db';
import { DIFFICULTIES, type Deck } from '@/lib/types';

const DECK_SIZE = 20;

interface DecksState {
  decks: Deck[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** True when the network failed and we're showing the locally cached catalog. */
  fromCache: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useDecksStore = create<DecksState>((set, get) => ({
  decks: [],
  status: 'idle',
  fromCache: false,
  error: null,

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
}));
