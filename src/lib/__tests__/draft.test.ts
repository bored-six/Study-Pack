import {
  correctText,
  draftText,
  emptyDraft,
  gradeDraft,
  hasAnswer,
  itemPrompt,
  type DraftValue,
} from '../draft';
import type {
  ChoiceItem,
  EnumerationItem,
  ExamItem,
  MatchingItem,
  ModifiedTrueFalseItem,
  TrueFalseItem,
  TypedItem,
} from '../exam';

const CHOICE: ChoiceItem = {
  id: 'q1:mc',
  format: 'multiple_choice',
  questionId: 'q1',
  prompt: 'Which term means: the green pigment?',
  options: ['Chlorophyll', 'Osmosis', 'Mitosis', 'Glycolysis'],
  correctAnswer: 'Chlorophyll',
};

const TF: TrueFalseItem = {
  id: 'q2:tf',
  format: 'true_false',
  questionId: 'q2',
  statement: 'Mitochondria produce 36 ATP per glucose molecule.',
  isTrue: true,
};

const MTF: ModifiedTrueFalseItem = {
  id: 'q3:mtf',
  format: 'modified_true_false',
  questionId: 'q3',
  words: ['Mitochondria', 'produce', '27', 'ATP', 'per', 'glucose', 'molecule.'],
  isTrue: false,
  falseWordIndex: 2,
  correctWord: '36',
};

const TYPED: TypedItem = {
  id: 'q4:id',
  format: 'identification',
  questionId: 'q4',
  prompt: 'Which term means: the green pigment?',
  correctAnswer: 'Chlorophyll',
};

const MATCH: MatchingItem = {
  id: 'match:1',
  format: 'matching',
  questionId: 'q6',
  terms: ['Osmosis', 'Mitosis', 'Glycolysis'],
  meanings: ['breakdown of glucose', 'movement of water', 'cell division'],
  correctIndexFor: [1, 2, 0],
};

const ENUM: EnumerationItem = {
  id: 'q5:enum',
  format: 'enumeration',
  questionId: 'q5',
  prompt: 'List the 3: types of rock',
  items: ['Igneous', 'Sedimentary', 'Metamorphic'],
  ordered: false,
};

const ALL: ExamItem[] = [CHOICE, TF, MTF, TYPED, MATCH, ENUM];

describe('empty drafts', () => {
  it('gives every format a starting point that is neither answered nor correct', () => {
    for (const item of ALL) {
      const draft = emptyDraft(item);
      expect(hasAnswer(item, draft)).toBe(false);
      expect(gradeDraft(item, draft)).toBe(false);
    }
  });

  it('gives enumeration one blank line per expected item', () => {
    const draft = emptyDraft(ENUM) as Extract<DraftValue, { kind: 'enum' }>;
    expect(draft.entries).toHaveLength(ENUM.items.length);
  });

  it('treats a missing draft as a blank, not a crash', () => {
    for (const item of ALL) {
      expect(gradeDraft(item, null)).toBe(false);
      expect(hasAnswer(item, null)).toBe(false);
      expect(draftText(item, null)).toBe('—');
    }
  });

  it('shrugs off a draft that belongs to another format', () => {
    expect(gradeDraft(CHOICE, { kind: 'tf', picked: true })).toBe(false);
    expect(hasAnswer(MATCH, { kind: 'tf', picked: true })).toBe(false);
  });
});

describe('grading', () => {
  it('scores multiple choice on the exact option', () => {
    expect(gradeDraft(CHOICE, { kind: 'choice', picked: 'Chlorophyll', checked: false })).toBe(true);
    expect(gradeDraft(CHOICE, { kind: 'choice', picked: 'Osmosis', checked: false })).toBe(false);
  });

  it('scores true/false on the call', () => {
    expect(gradeDraft(TF, { kind: 'tf', picked: true })).toBe(true);
    expect(gradeDraft(TF, { kind: 'tf', picked: false })).toBe(false);
  });

  it('needs the call, the word and the correction for a modified statement', () => {
    const right: DraftValue = {
      kind: 'mtf',
      saidTrue: false,
      wordIndex: 2,
      typed: '36',
      done: true,
    };
    expect(gradeDraft(MTF, right)).toBe(true);
    expect(gradeDraft(MTF, { ...right, wordIndex: 5 })).toBe(false);
    expect(gradeDraft(MTF, { ...right, typed: '35' })).toBe(false);
    expect(gradeDraft(MTF, { ...right, saidTrue: true })).toBe(false);
  });

  it('needs only the call when a modified statement is genuinely true', () => {
    const trueItem: ModifiedTrueFalseItem = { ...MTF, isTrue: true, falseWordIndex: -1 };
    expect(
      gradeDraft(trueItem, { kind: 'mtf', saidTrue: true, wordIndex: null, typed: '', done: true })
    ).toBe(true);
  });

  it('ignores capitalisation and surrounding space on typed answers', () => {
    expect(gradeDraft(TYPED, { kind: 'typed', text: '  chlorophyll ', checked: true })).toBe(true);
    expect(gradeDraft(TYPED, { kind: 'typed', text: 'chlorophyl', checked: true })).toBe(false);
  });

  it('grades typing on the text alone, whether or not Check was pressed', () => {
    expect(gradeDraft(TYPED, { kind: 'typed', text: 'Chlorophyll', checked: false })).toBe(true);
  });

  it('needs every matching pair right, not most of them', () => {
    const all: DraftValue = {
      kind: 'matching',
      pairs: { 0: 1, 1: 2, 2: 0 },
      activeTerm: null,
      checked: true,
    };
    expect(gradeDraft(MATCH, all)).toBe(true);
    expect(gradeDraft(MATCH, { ...all, pairs: { 0: 1, 1: 0, 2: 2 } })).toBe(false);
    expect(gradeDraft(MATCH, { ...all, pairs: { 0: 1, 1: 2 } })).toBe(false);
  });

  it('accepts an unordered list in any order', () => {
    const draft: DraftValue = {
      kind: 'enum',
      entries: ['metamorphic', 'igneous', 'sedimentary'],
      checked: true,
    };
    expect(gradeDraft(ENUM, draft)).toBe(true);
    expect(gradeDraft({ ...ENUM, ordered: true }, draft)).toBe(false);
  });
});

describe('what counts as answered', () => {
  it('counts a pick, however wrong', () => {
    expect(hasAnswer(CHOICE, { kind: 'choice', picked: 'Osmosis', checked: false })).toBe(true);
    expect(hasAnswer(TF, { kind: 'tf', picked: false })).toBe(true);
  });

  it('counts a modified statement from the moment the call is made', () => {
    expect(
      hasAnswer(MTF, { kind: 'mtf', saidTrue: false, wordIndex: null, typed: '', done: false })
    ).toBe(true);
  });

  it('does not count whitespace as an answer', () => {
    expect(hasAnswer(TYPED, { kind: 'typed', text: '   ', checked: false })).toBe(false);
    expect(hasAnswer(ENUM, { kind: 'enum', entries: [' ', '', ''], checked: false })).toBe(false);
  });

  it('counts a partly filled list, but only a fully paired grid', () => {
    expect(hasAnswer(ENUM, { kind: 'enum', entries: ['Igneous', '', ''], checked: false })).toBe(
      true
    );
    expect(
      hasAnswer(MATCH, { kind: 'matching', pairs: { 0: 1 }, activeTerm: null, checked: false })
    ).toBe(false);
  });
});

describe('the marked paper', () => {
  it('gives every format a prompt and a stated answer', () => {
    for (const item of ALL) {
      expect(itemPrompt(item).length).toBeGreaterThan(0);
      expect(correctText(item).length).toBeGreaterThan(0);
    }
  });

  it('spells out which word was wrong on a modified statement', () => {
    expect(correctText(MTF)).toContain('27');
    expect(correctText(MTF)).toContain('36');
  });

  it('reads back what the student actually put', () => {
    expect(draftText(CHOICE, { kind: 'choice', picked: 'Osmosis', checked: false })).toBe('Osmosis');
    expect(draftText(TF, { kind: 'tf', picked: false })).toBe('False');
    expect(draftText(TYPED, { kind: 'typed', text: ' chlorophyl ', checked: true })).toBe(
      'chlorophyl'
    );
    expect(
      draftText(ENUM, { kind: 'enum', entries: ['Igneous', '', 'Metamorphic'], checked: true })
    ).toBe('Igneous, Metamorphic');
  });

  it('shows the word swap a student proposed', () => {
    const said = draftText(MTF, {
      kind: 'mtf',
      saidTrue: false,
      wordIndex: 2,
      typed: '35',
      done: true,
    });
    expect(said).toContain('27');
    expect(said).toContain('35');
  });

  it('shows only the pairs that were actually made', () => {
    const said = draftText(MATCH, {
      kind: 'matching',
      pairs: { 0: 1 },
      activeTerm: null,
      checked: false,
    });
    expect(said).toBe('Osmosis → movement of water');
  });
});
