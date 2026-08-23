import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { inferRepair } from './repair';

import type {
  Attempt,
  Deck,
  DeckSource,
  Difficulty,
  Question,
  QuestionKind,
  Repeat,
  Schedule,
} from './types';

const DB_NAME = 'studypack.db';
const SCHEMA_VERSION = 7;

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

  if (version < 4) {
    // Exam formats need to know how a question was derived and what sentence
    // it came from. Questions saved before this default to trivia, which
    // supports multiple choice only.
    await db.execAsync(`
      ALTER TABLE questions ADD COLUMN kind TEXT NOT NULL DEFAULT 'trivia';
      ALTER TABLE questions ADD COLUMN source_line TEXT;
      ALTER TABLE questions ADD COLUMN ordered INTEGER NOT NULL DEFAULT 0;
    `);
  }

  if (version < 5) {
    // Per-question results. Scores alone could never say *which* questions
    // are shaky, so mastery and weak spots both start here. Recorded from
    // this version on; earlier attempts simply have no detail to show.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_id INTEGER REFERENCES attempts(id) ON DELETE CASCADE,
        deck_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        correct INTEGER NOT NULL,
        answered_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_answers_deck ON answers(deck_id, answered_at);
      CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
    `);
  }

  if (version < 7) {
    // A subject the student dressed themselves is one they come back to.
    await db.execAsync(`
      ALTER TABLE decks ADD COLUMN color TEXT;
      ALTER TABLE decks ADD COLUMN icon TEXT;
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  // Deliberately not version-gated. This repairs *data*, not schema, and a
  // version gate already failed once: a database bumped past the gate by an
  // unrelated migration could never be repaired. The query below finds
  // nothing once everything is labelled, so running it every launch is free.
  await repairNoteQuestions(db);
}

/**
 * Re-labels questions in notes decks whose kind was lost. Only touches rows
 * still marked trivia inside a notes deck, so real trivia is never altered
 * and correctly-labelled rows are left alone.
 */
async function repairNoteQuestions(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ id: string; prompt: string; correct_answer: string }>(
    `SELECT q.id, q.prompt, q.correct_answer
     FROM questions q
     JOIN decks d ON d.id = q.deck_id
     WHERE d.source = 'notes' AND q.kind = 'trivia'`
  );
  if (rows.length === 0) return;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      const repair = inferRepair({ prompt: row.prompt, correctAnswer: row.correct_answer });
      if (!repair) continue;
      await db.runAsync(
        'UPDATE questions SET kind = ?, source_line = ? WHERE id = ?',
        repair.kind,
        repair.sourceLine,
        row.id
      );
    }
  });
}

interface DeckRow {
  id: string;
  category_id: number;
  name: string;
  difficulty: string;
  question_count: number;
  source: string | null;
  color: string | null;
  icon: string | null;
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
    color: row.color,
    icon: row.icon,
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
  decks: Omit<Deck, 'downloadedAt' | 'source' | 'color' | 'icon'>[]
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

export type DownloadableQuestion = Pick<Question, 'prompt' | 'correctAnswer' | 'answers'> &
  Partial<Pick<Question, 'kind' | 'sourceLine' | 'ordered'>>;

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
        `INSERT INTO questions
           (id, deck_id, position, prompt, correct_answer, answers_json, kind, source_line, ordered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${deckId}:${position}`,
        deckId,
        position,
        q.prompt,
        q.correctAnswer,
        JSON.stringify(q.answers),
        q.kind ?? 'trivia',
        q.sourceLine ?? null,
        q.ordered ? 1 : 0
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
        `INSERT INTO questions
           (id, deck_id, position, prompt, correct_answer, answers_json, kind, source_line, ordered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${deckId}:${position}`,
        deckId,
        position,
        q.prompt,
        q.correctAnswer,
        JSON.stringify(q.answers),
        q.kind ?? 'trivia',
        q.sourceLine ?? null,
        q.ordered ? 1 : 0
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
  kind: string | null;
  source_line: string | null;
  ordered: number | null;
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
    kind: (row.kind as QuestionKind) ?? 'trivia',
    sourceLine: row.source_line,
    ordered: row.ordered === 1,
  }));
}

export async function saveAttempt(attempt: Omit<Attempt, 'id'>): Promise<number> {
  const result = await getDb().runAsync(
    `INSERT INTO attempts (deck_id, score, total, duration_ms, completed_at)
     VALUES (?, ?, ?, ?, ?)`,
    attempt.deckId,
    attempt.score,
    attempt.total,
    attempt.durationMs,
    attempt.completedAt
  );
  return result.lastInsertRowId;
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

export interface AnswerInput {
  questionId: string;
  correct: boolean;
  answeredAt: number;
}

/** Writes a quiz's per-question results in one transaction. */
export async function saveAnswers(
  attemptId: number,
  deckId: string,
  answers: readonly AnswerInput[]
): Promise<void> {
  if (answers.length === 0) return;
  const db = getDb();
  await db.withTransactionAsync(async () => {
    for (const answer of answers) {
      await db.runAsync(
        `INSERT INTO answers (attempt_id, deck_id, question_id, correct, answered_at)
         VALUES (?, ?, ?, ?, ?)`,
        attemptId,
        deckId,
        answer.questionId,
        answer.correct ? 1 : 0,
        answer.answeredAt
      );
    }
  });
}

export interface StoredAnswer extends AnswerInput {
  deckId: string;
}

/** Every recorded answer, oldest first — the input to mastery. */
export async function listAnswers(): Promise<StoredAnswer[]> {
  const rows = await getDb().getAllAsync<{
    deck_id: string;
    question_id: string;
    correct: number;
    answered_at: number;
  }>('SELECT deck_id, question_id, correct, answered_at FROM answers ORDER BY answered_at');
  return rows.map((row) => ({
    deckId: row.deck_id,
    questionId: row.question_id,
    correct: row.correct === 1,
    answeredAt: row.answered_at,
  }));
}

/**
 * Question ids grouped by subject. Mastery averages over every question a
 * subject holds, so it needs the full roster, not just the answered ones.
 */
export async function listQuestionIdsBySubject(): Promise<Map<string, string[]>> {
  const rows = await getDb().getAllAsync<{ deck_id: string; id: string }>(
    `SELECT q.deck_id, q.id
     FROM questions q
     JOIN decks d ON d.id = q.deck_id
     WHERE d.source = 'notes'
     ORDER BY q.deck_id, q.position`
  );
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.deck_id);
    if (list) list.push(row.id);
    else map.set(row.deck_id, [row.id]);
  }
  return map;
}

/** Saves the look the student chose for a subject. */
export async function customizeDeck(
  deckId: string,
  color: string | null,
  icon: string | null
): Promise<void> {
  await getDb().runAsync(
    'UPDATE decks SET color = ?, icon = ? WHERE id = ?',
    color,
    icon,
    deckId
  );
}
