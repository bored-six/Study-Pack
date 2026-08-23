import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { Attempt, Deck, Difficulty, Question } from './types';

const DB_NAME = 'studypack.db';
const SCHEMA_VERSION = 1;

let instance: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!instance) {
    instance = openDatabaseSync(DB_NAME);
  }
  return instance;
}

/** Runs versioned migrations. Must complete before any screen renders. */
export async function initDb(): Promise<void> {
  const db = getDb();
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS decks (
          id TEXT PRIMARY KEY,
          category_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          difficulty TEXT NOT NULL,
          question_count INTEGER NOT NULL,
          downloaded_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS questions (
          id TEXT PRIMARY KEY,
          deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          prompt TEXT NOT NULL,
          correct_answer TEXT NOT NULL,
          answers_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_questions_deck ON questions(deck_id, position);
        CREATE TABLE IF NOT EXISTS attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deck_id TEXT NOT NULL,
          score INTEGER NOT NULL,
          total INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          completed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_attempts_completed ON attempts(completed_at);
      `);
    });
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

interface DeckRow {
  id: string;
  category_id: number;
  name: string;
  difficulty: string;
  question_count: number;
  downloaded_at: number | null;
}

function toDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    difficulty: row.difficulty as Difficulty,
    questionCount: row.question_count,
    downloadedAt: row.downloaded_at,
  };
}

export async function listDecks(): Promise<Deck[]> {
  const rows = await getDb().getAllAsync<DeckRow>(
    `SELECT * FROM decks
     ORDER BY name, CASE difficulty WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`
  );
  return rows.map(toDeck);
}

/**
 * Refreshes the browsable catalog. Never touches downloaded_at or questions,
 * so a catalog refresh can't corrupt an existing download.
 */
export async function upsertCatalog(decks: Omit<Deck, 'downloadedAt'>[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const deck of decks) {
      await db.runAsync(
        `INSERT INTO decks (id, category_id, name, difficulty, question_count)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           question_count = CASE
             WHEN downloaded_at IS NULL THEN excluded.question_count
             ELSE question_count
           END`,
        deck.id,
        deck.categoryId,
        deck.name,
        deck.difficulty,
        deck.questionCount
      );
    }
  });
}

export type DownloadableQuestion = Pick<Question, 'prompt' | 'correctAnswer' | 'answers'>;

/**
 * Persists a deck's questions and marks it downloaded, atomically.
 * If any insert fails the transaction rolls back and the deck stays
 * not-downloaded — there is no half-downloaded state.
 */
export async function saveDeckDownload(
  deckId: string,
  questions: DownloadableQuestion[]
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM questions WHERE deck_id = ?', deckId);
    for (let position = 0; position < questions.length; position++) {
      const q = questions[position];
      await db.runAsync(
        `INSERT INTO questions (id, deck_id, position, prompt, correct_answer, answers_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        `${deckId}:${position}`,
        deckId,
        position,
        q.prompt,
        q.correctAnswer,
        JSON.stringify(q.answers)
      );
    }
    await db.runAsync(
      'UPDATE decks SET downloaded_at = ?, question_count = ? WHERE id = ?',
      Date.now(),
      questions.length,
      deckId
    );
  });
}

export async function removeDownload(deckId: string): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM questions WHERE deck_id = ?', deckId);
    await db.runAsync('UPDATE decks SET downloaded_at = NULL WHERE id = ?', deckId);
  });
}

export async function getDeckById(id: string): Promise<Deck | null> {
  const row = await getDb().getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', id);
  return row ? toDeck(row) : null;
}

interface QuestionRow {
  id: string;
  deck_id: string;
  position: number;
  prompt: string;
  correct_answer: string;
  answers_json: string;
}

/** The quiz reads exclusively from here — it never touches the network. */
export async function listQuestions(deckId: string): Promise<Question[]> {
  const rows = await getDb().getAllAsync<QuestionRow>(
    'SELECT * FROM questions WHERE deck_id = ? ORDER BY position',
    deckId
  );
  return rows.map((row) => ({
    id: row.id,
    deckId: row.deck_id,
    position: row.position,
    prompt: row.prompt,
    correctAnswer: row.correct_answer,
    answers: JSON.parse(row.answers_json) as string[],
  }));
}

export async function saveAttempt(attempt: Omit<Attempt, 'id'>): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO attempts (deck_id, score, total, duration_ms, completed_at)
     VALUES (?, ?, ?, ?, ?)`,
    attempt.deckId,
    attempt.score,
    attempt.total,
    attempt.durationMs,
    attempt.completedAt
  );
}
