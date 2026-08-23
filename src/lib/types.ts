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

/** How a scheduled quiz repeats. */
export type Repeat = 'once' | 'daily' | 'weekdays' | 'weekly';

export const REPEATS: Repeat[] = ['once', 'daily', 'weekdays', 'weekly'];

export const REPEAT_LABEL: Record<Repeat, string> = {
  once: 'Once',
  daily: 'Every day',
  weekdays: 'Weekdays',
  weekly: 'Weekly',
};

/**
 * A quiz the student planned for themselves. Reminders are derived from
 * these, never stored — see lib/schedule.ts.
 */
export interface Schedule {
  id: number;
  deckId: string;
  /** Joined from decks at read time so the planner can render offline. */
  deckName: string;
  /** Minutes past local midnight, 0–1439. */
  timeOfDay: number;
  repeat: Repeat;
  /** Epoch ms; the day a `once` fires, or the day a repeat starts. */
  startDate: number;
  enabled: boolean;
  createdAt: number;
}
