# Flipp

**Your notes go in. A real exam comes out.**

An offline-first Android study app built with React Native, Expo and TypeScript. Paste
the notes you already wrote, and Flipp turns them into an exam paper — seven question
formats, five modes, and a report card that tells you what to revisit.

🔗 **[flipphq.vercel.app](https://flipphq.vercel.app)**

Built around one constraint: students don't always have data. So the app assumes it has
none. There is no account, no tracking, and no sync. Everything lives in local SQLite,
and the only network call in the product is Nib — the AI reader — and only when you tap it.

---

## What it does

| Step | What happens |
|------|--------------|
| **Paste** | Drop in a block of notes. A cheap shape-read runs as you type — how many lines are usable, too short, too long, or just illustrations — so the advice arrives *before* you press the button, not after. |
| **Parse** | The on-device parser decides what can actually be asked about, and builds questions in seven formats. Wrong options are drawn from your own notes, so the distractors are plausible instead of obviously fake. |
| **Sit the exam** | Pick a mode. The paper runs entirely offline. |
| **Report card** | Score, a per-topic debrief, and a mastery read on what to go back to. |

### Seven question formats

`multiple_choice` · `true_false` · `modified_true_false` · `identification` ·
`fill_blank` · `matching` · `enumeration`

A format only appears if your notes can actually support it — availability is computed
per paper, not assumed.

### Five modes

A mode is really three dials — **clock**, **feedback**, **repetition** — set at once.
They're deliberately not exposed separately: five named presets read as a game, three
toggles read as a settings form, and nobody plays a settings form.

| Mode | The deal |
|------|----------|
| **Relaxed** | No clock, instant feedback, one pass. |
| **Mastery** | Repeats each item until it's retired. |
| **Rapid** | A timer per question. |
| **Simulation** | One clock for the whole paper, feedback deferred to the end. |
| **Survival** | Keep going until you run out. |

---

## Architecture

Screens never touch the database directly. They talk to stores; stores talk to `lib/`.
That keeps SQL out of the UI and keeps the offline path easy to reason about.

```
src/app/       expo-router screens — notes/, exam/, planner, progress, album, settings
src/store/     zustand — notes, exam, progress, planner, achievements, moments
src/lib/       the rules, all pure and all testable without a screen:
                 noteParser.ts   what becomes a question
                 noteShape.ts    the cheap live read of the paste box
                 exam.ts         formats, availability, paper assembly
                 mode.ts         clock / feedback / repetition presets
                 mastery.ts      what you actually know
                 grade.ts        marking
                 debrief.ts      the report card
                 aiNotes.ts      Nib, the one network call
                 db.ts           expo-sqlite: schema, migrations, transactions
```

The rules live in `lib/` precisely so they can be tested headlessly — which is most of
why the test count below is what it is.

---

## Tests

**53 Jest suites across 146 TypeScript modules.**

```bash
npm test      # unit + screen tests
npm run qa    # the QA pass
```

Screen tests cover the real flows (`newNotes`, `examSetup`, `examRun`, `examResults`,
`customQuestion`, `nibScreen`); the `lib/` tests cover the parsing and grading rules
directly, without rendering anything.

---

## Stack, and why

| Choice | Why |
|--------|-----|
| **Expo + React Native + TypeScript** | Managed workflow, and EAS builds the Android APK in the cloud. |
| **expo-sqlite** | Your notes deserve a real schema with migrations, not a JSON blob that gets wiped on the next release. |
| **zustand** | State without boilerplate — small stores, each explainable in a sentence. |
| **expo-router** | File-based routing; tabs plus an exam stack using `replace`, so *back* never re-enters a finished paper. |
| **Reanimated** | Motion on the UI thread, which matters on the mid-range Android this is actually for. |

---

## Run it

```bash
npm install
npx expo start        # scan the QR with Expo Go, same Wi-Fi
npm test
```

The genuine offline demo needs a standalone build — `eas build -p android --profile
preview` — because in Expo Go, airplane mode also severs the dev server.

---

## Author

**Shiek Nakar Abdurahman** — front-end developer, Zamboanga City, Philippines.
[Portfolio](https://work-portfolio-khybrie.vercel.app) ·
[LinkedIn](https://linkedin.com/in/shiekabdurahman)
