import { availability, supportedFormats } from '../exam';
import { inferRepair } from '../repair';
import type { Question } from '../types';

/** A row as it sits in the database before repair: everything says trivia. */
function stored(prompt: string, correctAnswer: string, answers: string[]): Question {
  return {
    id: `note:1:${prompt.slice(0, 8)}`,
    deckId: 'note:1',
    position: 0,
    prompt,
    correctAnswer,
    answers,
    kind: 'trivia',
    sourceLine: null,
    ordered: false,
  };
}

function repaired(q: Question): Question {
  const fix = inferRepair(q);
  return fix ? { ...q, kind: fix.kind, sourceLine: fix.sourceLine } : q;
}

describe('inferRepair', () => {
  it('recognises a cloze by its blank and rebuilds the sentence', () => {
    const fix = inferRepair({
      prompt: 'Mitochondria produce ______ ATP per glucose molecule.',
      correctAnswer: '36',
    });
    expect(fix).toEqual({
      kind: 'cloze',
      sourceLine: 'Mitochondria produce 36 ATP per glucose molecule.',
    });
  });

  it('recognises a definition and rebuilds a statement containing the term', () => {
    const fix = inferRepair({
      prompt: 'Which term means: the green pigment that absorbs light?',
      correctAnswer: 'Chlorophyll',
    });
    expect(fix?.kind).toBe('definition');
    // true/false swaps the term out of this sentence, so it must be in it.
    expect(fix?.sourceLine).toContain('Chlorophyll');
    expect(fix?.sourceLine).toContain('green pigment');
  });

  it('recognises an acronym definition', () => {
    const fix = inferRepair({
      prompt: 'Which term is short for "adenosine triphosphate"?',
      correctAnswer: 'ATP',
    });
    expect(fix?.kind).toBe('definition');
    expect(fix?.sourceLine).toBe('ATP stands for adenosine triphosphate');
  });

  it('recognises an enumeration', () => {
    const fix = inferRepair({
      prompt: 'List the 3: types of rock',
      correctAnswer: 'Igneous',
    });
    expect(fix).toEqual({ kind: 'enumeration', sourceLine: null });
  });

  it('leaves a genuine trivia question alone', () => {
    expect(
      inferRepair({ prompt: 'What does CPU stand for?', correctAnswer: 'Central Processing Unit' })
    ).toBeNull();
  });
});

describe('repairing a deck saved before the fix', () => {
  // Modelled on real notes: definitions, cloze sentences, one acronym.
  const DECK = [
    stored('Which term means: substituting a related word for the thing meant?', 'Metonymy', [
      'Metonymy',
      'Synecdoche',
      'Euphemism',
      'Litotes',
    ]),
    stored('Which term means: using a part to represent the whole?', 'Synecdoche', [
      'Synecdoche',
      'Metonymy',
      'Litotes',
      'Apostrophe',
    ]),
    stored('Which term means: replacing a harsh expression with a milder one?', 'Euphemism', [
      'Euphemism',
      'Litotes',
      'Metonymy',
      'Apostrophe',
    ]),
    stored('Alliteration repeats the same initial ______ sound in nearby words.', 'consonant', [
      'consonant',
      'vowel',
      'stress',
      'syllable',
    ]),
    stored('A simile always uses like or ______.', 'as', ['as', 'than', 'if', 'so']),
  ];

  it('offers multiple choice and nothing else before repair', () => {
    for (const question of DECK) {
      expect(supportedFormats(question)).toEqual(['multiple_choice']);
    }
    const counts = availability(DECK);
    expect(counts.true_false).toBe(0);
    expect(counts.identification).toBe(0);
    expect(counts.matching).toBe(0);
  });

  it('unlocks every format the notes can support after repair', () => {
    const fixed = DECK.map(repaired);
    const counts = availability(fixed);

    expect(counts.multiple_choice).toBe(5);
    expect(counts.true_false).toBe(5);
    expect(counts.identification).toBe(3); // the three definitions
    expect(counts.fill_blank).toBe(2); // the two cloze sentences
    expect(counts.matching).toBe(1); // three definitions fill one grid
  });

  it('rebuilds cloze sentences with no blank left showing', () => {
    for (const question of DECK.map(repaired)) {
      if (question.kind !== 'cloze') continue;
      expect(question.sourceLine).not.toContain('______');
      expect(question.sourceLine).toContain(question.correctAnswer);
    }
  });
});
