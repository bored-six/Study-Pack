/**
 * A student's in-progress answer to one exam item.
 *
 * Instant-feedback modes could keep this inside the question component, but
 * an exam simulation lets you leave a question and come back to it, so the
 * answer has to outlive the component. Holding it here — as plain data with
 * pure grading — means both paths grade through exactly the same code.
 */

import type { ExamItem } from './exam';
import { checkAnswer, checkEnumeration } from './grade';

export type DraftValue =
  | { kind: 'choice'; picked: string | null; checked: boolean }
  | { kind: 'tf'; picked: boolean | null }
  | {
      kind: 'mtf';
      saidTrue: boolean | null;
      wordIndex: number | null;
      typed: string;
      /** The student has finished with this item and may be shown a verdict. */
      done: boolean;
    }
  | { kind: 'typed'; text: string; checked: boolean }
  | {
      kind: 'matching';
      pairs: Record<number, number>;
      activeTerm: number | null;
      checked: boolean;
    }
  | { kind: 'enum'; entries: string[]; checked: boolean };

export function emptyDraft(item: ExamItem): DraftValue {
  switch (item.format) {
    case 'multiple_choice':
      return { kind: 'choice', picked: null, checked: false };
    case 'true_false':
      return { kind: 'tf', picked: null };
    case 'modified_true_false':
      return { kind: 'mtf', saidTrue: null, wordIndex: null, typed: '', done: false };
    case 'identification':
    case 'fill_blank':
      return { kind: 'typed', text: '', checked: false };
    case 'matching':
      return { kind: 'matching', pairs: {}, activeTerm: null, checked: false };
    case 'enumeration':
      return { kind: 'enum', entries: item.items.map(() => ''), checked: false };
  }
}

/**
 * Whether the student has put anything down worth grading. Switches on the
 * item, not the draft, so a draft left over from another format reads as a
 * blank rather than as an answer to a question it was never about.
 */
export function hasAnswer(item: ExamItem, draft: DraftValue | null): boolean {
  if (!draft) return false;

  switch (item.format) {
    case 'multiple_choice':
      return draft.kind === 'choice' && draft.picked != null;

    case 'true_false':
      return draft.kind === 'tf' && draft.picked != null;

    case 'modified_true_false':
      return draft.kind === 'mtf' && draft.saidTrue != null;

    case 'identification':
    case 'fill_blank':
      return draft.kind === 'typed' && draft.text.trim().length > 0;

    case 'matching':
      return (
        draft.kind === 'matching' &&
        Object.keys(draft.pairs).length === item.terms.length
      );

    case 'enumeration':
      return draft.kind === 'enum' && draft.entries.some((entry) => entry.trim().length > 0);
  }
}

/**
 * Grades a draft. An absent or empty answer is simply wrong — the same
 * result a blank line gets on a real paper.
 */
export function gradeDraft(item: ExamItem, draft: DraftValue | null): boolean {
  if (!draft) return false;

  switch (item.format) {
    case 'multiple_choice':
      return draft.kind === 'choice' && draft.picked === item.correctAnswer;

    case 'true_false':
      return draft.kind === 'tf' && draft.picked === item.isTrue;

    case 'modified_true_false': {
      if (draft.kind !== 'mtf') return false;
      if (item.isTrue) return draft.saidTrue === true;
      return (
        draft.saidTrue === false &&
        draft.wordIndex === item.falseWordIndex &&
        checkAnswer(draft.typed, item.correctWord).correct
      );
    }

    case 'identification':
    case 'fill_blank':
      return draft.kind === 'typed' && checkAnswer(draft.text, item.correctAnswer).correct;

    case 'matching':
      return (
        draft.kind === 'matching' &&
        item.terms.every((_, i) => draft.pairs[i] === item.correctIndexFor[i])
      );

    case 'enumeration':
      return (
        draft.kind === 'enum' &&
        checkEnumeration(draft.entries, item.items, item.ordered).correct
      );
  }
}

// --- plain-text views, for the paper review at the end ------------------

/** The question as one line. */
export function itemPrompt(item: ExamItem): string {
  switch (item.format) {
    case 'multiple_choice':
    case 'identification':
    case 'fill_blank':
    case 'enumeration':
      return item.prompt;
    case 'true_false':
      return item.statement;
    case 'modified_true_false':
      return item.words.join(' ');
    case 'matching':
      return `Match: ${item.terms.join(', ')}`;
  }
}

/** What the right answer was. */
export function correctText(item: ExamItem): string {
  switch (item.format) {
    case 'multiple_choice':
    case 'identification':
    case 'fill_blank':
      return item.correctAnswer;
    case 'true_false':
      return item.isTrue ? 'True' : 'False';
    case 'modified_true_false':
      return item.isTrue
        ? 'True'
        : `False — "${item.words[item.falseWordIndex]}" should be "${item.correctWord}"`;
    case 'matching':
      return item.terms
        .map((term, i) => `${term} → ${item.meanings[item.correctIndexFor[i]]}`)
        .join('; ');
    case 'enumeration':
      return item.items.join(', ');
  }
}

/** What the student put down, or a dash for a blank. */
export function draftText(item: ExamItem, draft: DraftValue | null): string {
  const blank = '—';
  if (!draft) return blank;

  switch (draft.kind) {
    case 'choice':
      return draft.picked ?? blank;
    case 'tf':
      return draft.picked == null ? blank : draft.picked ? 'True' : 'False';
    case 'mtf': {
      if (draft.saidTrue == null) return blank;
      if (draft.saidTrue) return 'True';
      if (item.format !== 'modified_true_false' || draft.wordIndex == null) return 'False';
      return `False — "${item.words[draft.wordIndex]}" → "${draft.typed.trim() || blank}"`;
    }
    case 'typed':
      return draft.text.trim() || blank;
    case 'matching': {
      if (item.format !== 'matching') return blank;
      const pairs = item.terms
        .map((term, i) =>
          draft.pairs[i] == null ? null : `${term} → ${item.meanings[draft.pairs[i]]}`
        )
        .filter(Boolean);
      return pairs.length > 0 ? pairs.join('; ') : blank;
    }
    case 'enum': {
      const written = draft.entries.map((e) => e.trim()).filter(Boolean);
      return written.length > 0 ? written.join(', ') : blank;
    }
  }
}
