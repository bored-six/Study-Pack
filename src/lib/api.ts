import type { Difficulty } from './types';

/**
 * Typed client for Open Trivia DB (https://opentdb.com).
 *
 * Quirks this client absorbs so the rest of the app doesn't have to:
 * - Success/failure lives in the JSON `response_code`, not the HTTP status.
 * - Question text is encoded; we request `encode=url3986` and decode with
 *   decodeURIComponent (the default HTML-entity encoding is messier).
 * - The API allows one question request per ~5 seconds per IP; requests are
 *   funneled through a single-flight queue that spaces them out.
 */

const BASE = 'https://opentdb.com';

export type ApiErrorCode = 'network' | 'http' | 'no_results' | 'rate_limited' | 'invalid';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiCategory {
  id: number;
  name: string;
}

export interface ApiQuestion {
  prompt: string;
  correctAnswer: string;
  incorrectAnswers: string[];
}

/** The category endpoint returns HTML-entity-encoded names. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError('No connection — check your network', 'network');
  }
  if (!res.ok) {
    throw new ApiError(`Open Trivia DB returned HTTP ${res.status}`, 'http');
  }
  return res.json();
}

export async function fetchCategories(): Promise<ApiCategory[]> {
  const json = (await getJson(`${BASE}/api_category.php`)) as {
    trivia_categories?: { id: number; name: string }[];
  };
  if (!Array.isArray(json.trivia_categories)) {
    throw new ApiError('Unexpected catalog response shape', 'invalid');
  }
  return json.trivia_categories.map((c) => ({ id: c.id, name: decodeEntities(c.name) }));
}

// --- rate-limited question fetching ------------------------------------

const MIN_INTERVAL_MS = 5500; // API allows 1 request / 5s per IP; add margin

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    try {
      return await job();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

interface RawQuestion {
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export async function fetchQuestions(
  categoryId: number,
  difficulty: Difficulty,
  amount: number
): Promise<ApiQuestion[]> {
  return throttled(async () => {
    const url =
      `${BASE}/api.php?amount=${amount}&category=${categoryId}` +
      `&difficulty=${difficulty}&type=multiple&encode=url3986`;
    const json = (await getJson(url)) as { response_code?: number; results?: RawQuestion[] };

    switch (json.response_code) {
      case 0:
        break;
      case 1:
        throw new ApiError('Not enough questions available for this deck', 'no_results');
      case 5:
        throw new ApiError('Too many requests — wait a few seconds and retry', 'rate_limited');
      default:
        throw new ApiError(`Unexpected response code ${json.response_code}`, 'invalid');
    }

    if (!Array.isArray(json.results) || json.results.length === 0) {
      throw new ApiError('Empty question list in response', 'invalid');
    }

    return json.results.map((q) => ({
      prompt: decodeURIComponent(q.question),
      correctAnswer: decodeURIComponent(q.correct_answer),
      incorrectAnswers: q.incorrect_answers.map((a) => decodeURIComponent(a)),
    }));
  });
}
