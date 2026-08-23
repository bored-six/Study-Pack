# QA audit

A standing audit of the app as it is right now. It is not a test suite —
the unit tests in `src/lib/__tests__` assert known-good behaviour, this
asks open questions and reports what it finds.

```bash
npm run qa                      # full report; fails if anything is HIGH
QA_FAIL_ON=none npm run qa      # report only, never fails
QA_FAIL_ON=medium npm run qa    # stricter gate
QA_SKIP_SUBPROCESS=1 npm run qa # skip the tsc / jest shell-outs (fast)
```

Every run rewrites `qa/report.md` with the full findings, evidence and
metrics. The terminal gets a condensed version of the same thing.

`npm test` does not run this — `testPathIgnorePatterns` in package.json
keeps the two apart.

## What it checks

| Section | Question it asks |
|---|---|
| **Project health** | Does the app typecheck, do the unit tests pass, is anything in `src/lib` unreachable from a screen, and does the save path drop columns the schema can hold? |
| **Question integrity** | Is the right answer among the options, can exactly one option be right, does anything give the answer away, and does every word trace back to the pasted notes? |
| **Repetition & input sensitivity** | Does the output actually depend on the input? |
| **Grading** | Right answers accepted, wrong answers refused, "nearly right" reserved for answers that are nearly right. |
| **Exam formats** | Is a true statement labelled true, does the correction repair the sentence, does the picker deliver the counts it advertises, is a retake a different exam? |
| **Reminders & streaks** | Nothing in the past, nothing stacked, nothing silently dropped, and a streak that survives timezone and DST edges. |
| **Mastery model** | Does the number move with what the student did, and stay inside 0–100? |
| **Robustness** | Twenty hostile pastes plus hundreds of random slices through the parser, the exam builder and the grader. |

## The repetition section, specifically

"Am I getting the same result whatever I feed it?" is not answerable by a
normal test, because a broken generator still returns *something* for
every input. Four measurements instead:

1. **Collision** — six note sets are written with deliberately disjoint
   vocabulary. A question appearing in two of them was not read out of
   either.
2. **Rewrite** — `rewriteVocabulary()` replaces every word of five or more
   letters with a deterministic pseudo-word of the same length and
   capitalisation, leaving punctuation, line shape and word count
   untouched. The quiz must keep its **shape** and change its **content**.
   Content that survives the rewrite did not come from the notes.
3. **Recycling** — how many distinct wrong answers are in play, and
   whether one term is doing duty as a decoy on most questions.
4. **Position** — where the right answer sits. An even spread means the
   position tells the student nothing.

The same idea drives the checks elsewhere: `EXAM` samples twenty
differently-seeded sittings and counts how many distinct exams come back,
`MAST` runs six different study histories and checks they do not collapse
onto one percentage, and `PLAN` counts how many distinct notification
texts a fortnight of reminders produces.

## Adding a check

`qa/checks/*.ts` each export one function returning a `Report`. Add
findings with `report.add(severity, title, detail, evidence?, where?)` or
`report.flagIf(condition, …)`, and numbers worth seeing with
`report.metric(label, value, note?)` whether or not anything is wrong.
Register the check in `qa/audit.ts`.

Write the `detail` for someone who has not read the code: what breaks, and
what a student would see. Ids (`SAME-01`) are assigned in order within a
section, so quoting one in a commit message stays meaningful only until
that section changes — quote the title too.

## Note material

`qa/corpora.ts` holds six realistic note sets and twenty hostile ones. If
you fix a bug the audit found, add the input that triggered it to
`ADVERSARIAL` so it stays fixed.
