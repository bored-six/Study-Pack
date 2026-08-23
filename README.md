# Flipp

An **offline-first** quiz app built with React Native + TypeScript. Browse quiz decks
from a public REST API, download the ones you want to your device, and take quizzes
that work with **zero connectivity** — scores and streaks persist locally too.

Built around one idea: for students who don't always have reliable data, content
should survive a dropped connection. Downloading a deck is the feature, not a cache.

## What it does

| Screen | What happens |
|--------|--------------|
| **Decks** | Live catalog from [Open Trivia DB](https://opentdb.com) — 24 categories × 3 difficulties. Each deck shows a downloaded / not-downloaded state. The catalog itself is cached in SQLite, so even browsing works offline. |
| **Quiz** | Reads *only* from the local database — there is no network code path in the quiz at all. Airplane mode changes nothing. |
| **Results** | Score, duration, and a verdict; the attempt is persisted before results render. |
| **Progress** | Score history, best score, and a day streak computed from attempt timestamps. |

## Architecture

```
  Open Trivia DB ──fetch──▶  lib/api.ts        typed client: response_code handling,
                                │              url3986 decoding, 5s rate-limit queue
                                ▼
                            lib/db.ts          expo-sqlite: schema, migrations,
                                │              transactional writes
                  ┌─────────────┼──────────────┐
                  ▼             ▼              ▼
           store/decks.ts  store/quiz.ts  store/progress.ts     (zustand)
                  │             │              │
                  ▼             ▼              ▼
             app/(tabs)/   app/quiz/      app/(tabs)/
             index.tsx     [deckId].tsx   progress.tsx
                           results.tsx
```

One rule holds everywhere: **screens never touch the network or the database
directly.** They talk to stores; stores talk to `lib/`. That keeps SQL out of the UI
and makes the offline path easy to reason about.

### Download flow

Tap Download → fetch 20 questions through the rate-limit queue → decode → shuffle each
question's answers **once** → write questions + the `downloaded_at` flag in a single
SQLite transaction. If any step fails, the transaction rolls back — there is no
half-downloaded state.

### Decisions worth explaining

- **Answer order is shuffled at download time and stored, not at render time.**
  Shuffling in render makes options jump around on re-render; freezing the order in
  the database also keeps the quiz deterministic offline.
- **Streaks are computed, never stored.** Distinct local-timezone days derived from
  `attempts.completed_at`, walked back from today. Nothing to keep in sync, nothing
  to corrupt. A streak with no attempt yet today stays alive until midnight.
- **The offline banner is gold, not red.** In an offline-first app, offline is a
  supported state to reassure about, not an error to warn about.
- **Open Trivia DB's quirks are absorbed in one module** (`lib/api.ts`): success or
  failure lives in the JSON `response_code` (a 200 can still mean "no results"),
  text arrives percent-encoded, and the API allows one question request per ~5
  seconds per IP — handled with a single-flight throttle queue, plus a fallback to a
  10-question deck when a category doesn't have 20.

## Data model (SQLite)

```sql
decks     (id, category_id, name, difficulty, question_count, downloaded_at)
questions (id, deck_id → decks, position, prompt, correct_answer, answers_json)
attempts  (id, deck_id, score, total, duration_ms, completed_at)
```

`downloaded_at` is the single source of truth for the downloaded indicator. Schema
versioning runs through `PRAGMA user_version`, so future changes migrate instead of
wiping local downloads.

## Stack, and why

| Choice | Why |
|--------|-----|
| **Expo (SDK 57) + React Native + TypeScript** | Managed workflow; EAS builds the APK in the cloud. The API response shapes are exactly the thing worth typing. |
| **expo-sqlite** | Downloaded content deserves a real schema, not a JSON blob — queries stay cheap at 500 decks. |
| **Zustand** | State without boilerplate: three small stores, each explainable in a sentence. |
| **expo-router** | File-based routing; tabs + a quiz stack with `replace` navigation so back never re-enters a finished quiz. |
| **Plain `fetch`** | One typed client module; an HTTP library would add nothing here. |

## Run it

```bash
npm install
npx expo start        # scan the QR with Expo Go (same Wi-Fi)
npm test              # unit tests: streak edges, shuffle invariants
```

Note: the true offline demo needs a standalone build (`eas build -p android
--profile preview`) — in Expo Go, airplane mode also severs the dev server.

## What I'd do next

- Background refresh of downloaded decks when connectivity returns
- Spaced-repetition scheduling on top of the `attempts` table
- Deck size / difficulty picker before download
- Storage budget with LRU eviction of stale decks
