export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

/** A deck is one Open Trivia DB category at one difficulty. */
export interface Deck {
  id: string; // `${categoryId}:${difficulty}`
  categoryId: number;
  name: string;
  difficulty: Difficulty;
  questionCount: number;
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
