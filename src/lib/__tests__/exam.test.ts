import {
  availability,
  buildExam,
  supportedFormats,
  type ExamItem,
  type ModifiedTrueFalseItem,
  type TrueFalseItem,
} from '../exam';
import type { Question, QuestionKind } from '../types';

let counter = 0;
function question(partial: Partial<Question> & { kind: QuestionKind }): Question {
  counter++;
  return {
    id: `q${counter}`,
    deckId: 'note:1',
    position: counter,
    prompt: 'Which term means: a test definition?',
    correctAnswer: 'Osmosis',
    answers: ['Osmosis', 'Mitosis', 'Glycolysis', 'Diffusion'],
    sourceLine: 'Osmosis is a test definition.',
    ordered: false,
    ...partial,
  };
}

const CLOZE = () =>
  question({
    kind: 'cloze',
    prompt: 'Mitochondria produce ______ ATP per glucose molecule.',
    correctAnswer: '36',
    answers: ['36', '27', '45', '54'],
    sourceLine: 'Mitochondria produce 36 ATP per glucose molecule.',
  });

const DEFINITION = () =>
  question({
    kind: 'definition',
    prompt: 'Which term means: the green pigment that absorbs light?',
    correctAnswer: 'Chlorophyll',
    answers: ['Chlorophyll', 'Osmosis', 'Mitosis', 'Glycolysis'],
    sourceLine: 'Chlorophyll: the green pigment that absorbs light',
  });

describe('supportedFormats', () => {
  it('offers typing and matching for a definition', () => {
    const formats = supportedFormats(DEFINITION());
    expect(formats).toEqual(
      expect.arrayContaining(['multiple_choice', 'identification', 'true_false', 'matching'])
    );
  });

  it('offers fill-the-blank and the modified form for a single-word cloze', () => {
    const formats = supportedFormats(CLOZE());
    expect(formats).toEqual(
      expect.arrayContaining([
        'multiple_choice',
        'fill_blank',
        'true_false',
        'modified_true_false',
      ])
    );
  });

  it('withholds modified true/false when the answer spans several words', () => {
    const multi = question({
      kind: 'cloze',
      prompt: 'The ______ never joined the League of Nations.',
      correctAnswer: 'United States',
      answers: ['United States', 'Soviet Union', 'German Empire', 'Ottoman Empire'],
      sourceLine: 'The United States never joined the League of Nations.',
    });
    expect(supportedFormats(multi)).not.toContain('modified_true_false');
    expect(supportedFormats(multi)).toContain('true_false');
  });

  it('lets an enumeration be nothing but an enumeration', () => {
    const list = question({
      kind: 'enumeration',
      prompt: 'List the 4: stages of mitosis',
      correctAnswer: 'Prophase',
      answers: ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'],
    });
    expect(supportedFormats(list)).toEqual(['enumeration']);
  });

  it('gives a trivia question multiple choice only', () => {
    const trivia = question({ kind: 'trivia', sourceLine: null });
    expect(supportedFormats(trivia)).toEqual(['multiple_choice']);
  });
});

describe('availability', () => {
  it('counts each format across the deck', () => {
    const counts = availability([DEFINITION(), DEFINITION(), CLOZE()]);
    expect(counts.multiple_choice).toBe(3);
    expect(counts.identification).toBe(2);
    expect(counts.fill_blank).toBe(1);
    expect(counts.modified_true_false).toBe(1);
  });

  it('reports no matching exercises when there are too few definitions', () => {
    expect(availability([DEFINITION(), CLOZE()]).matching).toBe(0);
  });

  it('bundles definitions into matching exercises', () => {
    const decks = [DEFINITION(), DEFINITION(), DEFINITION(), DEFINITION(), DEFINITION(), DEFINITION()];
    expect(availability(decks).matching).toBe(2);
  });
});

describe('buildExam', () => {
  const DECK = [CLOZE(), CLOZE(), DEFINITION(), DEFINITION(), DEFINITION(), DEFINITION()];

  it('honours the requested counts', () => {
    const items = buildExam(DECK, [{ format: 'multiple_choice', count: 3 }], 'seed-a');
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.format === 'multiple_choice')).toBe(true);
  });

  it('never uses the same question twice in one exam', () => {
    const items = buildExam(
      DECK,
      [
        { format: 'multiple_choice', count: 3 },
        { format: 'true_false', count: 3 },
      ],
      'seed-b'
    );
    const ids = items.map((i) => i.questionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('mixes the formats rather than running them in blocks', () => {
    const items = buildExam(
      DECK,
      [
        { format: 'multiple_choice', count: 3 },
        { format: 'identification', count: 3 },
      ],
      'seed-c'
    );
    const formats = items.map((i) => i.format);
    // At least one adjacent pair should differ if they were shuffled together.
    expect(formats.some((f, i) => i > 0 && f !== formats[i - 1])).toBe(true);
  });

  it('stops early rather than inventing questions it cannot build', () => {
    const items = buildExam([CLOZE()], [{ format: 'multiple_choice', count: 10 }], 'seed-d');
    expect(items).toHaveLength(1);
  });
});

describe('generated statements hold up across seeds', () => {
  const DECK = [CLOZE(), CLOZE(), CLOZE(), DEFINITION(), DEFINITION(), DEFINITION()];
  const SEEDS = Array.from({ length: 25 }, (_, i) => `seed-${i}`);

  function itemsOf<T extends ExamItem>(format: T['format']): T[] {
    return SEEDS.flatMap(
      (s) => buildExam(DECK, [{ format, count: 6 }], s).filter((i) => i.format === format) as T[]
    );
  }

  it('states the truth when a true/false item claims to be true', () => {
    for (const item of itemsOf<TrueFalseItem>('true_false')) {
      if (!item.isTrue) continue;
      const source = DECK.find((q) => q.id === item.questionId);
      expect(item.statement).toContain(source?.correctAnswer);
    }
  });

  it('plants a real decoy when a true/false item claims to be false', () => {
    for (const item of itemsOf<TrueFalseItem>('true_false')) {
      if (item.isTrue) continue;
      const source = DECK.find((q) => q.id === item.questionId);
      // The correct answer must be gone, replaced by one of its own decoys.
      const decoys = source!.answers.filter((a) => a !== source!.correctAnswer);
      expect(decoys.some((d) => item.statement.includes(d))).toBe(true);
    }
  });

  it('points at the swapped word, and only when the statement is false', () => {
    for (const item of itemsOf<ModifiedTrueFalseItem>('modified_true_false')) {
      const source = DECK.find((q) => q.id === item.questionId)!;
      expect(item.correctWord).toBe(source.correctAnswer);

      if (item.isTrue) {
        expect(item.falseWordIndex).toBe(-1);
        continue;
      }

      expect(item.falseWordIndex).toBeGreaterThanOrEqual(0);
      expect(item.falseWordIndex).toBeLessThan(item.words.length);
      const flagged = item.words[item.falseWordIndex].replace(/[.,;:!?]+$/, '');
      // The word we point at is the wrong one, not the right one.
      expect(flagged).not.toBe(item.correctWord);
      expect(source.answers).toContain(flagged);
    }
  });

  it('leaves no blank placeholder in any rendered statement', () => {
    for (const item of itemsOf<TrueFalseItem>('true_false')) {
      expect(item.statement).not.toContain('______');
    }
    for (const item of itemsOf<ModifiedTrueFalseItem>('modified_true_false')) {
      expect(item.words.join(' ')).not.toContain('______');
    }
  });
});
