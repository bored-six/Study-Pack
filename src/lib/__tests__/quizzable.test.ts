import { isQuizzable, availability, supportedFormats } from '../exam';
import { looksLikeIllustration, readsAsStatement } from '../quizzable';
import type { Question, QuestionKind } from '../types';

let n = 0;
function q(partial: Partial<Question> & { kind: QuestionKind }): Question {
  n++;
  return {
    id: `q${n}`,
    deckId: 'note:1',
    position: n,
    prompt: 'Which term means: a definition?',
    correctAnswer: 'Osmosis',
    answers: ['Osmosis', 'Mitosis', 'Glycolysis', 'Diffusion'],
    sourceLine: 'Osmosis is a definition.',
    ordered: false,
    ...partial,
  };
}

describe('predicates', () => {
  it('spots an illustration however it opens', () => {
    expect(looksLikeIllustration('Example: The wind whispered.')).toBe(true);
    expect(looksLikeIllustration('For example, buzz and hiss.')).toBe(true);
    expect(looksLikeIllustration('e.g. deafening silence')).toBe(true);
    expect(looksLikeIllustration('Alliteration repeats sounds.')).toBe(false);
  });

  it('tells a claim from a label', () => {
    expect(readsAsStatement('Glycolysis occurs in the cytoplasm.')).toBe(true);
    expect(readsAsStatement('Osmosis is the movement of water')).toBe(true);
    expect(readsAsStatement('The eight most common figures of speech')).toBe(false);
    expect(readsAsStatement('Key distinctions')).toBe(false);
  });
});

describe('questions that should never reach a student', () => {
  // Exactly what the English deck had stored before the parser learned better.
  const FROM_EXAMPLE = q({
    kind: 'cloze',
    prompt: 'Example: The wind ______ through the alley.',
    correctAnswer: 'whispered',
    answers: ['whispered', 'howled', 'rushed', 'sighed'],
    sourceLine: 'Example: The wind whispered through the alley.',
  });

  const FROM_HEADING = q({
    kind: 'cloze',
    prompt: 'The eight most common ______ of speech',
    correctAnswer: 'figures',
    answers: ['figures', 'sounds', 'terms', 'phrases'],
    sourceLine: 'The eight most common figures of speech',
  });

  it('refuses an example in every format, not just true/false', () => {
    expect(isQuizzable(FROM_EXAMPLE)).toBe(false);
    expect(supportedFormats(FROM_EXAMPLE)).toEqual([]);
  });

  it('refuses a heading in every format', () => {
    expect(isQuizzable(FROM_HEADING)).toBe(false);
    expect(supportedFormats(FROM_HEADING)).toEqual([]);
  });

  it('keeps them out of the counts the builder offers', () => {
    const counts = availability([FROM_EXAMPLE, FROM_HEADING]);
    expect(Object.values(counts).every((c) => c === 0)).toBe(true);
  });
});

describe('questions that should still reach a student', () => {
  const REAL_CLOZE = q({
    kind: 'cloze',
    prompt: 'Alliteration repeats the same initial ______ sound in nearby words.',
    correctAnswer: 'consonant',
    answers: ['consonant', 'vowel', 'stress', 'syllable'],
    sourceLine: 'Alliteration repeats the same initial consonant sound in nearby words.',
  });

  const REAL_DEFINITION = q({
    kind: 'definition',
    prompt: 'Which term means: the green pigment that absorbs light?',
    correctAnswer: 'Chlorophyll',
    answers: ['Chlorophyll', 'Osmosis', 'Mitosis', 'Glycolysis'],
    sourceLine: 'Chlorophyll: the green pigment that absorbs light',
  });

  it('leaves a genuine cloze alone', () => {
    expect(isQuizzable(REAL_CLOZE)).toBe(true);
    expect(supportedFormats(REAL_CLOZE)).toContain('multiple_choice');
    expect(supportedFormats(REAL_CLOZE)).toContain('modified_true_false');
  });

  it('leaves a genuine definition alone', () => {
    expect(isQuizzable(REAL_DEFINITION)).toBe(true);
    expect(supportedFormats(REAL_DEFINITION)).toContain('matching');
  });

  it('keeps an unpunctuated sentence that still makes a claim', () => {
    const noFullStop = q({
      kind: 'cloze',
      prompt: 'Osmosis is the movement of ______ across a membrane',
      correctAnswer: 'water',
      answers: ['water', 'sugar', 'salt', 'protein'],
      sourceLine: 'Osmosis is the movement of water across a membrane',
    });
    expect(isQuizzable(noFullStop)).toBe(true);
  });

  it('leaves enumerations alone', () => {
    const list = q({
      kind: 'enumeration',
      prompt: 'List the 3: types of irony',
      correctAnswer: 'verbal',
      answers: ['verbal', 'situational', 'dramatic'],
      sourceLine: 'The three types of irony are verbal, situational, and dramatic.',
    });
    expect(supportedFormats(list)).toEqual(['enumeration']);
  });
});
