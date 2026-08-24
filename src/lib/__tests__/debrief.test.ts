import { buildDebrief, classifyMiss, type SittingResult, type SlipKind } from '../debrief';
import type { DraftValue } from '../draft';
import type {
  ChoiceItem,
  EnumerationItem,
  ExamItem,
  MatchingItem,
  ModifiedTrueFalseItem,
  TypedItem,
} from '../exam';
import type { AnswerRecord } from '../mastery';

const NOW = new Date(2026, 7, 24, 12).getTime();
const DAY = 86_400_000;

// --- item builders ------------------------------------------------------

function choice(id: string, questionId = id): ChoiceItem {
  return {
    id,
    questionId,
    format: 'multiple_choice',
    prompt: 'Capital of France?',
    options: ['Paris', 'Lyon', 'Nice', 'Brest'],
    correctAnswer: 'Paris',
  };
}

function typed(id: string, questionId = id): TypedItem {
  return {
    id,
    questionId,
    format: 'identification',
    prompt: 'The powerhouse of the cell',
    correctAnswer: 'mitochondria',
  };
}

function enumeration(id: string, questionId = id): EnumerationItem {
  return {
    id,
    questionId,
    format: 'enumeration',
    prompt: 'Name the three branches',
    items: ['executive', 'legislative', 'judicial'],
    ordered: false,
  };
}

function matching(id: string, questionId = id): MatchingItem {
  return {
    id,
    questionId,
    format: 'matching',
    terms: ['alpha', 'beta'],
    meanings: ['first', 'second'],
    correctIndexFor: [0, 1],
  };
}

function mtf(id: string, questionId = id): ModifiedTrueFalseItem {
  return {
    id,
    questionId,
    format: 'modified_true_false',
    words: ['Water', 'boils', 'at', 'ninety', 'degrees'],
    isTrue: false,
    falseWordIndex: 3,
    correctWord: 'hundred',
  };
}

// --- result builders ----------------------------------------------------

function result(item: ExamItem, correct: boolean, slip: SlipKind | null = null): SittingResult {
  return { itemId: item.id, format: item.format, correct, slip: correct ? null : slip };
}

function sitting(
  items: ExamItem[],
  correctness: boolean[],
  slip: SlipKind = 'wrong'
): SittingResult[] {
  return items.map((item, i) => result(item, correctness[i], slip));
}

function answered(questionId: string, correct: boolean, daysAgo = 2): AnswerRecord {
  return { questionId, correct, answeredAt: NOW - daysAgo * DAY };
}

function read(over: Partial<Parameters<typeof buildDebrief>[0]> = {}) {
  const items = over.items ?? [];
  return buildDebrief({
    mode: 'relaxed',
    items,
    results: [],
    history: [],
    // Generous by default, so nothing reads as rushed unless a test says so.
    durationMs: Math.max(1, (over.results?.length ?? items.length)) * 30_000,
    now: NOW,
    ...over,
  });
}

// --- how a mark was lost ------------------------------------------------

describe('classifyMiss', () => {
  it('calls an empty answer blank', () => {
    const draft: DraftValue = { kind: 'typed', text: '   ', checked: true };
    expect(classifyMiss(typed('q1'), draft)).toBe('blank');
    expect(classifyMiss(choice('q2'), null)).toBe('blank');
  });

  it('blames the clock ahead of anything else', () => {
    expect(classifyMiss(choice('q1'), null, true)).toBe('timeout');
  });

  it('separates a misspelling from a different answer', () => {
    const near: DraftValue = { kind: 'typed', text: 'mitochondia', checked: true };
    const other: DraftValue = { kind: 'typed', text: 'ribosome', checked: true };
    expect(classifyMiss(typed('q1'), near)).toBe('spelling');
    expect(classifyMiss(typed('q1'), other)).toBe('wrong');
  });

  it('notices part of a list', () => {
    const some: DraftValue = { kind: 'enum', entries: ['executive', 'wrong'], checked: true };
    const none: DraftValue = { kind: 'enum', entries: ['nope', 'nada'], checked: true };
    expect(classifyMiss(enumeration('q1'), some)).toBe('partial');
    expect(classifyMiss(enumeration('q1'), none)).toBe('wrong');
  });

  it('notices part of a matching set', () => {
    const half: DraftValue = {
      kind: 'matching',
      pairs: { 0: 0, 1: 0 },
      activeTerm: null,
      checked: true,
    };
    expect(classifyMiss(matching('q1'), half)).toBe('partial');
  });

  it('credits catching a false statement even when the word is wrong', () => {
    const wordWrong: DraftValue = {
      kind: 'mtf',
      saidTrue: false,
      wordIndex: 1,
      typed: 'freezes',
      done: true,
    };
    const readItTrue: DraftValue = {
      kind: 'mtf',
      saidTrue: true,
      wordIndex: null,
      typed: '',
      done: true,
    };
    expect(classifyMiss(mtf('q1'), wordWrong)).toBe('halfway');
    expect(classifyMiss(mtf('q1'), readItTrue)).toBe('wrong');
  });

  it('treats a nearly-spelled correction as spelling', () => {
    const draft: DraftValue = {
      kind: 'mtf',
      saidTrue: false,
      wordIndex: 3,
      typed: 'hundrd',
      done: true,
    };
    expect(classifyMiss(mtf('q1'), draft)).toBe('spelling');
  });
});

// --- the note itself ----------------------------------------------------

describe('buildDebrief', () => {
  it('says nothing at all about a sitting with no answers', () => {
    const debrief = read();
    expect(debrief.wrong).toEqual([]);
    expect(debrief.strengths).toEqual([]);
    expect(debrief.weaknesses).toEqual([]);
    expect(debrief.next.action).toBe('none');
  });

  it('invents nothing when a clean paper has nothing to fault', () => {
    const items = [choice('a'), choice('b'), choice('c'), choice('d'), choice('e')];
    const debrief = read({ items, results: sitting(items, [true, true, true, true, true]) });

    expect(debrief.headline).toBe('Nothing left to mark.');
    expect(debrief.wrong).toEqual([]);
    expect(debrief.weaknesses).toEqual([]);
    expect(debrief.next.title).toBe('Leave it a day');
  });

  it('names the format the marks went to, and sends them at it', () => {
    const mc = [choice('m1'), choice('m2'), choice('m3'), choice('m4')];
    const fb = [typed('f1'), typed('f2'), typed('f3'), typed('f4')];
    const debrief = read({
      items: [...mc, ...fb],
      results: [
        ...sitting(mc, [true, true, true, true]),
        ...sitting(fb, [true, false, false, false]),
      ],
    });

    expect(debrief.weaknesses.map((n) => n.id)).toContain('format:identification');
    expect(debrief.weaknesses[0].text).toContain('1/4');
    expect(debrief.strengths.map((n) => n.id)).toContain('format:multiple_choice');
    expect(debrief.next.action).toBe('format');
    expect(debrief.next.format).toBe('identification');
  });

  it('leads with the mistake that cost the most, not the first one it finds', () => {
    const items = [typed('a'), typed('b'), typed('c'), typed('d')];
    const debrief = read({
      items,
      results: [
        result(items[0], true),
        result(items[1], false, 'spelling'),
        result(items[2], false, 'spelling'),
        result(items[3], false, 'blank'),
      ],
    });

    // Two spellings outrank one blank — and both outrank "they were new",
    // which is context rather than a mistake to fix.
    expect(debrief.wrong).toHaveLength(1);
    expect(debrief.wrong[0].id).toBe('spelling');
    expect(debrief.wrong[0].text).toContain('2');
    // Two spelling slips is advice about writing, not about drilling.
    expect(debrief.next.title).toBe('Write the answers, do not just read them');
  });

  it('sends a paper full of blanks and timeouts back without a clock', () => {
    const items = [choice('a'), choice('b'), choice('c'), choice('d'), choice('e')];
    const debrief = read({
      mode: 'rapid',
      items,
      results: [
        result(items[0], true),
        result(items[1], false, 'timeout'),
        result(items[2], false, 'timeout'),
        result(items[3], false, 'blank'),
        result(items[4], true),
      ],
    });

    expect(debrief.wrong[0].id).toBe('timeout');
    expect(debrief.next.action).toBe('relaxed');
  });

  it('reads this sitting against what the student knew walking in', () => {
    const items = [choice('a'), choice('b'), choice('c'), choice('d')];
    const history: AnswerRecord[] = [
      answered('a', false), // missed before, right today  → fixed
      answered('b', false), // missed before, missed again → repeat
      answered('c', false), // missed before, missed again → repeat
      answered('d', true), // had it, lost it              → slipped
    ];
    const debrief = read({
      items,
      results: sitting(items, [true, false, false, false]),
      history,
    });

    expect(debrief.strengths[0].text).toBe('1 you had missed before came back right.');
    expect(debrief.weaknesses[0].text).toContain('2 have now caught you');
    expect(debrief.next.action).toBe('relaxed');
  });

  it('judges a repeated question on the first answer, not the one it ends on', () => {
    const item = choice('a');
    const history = [answered('a', false)];
    // Mastery keeps asking until it is right; that last right answer must
    // not read as "fixed", or every mastery sitting would claim it.
    const debrief = read({
      mode: 'mastery',
      items: [item],
      results: [result(item, false, 'wrong'), result(item, true), result(item, true)],
      history,
    });

    expect(debrief.strengths.find((n) => n.id === 'fixed')).toBeUndefined();
    expect(JSON.stringify(debrief)).not.toContain('came back right');
  });

  it('spots a paper that fell apart at the back', () => {
    const items = Array.from({ length: 10 }, (_, i) => choice(`q${i}`));
    const debrief = read({
      items,
      results: sitting(items, [
        true, true, true, true, true,
        false, false, false, false, true,
      ]),
    });

    const fade = debrief.weaknesses.find((n) => n.id === 'fade');
    expect(fade?.text).toContain('Back half 1/5');
    expect(fade?.text).toContain('5/5 at the front');
  });

  it('only calls it a fade when the front half held up', () => {
    const items = Array.from({ length: 8 }, (_, i) => choice(`q${i}`));
    const debrief = read({
      items,
      // A hard paper throughout, not a paper that fell apart at the back.
      results: sitting(items, [true, false, true, false, false, false, false, false]),
    });

    expect(debrief.weaknesses.find((n) => n.id === 'fade')).toBeUndefined();
  });

  it('does not talk about halves of a paper that loops', () => {
    const items = Array.from({ length: 10 }, (_, i) => choice(`q${i}`));
    const debrief = read({
      mode: 'survival',
      items,
      results: sitting(items, [
        true, true, true, true, true,
        false, false, false, false, true,
      ]),
    });

    expect(debrief.weaknesses.find((n) => n.id === 'fade')).toBeUndefined();
    expect(debrief.headline).toBe('Short one. Go again.');
  });

  it('counts the extra passes a mastery pile took to clear', () => {
    const items = [choice('a'), choice('b')];
    const debrief = read({
      mode: 'mastery',
      items,
      results: [
        result(items[0], false, 'wrong'),
        result(items[1], true),
        result(items[0], true),
        result(items[0], true),
        result(items[1], true),
      ],
    });

    expect(debrief.headline).toBe('The pile is empty.');
    expect(debrief.weaknesses[0].text).toBe('3 extra passes to clear the pile.');
  });

  it('reads a low score on new questions as a first pass, not a failure', () => {
    const items = [choice('a'), choice('b'), choice('c'), choice('d')];
    const debrief = read({ items, results: sitting(items, [true, false, false, false]) });

    expect(debrief.headline).toBe('First pass on new ground.');
    expect(debrief.wrong.map((n) => n.id)).toContain('fresh');
  });

  it('keeps a rushed paper honest about the pace', () => {
    const items = Array.from({ length: 8 }, (_, i) => choice(`q${i}`));
    const debrief = read({
      items,
      results: sitting(items, [true, true, true, false, false, false, false, false]),
      durationMs: 8 * 3000,
    });

    expect(debrief.wrong.find((n) => n.id === 'rushed')?.text).toContain('3s');
  });

  it('counts questions, not the repeat answers a mode asks for', () => {
    const items = [choice('a'), choice('b')];
    const debrief = read({
      mode: 'mastery',
      items,
      // Five answers to two questions: any format read over all of them
      // would be arithmetic about the mode, not about the student.
      results: [
        result(items[0], false, 'wrong'),
        result(items[1], true),
        result(items[0], true),
        result(items[0], true),
        result(items[1], true),
      ],
    });

    expect(debrief.strengths.find((n) => n.id.startsWith('format'))).toBeUndefined();
    expect(JSON.stringify(debrief)).not.toContain('4/5');
  });

  it('does not read a clock problem as a knowledge problem', () => {
    const items = Array.from({ length: 6 }, (_, i) => choice(`q${i}`));
    const debrief = read({
      mode: 'rapid',
      items,
      results: [
        result(items[0], true),
        result(items[1], false, 'timeout'),
        result(items[2], false, 'timeout'),
        result(items[3], false, 'timeout'),
        result(items[4], false, 'blank'),
        result(items[5], true),
      ],
    });

    const ids = debrief.wrong.map((n) => n.id);
    expect(ids).toContain('timeout');
    // Both of these would be talking about questions nobody answered.
    expect(ids).not.toContain('gaps');
    expect(ids).not.toContain('fresh');
  });

  it('keeps every section to one line, however much it could say', () => {
    const items = Array.from({ length: 12 }, (_, i) => typed(`q${i}`));
    const history = items.map((item) => answered(item.questionId, false));
    const debrief = read({
      items,
      results: items.map((item, i) =>
        result(item, false, (['blank', 'spelling', 'partial', 'halfway'] as SlipKind[])[i % 4])
      ),
      history,
      durationMs: 12 * 2000,
    });

    expect(debrief.wrong.length).toBeLessThanOrEqual(1);
    expect(debrief.strengths.length).toBeLessThanOrEqual(1);
    expect(debrief.weaknesses.length).toBeLessThanOrEqual(1);
  });
});
