import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  Attempt,
  Deck,
  DeckSource,
  Difficulty,
  Question,
  Repeat,
  Schedule,
} from './types';

const DB_NAME = 'studypack.db';
const SCHEMA_VERSION = 3;

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

  if (version < 2) {
    // Existing rows are all trivia; notes decks arrive with this version.
    await db.execAsync(`ALTER TABLE decks ADD COLUMN source TEXT NOT NULL DEFAULT 'trivia'`);
  }

  if (version < 3) {
    // Planned quizzes. Reminders are derived from these at read time, so
    // there is no notification state here to fall out of sync.
    // ON DELETE CASCADE means deleting a subject takes its plans with it.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        time_of_day INTEGER NOT NULL,
        repeat_rule TEXT NOT NULL,
        start_date INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_schedules_deck ON schedules(deck_id);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

interface DeckRow {
  id: string;
  category_id: number;
  name: string;
  difficulty: string;
  question_count: number;
  source: string | null;
  downloaded_at: number | null;
}

function toDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    difficulty: row.difficulty as Difficulty,
    questionCount: row.question_count,
    source: (row.source as DeckSource) ?? 'trivia',
    downloadedAt: row.downloaded_at,
  };
}

/** Trivia decks sort by name; notes decks sort newest first. */
export async function listDecks(source: DeckSource = 'trivia'): Promise<Deck[]> {
  const order =
    source === 'notes'
      ? 'downloaded_at DESC'
      : `name, CASE difficulty WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;
  const rows = await getDb().getAllAsync<DeckRow>(
    `SELECT * FROM decks WHERE source = ? ORDER BY ${order}`,
    source
  );
  return rows.map(toDeck);
}

/**
 * Refreshes the browsable catalog. Never touches downloaded_at or questions,
 * so a catalog refresh can't corrupt an existing download.
 */
export async function upsertCatalog(
  decks: Omit<Deck, 'downloadedAt' | 'source'>[]
): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const deck of decks) {
      await db.runAsync(
        `INSERT INTO decks (id, category_id, name, difficulty, question_count, source)
         VALUES (?, ?, ?, ?, ?, 'trivia')
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

/**
 * Creates an empty subject (a notes deck). Notes decks are local by
 * definition, so they count as downloaded from the moment they exist.
 */
export async function createSubject(name: string): Promise<string> {
  const now = Date.now();
  const deckId = `note:${now}`;
  await getDb().runAsync(
    `INSERT INTO decks (id, category_id, name, difficulty, question_count, source, downloaded_at)
     VALUES (?, 0, ?, 'medium', 0, 'notes', ?)`,
    deckId,
    name,
    now
  );
  return deckId;
}

/**
 * Appends questions to a subject, so several pastes accumulate into one
 * deck (Chapter 4 and Chapter 5 both land in Biology).
 */
export async function addQuestionsToDeck(
  deckId: string,
  questions: DownloadableQuestion[]
): Promise<void> {
  if (questions.length === 0) return;
  const db = getDb();

  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ next: number | null }>(
      'SELECT MAX(position) + 1 AS next FROM questions WHERE deck_id = ?',
      deckId
    );
    let position = row?.next ?? 0;

    for (const q of questions) {
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
      position++;
    }

    await db.runAsync(
      `UPDATE decks
       SET question_count = (SELECT COUNT(*) FROM questions WHERE deck_id = ?)
       WHERE id = ?`,
      deckId,
      deckId
    );
  });
}

/** Removes a notes deck and its questions outright. */
export async function deleteDeck(deckId: string): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM questions WHERE deck_id = ?', deckId);
    await db.runAsync('DELETE FROM decks WHERE id = ?', deckId);
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

export interface AttemptWithDeck extends Attempt {
  deckName: string;
  difficulty: Difficulty | null;
}

interface AttemptRow {
  id: number;
  deck_id: string;
  score: number;
  total: number;
  duration_ms: number;
  completed_at: number;
  deck_name: string | null;
  difficulty: string | null;
}

export async function listAttempts(limit = 50): Promise<AttemptWithDeck[]> {
  const rows = await getDb().getAllAsync<AttemptRow>(
    `SELECT a.id, a.deck_id, a.score, a.total, a.duration_ms, a.completed_at,
            d.name AS deck_name, d.difficulty AS difficulty
     FROM attempts a
     LEFT JOIN decks d ON d.id = a.deck_id
     ORDER BY a.completed_at DESC
     LIMIT ?`,
    limit
  );
  return rows.map((row) => ({
    id: row.id,
    deckId: row.deck_id,
    score: row.score,
    total: row.total,
    durationMs: row.duration_ms,
    completedAt: row.completed_at,
    deckName: row.deck_name ?? 'Removed deck',
    difficulty: (row.difficulty as Difficulty) ?? null,
  }));
}

/** All attempt timestamps — the streak input. Integers only, cheap to load. */
export async function listAttemptTimestamps(): Promise<number[]> {
  const rows = await getDb().getAllAsync<{ completed_at: number }>(
    'SELECT completed_at FROM attempts'
  );
  return rows.map((row) => row.completed_at);
}

export async function getBestScoreRatio(): Promise<number | null> {
  const row = await getDb().getFirstAsync<{ best: number | null }>(
    'SELECT MAX(CAST(score AS REAL) / total) AS best FROM attempts'
  );
  return row?.best ?? null;
}

interface ScheduleRow {
  id: number;
  deck_id: string;
  time_of_day: number;
  repeat_rule: string;
  start_date: number;
  enabled: number;
  created_at: number;
  deck_name: string | null;
}

function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    deckId: row.deck_id,
    deckName: row.deck_name ?? 'Removed deck',
    timeOfDay: row.time_of_day,
    repeat: row.repeat_rule as Repeat,
    startDate: row.start_date,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

/** Every plan, earliest time of day first — the order the Planner renders. */
export async function listSchedules(): Promise<Schedule[]> {
  const rows = await getDb().getAllAsync<ScheduleRow>(
    `SELECT s.*, d.name AS deck_name
     FROM schedules s
     LEFT JOIN decks d ON d.id = s.deck_id
     ORDER BY s.time_of_day, s.created_at`
  );
  return rows.map(toSchedule);
}

export type NewSchedule = Pick<Schedule, 'deckId' | 'timeOfDay' | 'repeat' | 'startDate'>;

export async function createSchedule(schedule: NewSchedule): Promise<number> {
  const result = await getDb().runAsync(
    `INSERT INTO schedules (deck_id, time_of_day, repeat_rule, start_date, enabled, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`,
    schedule.deckId,
    schedule.timeOfDay,
    schedule.repeat,
    schedule.startDate,
    Date.now()
  );
  return result.lastInsertRowId;
}

export async function setScheduleEnabled(id: number, enabled: boolean): Promise<void> {
  await getDb().runAsync(
    'UPDATE schedules SET enabled = ? WHERE id = ?',
    enabled ? 1 : 0,
    id
  );
}

export async function deleteSchedule(id: number): Promise<void> {
  await getDb().runAsync('DELETE FROM schedules WHERE id = ?', id);
}

export async function readSetting(key: string): Promise<string | null> {
  const row = await getDb().getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function writeSetting(key: string, value: string): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value
  );
}

/**
 * Decks a quiz can actually run on right now: notes subjects with
 * questions, plus downloaded trivia. Scheduling a deck you have not
 * downloaded would produce a reminder that leads to a dead end.
 */
export async function listPlayableDecks(): Promise<Deck[]> {
  const rows = await getDb().getAllAsync<DeckRow>(
    `SELECT * FROM decks
     WHERE downloaded_at IS NOT NULL AND question_count > 0
     ORDER BY source DESC, name`
  );
  return rows.map(toDeck);
}
