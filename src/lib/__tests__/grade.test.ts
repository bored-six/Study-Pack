import { checkAnswer, checkEnumeration, looseAnswer, normalizeAnswer } from '../grade';

describe('normalizeAnswer', () => {
  it('strips case, padding, quotes and trailing punctuation', () => {
    expect(normalizeAnswer('  Mitochondria.  ')).toBe('mitochondria');
    expect(normalizeAnswer('"Osmosis"')).toBe('osmosis');
  });

  it('drops a leading article', () => {
    expect(normalizeAnswer('the cytoplasm')).toBe('cytoplasm');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeAnswer('United   States')).toBe('united states');
  });
});

describe('checkAnswer', () => {
  it('ignores capitalisation', () => {
    expect(checkAnswer('mitochondria', 'Mitochondria').correct).toBe(true);
    expect(checkAnswer('MITOCHONDRIA', 'Mitochondria').correct).toBe(true);
  });

  it('counts a misspelling as wrong', () => {
    expect(checkAnswer('mitochondira', 'Mitochondria').correct).toBe(false);
  });

  it('flags a misspelling as a near miss so the student sees the slip', () => {
    expect(checkAnswer('mitochondira', 'Mitochondria').nearMiss).toBe(true);
    expect(checkAnswer('chlorophyl', 'Chlorophyll').nearMiss).toBe(true);
  });

  it('does not call a genuinely different answer a near miss', () => {
    expect(checkAnswer('osmosis', 'Mitochondria').nearMiss).toBe(false);
  });

  it('requires numbers to be exact, with no near miss', () => {
    expect(checkAnswer('35', '36').correct).toBe(false);
    expect(checkAnswer('35', '36').nearMiss).toBe(false);
    expect(checkAnswer('36', '36').correct).toBe(true);
  });

  it('rejects an empty answer', () => {
    expect(checkAnswer('   ', 'Mitochondria').correct).toBe(false);
  });
});

describe('checkEnumeration', () => {
  const ITEMS = ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'];

  it('accepts every item in any order when order does not matter', () => {
    const result = checkEnumeration(['telophase', 'anaphase', 'prophase', 'metaphase'], ITEMS);
    expect(result.correct).toBe(true);
    expect(result.matchedCount).toBe(4);
  });

  it('marks the run incomplete when an item is missing', () => {
    const result = checkEnumeration(['prophase', 'metaphase', 'anaphase'], ITEMS);
    expect(result.correct).toBe(false);
    expect(result.matchedCount).toBe(3);
    expect(result.results[3].matched).toBeNull();
  });

  it('will not let one answer fill two slots', () => {
    const result = checkEnumeration(['prophase', 'prophase', 'prophase', 'prophase'], ITEMS);
    expect(result.matchedCount).toBe(1);
  });

  it('reports a misspelled item as a near miss, not a match', () => {
    const result = checkEnumeration(['prophase', 'metaphse', 'anaphase', 'telophase'], ITEMS);
    expect(result.matchedCount).toBe(3);
    expect(result.results[1].nearMiss).toBe(true);
  });

  it('enforces position when the list is ordered', () => {
    const jumbled = checkEnumeration(
      ['metaphase', 'prophase', 'anaphase', 'telophase'],
      ITEMS,
      true
    );
    expect(jumbled.correct).toBe(false);

    const inOrder = checkEnumeration(
      ['prophase', 'metaphase', 'anaphase', 'telophase'],
      ITEMS,
      true
    );
    expect(inOrder.correct).toBe(true);
  });
});

describe('padding a list', () => {
  const ITEMS = ['Prophase', 'Metaphase', 'Anaphase', 'Telophase'];

  it('does not score full marks for listing everything in the notes', () => {
    // The shotgun answer: name every phase you can think of and let the
    // marker pick out the four that count. Every expected item is found, so
    // this used to come back correct.
    const result = checkEnumeration(
      ['prophase', 'metaphase', 'anaphase', 'telophase', 'mitosis', 'cytokinesis', 'interphase'],
      ITEMS
    );
    expect(result.matchedCount).toBe(4);
    expect(result.extras).toEqual(['mitosis', 'cytokinesis', 'interphase']);
    expect(result.correct).toBe(false);
  });

  it('still passes a clean answer', () => {
    const result = checkEnumeration(['prophase', 'metaphase', 'anaphase', 'telophase'], ITEMS);
    expect(result.extras).toEqual([]);
    expect(result.correct).toBe(true);
  });

  it('does not count the blank boxes the form hands out', () => {
    // One empty input per item is the starting state of every list question.
    const result = checkEnumeration(['prophase', '', '  ', ''], ITEMS);
    expect(result.extras).toEqual([]);
    expect(result.matchedCount).toBe(1);
  });

  it('counts a repeated answer as padding rather than as an attempt', () => {
    const result = checkEnumeration(['prophase', 'prophase', 'prophase', 'prophase'], ITEMS);
    expect(result.matchedCount).toBe(1);
    expect(result.extras).toHaveLength(3);
  });

  it('does not treat a wrong answer in its own slot as padding', () => {
    // Writing the wrong thing in box 2 is a wrong answer, not an extra one.
    const result = checkEnumeration(['prophase', 'telophase', 'anaphase', 'metaphase'], ITEMS, true);
    expect(result.extras).toEqual([]);
    expect(result.correct).toBe(false);
  });

  it('counts entries past the end of an ordered list', () => {
    const result = checkEnumeration(
      ['prophase', 'metaphase', 'anaphase', 'telophase', 'cytokinesis'],
      ITEMS,
      true
    );
    expect(result.extras).toEqual(['cytokinesis']);
    expect(result.correct).toBe(false);
  });
});

describe('the same answer, written differently', () => {
  it('accepts singular against plural, and agreement with it', () => {
    // The note said "Hearts pump blood"; the student wrote what they knew.
    expect(checkAnswer('Heart pumps blood', 'Hearts pump blood').correct).toBe(true);
    expect(checkAnswer('Brain controls body functions', 'brains control body functions').correct).toBe(
      true
    );
    expect(checkAnswer('Lungs absorb Oxygen', 'lungs absorb oxygen').correct).toBe(true);
  });

  it('still refuses a different word that happens to be close', () => {
    expect(checkAnswer('meiosis', 'mitosis').correct).toBe(false);
    expect(checkAnswer('kinetic', 'potential').correct).toBe(false);
  });

  it('leaves a double s alone, so "glass" is not "glas"', () => {
    expect(looseAnswer('glass jars')).toBe('glass jar');
  });

  it('does not strip the s off a short word', () => {
    expect(looseAnswer('gas is')).toBe('gas is');
  });

  it('keeps numbers exact', () => {
    expect(checkAnswer('35', '36').correct).toBe(false);
  });
});

describe('an ampersand the note used to save space', () => {
  it('accepts "and" where the note wrote "&"', () => {
    expect(checkAnswer('Earth and Space', 'Earth & Space').correct).toBe(true);
    expect(checkAnswer('Earth & Space', 'Earth and Space').correct).toBe(true);
  });

  it('does not make different answers equal', () => {
    expect(checkAnswer('Earth and Water', 'Earth & Space').correct).toBe(false);
  });

  it('handles it with no spaces around it', () => {
    expect(checkAnswer('supply and demand', 'Supply&Demand').correct).toBe(true);
  });
});
