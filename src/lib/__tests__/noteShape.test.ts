import { LIMITS } from '../noteParser';
import { looksLikeDefinition, readShape, shapeAdvice, shapeNeedsReader } from '../noteShape';

describe('reading the shape of a paste', () => {
  it('says nothing about an empty box', () => {
    const shape = readShape('   \n\n  ');
    expect(shape.lines).toBe(0);
    expect(shape.usable).toBe(0);
    expect(shapeAdvice(shape)).toBeNull();
  });

  it('counts non-blank lines, not newlines', () => {
    expect(readShape('one is a fact here.\n\n\ntwo is a fact here.').lines).toBe(2);
  });

  it('recognises the Term: meaning shape', () => {
    const shape = readShape('Chlorophyll: the green pigment that absorbs light');
    expect(shape.definitions).toBe(1);
    expect(shape.usable).toBe(1);
  });

  it('recognises an acronym line, the way the parser does', () => {
    const shape = readShape('ATP stands for adenosine triphosphate');
    expect(shape.definitions).toBe(1);
    expect(shape.usable).toBe(1);
  });

  it('takes a plain factual sentence', () => {
    const shape = readShape('Mitochondria produce 36 ATP per glucose molecule.');
    expect(shape.usable).toBe(1);
    expect(shape.definitions).toBe(0);
  });

  it('sets aside lines too short to hold a fact', () => {
    const shape = readShape('Chapter 4');
    expect(shape.tooShort).toBe(1);
    expect(shape.usable).toBe(0);
  });

  it('sets aside a sentence too long to read on a phone', () => {
    const long = Array.from({ length: LIMITS.maxSentenceWords + 5 }, () => 'word').join(' ') + '.';
    const shape = readShape(long);
    expect(shape.tooLong).toBe(1);
    expect(shape.usable).toBe(0);
  });

  it('sets aside an example, which shows rather than tells', () => {
    const shape = readShape('For example: the wind whispered through the alley');
    expect(shape.illustrations).toBe(1);
    expect(shape.usable).toBe(0);
  });

  it('reads a mixed paste the way the parser will', () => {
    const shape = readShape(
      [
        'Chlorophyll: the green pigment that absorbs light',
        'ATP stands for adenosine triphosphate',
        'Chapter 4',
        'For example: a leaf in summer',
        '',
        'Mitochondria produce 36 ATP per glucose molecule.',
      ].join('\n')
    );
    expect(shape.lines).toBe(5);
    expect(shape.usable).toBe(3);
    // The colon line and the acronym line — both are definitions to the parser.
    expect(shape.definitions).toBe(2);
    expect(shape.tooShort).toBe(1);
    expect(shape.illustrations).toBe(1);
  });
});

describe('a colon is not always a definition', () => {
  it('takes a short term with a real meaning', () => {
    expect(looksLikeDefinition('Osmosis: movement of water across a membrane')).toBe(true);
  });

  it('refuses a colon buried in a long clause', () => {
    expect(
      looksLikeDefinition(
        'There are several reasons why the reaction proceeds slowly in the cold: the enzymes stiffen'
      )
    ).toBe(false);
  });

  it('refuses a trailing colon with nothing after it', () => {
    expect(looksLikeDefinition('Key terms:')).toBe(false);
  });

  it('refuses a one-word meaning, which makes no question', () => {
    expect(looksLikeDefinition('Osmosis: water')).toBe(false);
  });
});

describe('what the box says back', () => {
  it('asks for a usable shape when nothing is usable', () => {
    expect(shapeAdvice(readShape('Chapter 4\nUnit 2'))).toMatch(/short/i);
  });

  it('points at the format when the lines are long enough but say nothing', () => {
    expect(shapeAdvice(readShape('the eight most common figures of speech'))).toMatch(
      /Term: meaning/
    );
  });

  it('warns when most of the paste is unreadably long', () => {
    const long = Array.from({ length: LIMITS.maxSentenceWords + 5 }, () => 'word').join(' ') + '.';
    const advice = shapeAdvice(readShape(`${long}\n${long}\nOsmosis: movement of water here`));
    expect(advice).toMatch(/split/i);
  });

  it('stays quiet when the paste is fine', () => {
    const advice = shapeAdvice(
      readShape(
        [
          'Chlorophyll: the green pigment that absorbs light',
          'Mitochondria produce 36 ATP per glucose molecule.',
        ].join('\n')
      )
    );
    expect(advice).toBeNull();
  });
});

describe('offering a reading before the scan', () => {
  it('stays quiet on plain prose, which the parser handles by cloze', () => {
    // Measured: these five produce three questions with no definition among
    // them. Offering here would spend an allowance on questions Scan gives
    // away, which is why the gate is not "these look like paragraphs".
    const shape = readShape(
      [
        'The war began after a long period of rising tension between the two powers',
        'Trade routes had been contested for decades before anyone put it in writing',
        'What followed was less a single conflict than a series of overlapping ones',
        'The treaty was signed in Paris three years after the first shots were fired',
        'Historians still argue about whether the outcome was ever really in doubt',
      ].join('\n')
    );
    expect(shapeNeedsReader(shape)).toBe(false);
  });

  it('stays quiet on notes that already parse, so no allowance is wasted', () => {
    const shape = readShape(
      [
        'Chlorophyll: the green pigment that absorbs light',
        'Mitochondria produce 36 ATP per glucose molecule.',
        'Osmosis: water moving across a membrane',
        'Ribosome: builds proteins from amino acids',
      ].join('\n')
    );
    expect(shapeNeedsReader(shape)).toBe(false);
  });

  it('stays quiet on an empty box and a single line', () => {
    expect(shapeNeedsReader(readShape(''))).toBe(false);
    expect(shapeNeedsReader(readShape('Cell'))).toBe(false);
  });

  it('offers when the shape read finds nothing askable at all', () => {
    // The same case the advice answers with "rewrite these as Term: meaning".
    const shape = readShape(['Cell', 'Wall', 'Nucleus', 'Golgi'].join('\n'));
    expect(shape.usable).toBe(0);
    expect(shapeNeedsReader(shape)).toBe(true);
    expect(shapeAdvice(shape)).not.toBeNull();
  });

  it('does not offer once even one line is askable', () => {
    const shape = readShape(
      ['Cell', 'Wall', 'Nucleus', 'Osmosis: water moving across a membrane'].join('\n')
    );
    expect(shapeNeedsReader(shape)).toBe(false);
  });
});
