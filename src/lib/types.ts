export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/** Where a deck came from: the trivia API, or the student's own notes. */
export type DeckSource = 'trivia' | 'notes';

/**
 * A trivia deck is one Open Trivia DB category at one difficulty.
 * A notes deck is generated on-device from pasted notes and is therefore
 * downloaded from the moment it exists.
 */
export interface Deck {
  id: string; // trivia: `${categoryId}:${difficulty}` · notes: `note:${timestamp}`
  categoryId: number;
  name: string;
  difficulty: Difficulty;
  questionCount: number;
  source: DeckSource;
  /** Epoch ms when the deck's questions were saved locally; null = not downloaded. */
  downloadedAt: number | null;
}

export interface Question {
  id: string; // `${deckId}:${position}`
  deckId: string;
  position: number;
  prompt: string;
  correctAnswer: string;
  /** All four options, shuffled once at download time and frozen. */
  answers: string[];
}

export interface Attempt {
  id: number;
  deckId: string;
  score: number;
  total: number;
  durationMs: number;
  completedAt: number; // epoch ms
}
