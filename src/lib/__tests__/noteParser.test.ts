import { LIMITS, parseNotes, rebuildOptions } from '../noteParser';

/** Convenience: parse and return prompts only. */
function prompts(notes: string): string[] {
  return parseNotes(notes).questions.map((q) => q.prompt);
}

function answerFor(notes: string, contains: string): string | undefined {
  return parseNotes(notes).questions.find((q) => q.prompt.includes(contains))?.correctAnswer;
}

describe('definition patterns', () => {
  it('reads "Term: meaning" and makes the term the answer', () => {
    const notes = `Chlorophyll: the green pigment that absorbs light
      Osmosis: movement of water across a semipermeable membrane
      Glycolysis: breakdown of glucose into pyruvate
      Diffusion: spreading of particles down a concentration gradient`;
    const chlorophyll = parseNotes(notes).questions.find(
      (q) => q.correctAnswer === 'Chlorophyll'
    );
    expect(chlorophyll?.kind).toBe('definition');
    expect(chlorophyll?.prompt).toContain('green pigment');
  });

  it('reads "X is Y"', () => {
    const notes = `Photosynthesis is the process by which plants convert light to energy.
      Osmosis: movement of water across a membrane
      Diffusion: spreading of particles from high to low concentration
      Glycolysis: breakdown of glucose into pyruvate
      Respiration: release of energy from glucose inside the cell`;
    expect(answerFor(notes, 'convert light')).toBe('Photosynthesis');
  });

  it('reads "X stands for Y" with acronym phrasing', () => {
    const notes = `ATP stands for adenosine triphosphate
      DNA stands for deoxyribonucleic acid
      RNA stands for ribonucleic acid
      ADP stands for adenosine diphosphate`;
    const { questions } = parseNotes(notes);
    const atp = questions.find((q) => q.correctAnswer === 'ATP');
    expect(atp?.prompt).toContain('short for');
  });

  it('reads "=" and spaced-dash forms', () => {
    const notes = `Osmosis = the movement of water across a semipermeable membrane
      Mitosis - cell division producing two identical daughter cells
      Meiosis: cell division producing four genetically distinct cells
      Diffusion: passive movement down a concentration gradient`;
    const answers = parseNotes(notes).questions.map((q) => q.correctAnswer);
    expect(answers).toContain('Osmosis');
    expect(answers).toContain('Mitosis');
  });

  it('does not treat a pronoun subject as a definable term', () => {
    expect(prompts('It is the most important part of the whole process.')).not.toContain(
      expect.stringContaining('Which term means')
    );
    const { questions } = parseNotes('It is the most important part of the whole process.');
    expect(questions.every((q) => q.correctAnswer.toLowerCase() !== 'it')).toBe(true);
  });

  it('rejects passive phrasing that only looks like a definition', () => {
    const { questions } = parseNotes(
      'Enzyme kinetics is described by the Michaelis-Menten equation in most textbooks.'
    );
    expect(questions.every((q) => q.kind !== 'definition')).toBe(true);
  });

  it('rejects negated statements', () => {
    const { questions } = parseNotes('Viruses are not considered living organisms by most biologists.');
    expect(questions.every((q) => q.kind !== 'definition')).toBe(true);
  });
});

describe('cloze deletion', () => {
  it('blanks a number and keeps the sentence readable', () => {
    const { questions } = parseNotes('Mitochondria produce 36 ATP per glucose molecule.');
    expect(questions).toHaveLength(1);
    expect(questions[0].correctAnswer).toBe('36');
    expect(questions[0].prompt).toBe('Mitochondria produce ______ ATP per glucose molecule.');
  });

  it('preserves punctuation that followed the blanked word', () => {
    const { questions } = parseNotes(
      'The Treaty of Versailles was signed in 1919, formally ending the war.'
    );
    expect(questions[0].prompt).toContain('______,');
  });

  it('captures multi-word proper nouns as one answer', () => {
    const notes = `The League of Nations was created but the United States never joined it.
      Adolf Hitler became Chancellor of Germany in 1933.
      The Treaty of Versailles ended the First World War.
      Winston Churchill opposed the policy of appeasement.`;
    const { questions } = parseNotes(notes);
    expect(questions.map((q) => q.correctAnswer)).toContain('United States');
  });

  it('never blanks the first word of a sentence', () => {
    const { questions } = parseNotes('Glycolysis takes place inside the cytoplasm of the cell.');
    expect(questions.every((q) => !q.prompt.startsWith('______'))).toBe(true);
  });
});

describe('examples are demonstrations, not facts', () => {
  const NOTES = `Alliteration repeats the same initial consonant sound in nearby words. Example: Peter picked a peck of pickled peppers.
    Onomatopoeia uses words that imitate the sound they describe. Example: buzz, clang, hiss.
    Oxymoron places two contradictory terms side by side. Example: deafening silence.
    Metonymy: substituting a related word for the thing meant
    Synecdoche: using a part to represent the whole`;

  it('never quizzes the contents of an example sentence', () => {
    for (const q of parseNotes(NOTES).questions) {
      expect(q.prompt).not.toMatch(/^Example/i);
      expect(q.correctAnswer).not.toBe('Peter');
    }
  });

  it('says why, when a line is nothing but an example', () => {
    const { questions, stats } = parseNotes(
      `Alliteration: repeating the same initial consonant sound
       Example: Peter picked a peck of pickled peppers.
       Assonance: repeating vowel sounds inside words
       Consonance: repeating consonant sounds at the end of words`
    );
    expect(questions.every((q) => q.correctAnswer !== 'Peter')).toBe(true);
    expect(stats.skipped.some((s) => s.reason === 'illustration')).toBe(true);
  });

  it('still quizzes the fact the example was illustrating', () => {
    const answers = parseNotes(NOTES).questions.map((q) => q.correctAnswer);
    expect(answers).toContain('consonant');
  });

  it('cuts a trailing example out of a definition', () => {
    const notes = `Hyperbole is deliberate exaggeration used for emphasis. Example: I have told you a million times.
      Oxymoron: two contradictory terms placed side by side
      Simile: a comparison using like or as
      Metaphor: a comparison stating one thing is another`;
    const hyperbole = parseNotes(notes).questions.find((q) => q.correctAnswer === 'Hyperbole');
    expect(hyperbole?.prompt).toContain('deliberate exaggeration');
    expect(hyperbole?.prompt).not.toMatch(/example/i);
    expect(hyperbole?.prompt).not.toContain('million');
  });
});

describe('rejecting unquizzable input', () => {
  it('returns nothing for vague prose with no facts', () => {
    const { questions } = parseNotes(`notes
      today we talked about stuff
      it is important
      ???`);
    expect(questions).toHaveLength(0);
  });

  it('skips headings', () => {
    const { questions } = parseNotes('Chapter 4: Cellular Respiration');
    expect(questions).toHaveLength(0);
  });

  it('skips lines shorter than the minimum and says why', () => {
    const { stats } = parseNotes('Cells\nDNA\nok');
    expect(stats.linesUsed).toBe(0);
    expect(stats.skipped).toHaveLength(3);
    expect(stats.skipped.every((s) => s.reason === 'too_short')).toBe(true);
  });

  it('reports a heading as skipped with the heading reason', () => {
    const { stats } = parseNotes('Chapter 4: Cellular Respiration');
    expect(stats.skipped[0]).toMatchObject({ reason: 'heading' });
  });

  it('keeps the original text of every skipped line', () => {
    const { stats } = parseNotes('today we talked about stuff and things');
    expect(stats.skipped[0].text).toBe('today we talked about stuff and things');
  });

  it('skips sentences too long to read on a phone', () => {
    const long = `The ${'very '.repeat(40)}long Mitochondria sentence continues past any reasonable limit.`;
    const { questions } = parseNotes(long);
    expect(questions).toHaveLength(0);
  });
});

describe('answer options', () => {
  const NOTES = `Photosynthesis is the process by which plants convert light into energy.
    Chlorophyll: the green pigment that absorbs light
    Osmosis = the movement of water across a semipermeable membrane
    Mitosis - cell division producing two identical daughter cells
    Glycolysis takes place in the cytoplasm of the cell.
    Mitochondria produce 36 ATP per glucose molecule.`;

  it('always offers exactly four distinct options', () => {
    for (const q of parseNotes(NOTES).questions) {
      expect(q.answers).toHaveLength(4);
      expect(new Set(q.answers).size).toBe(4);
    }
  });

  it('always includes the correct answer among the options', () => {
    for (const q of parseNotes(NOTES).questions) {
      expect(q.answers).toContain(q.correctAnswer);
    }
  });

  it('never offers a bare number as a decoy for a word answer', () => {
    for (const q of parseNotes(NOTES).questions) {
      if (/^\d+$/.test(q.correctAnswer)) continue;
      expect(q.answers.every((a) => !/^\d+$/.test(a))).toBe(true);
    }
  });

  it('offers numeric decoys for a numeric answer', () => {
    const { questions } = parseNotes('Mitochondria produce 36 ATP per glucose molecule.');
    expect(questions[0].answers.every((a) => /^\d+$/.test(a))).toBe(true);
  });

  it('never offers options that contain one another', () => {
    for (const q of parseNotes(NOTES).questions) {
      for (const a of q.answers) {
        const others = q.answers.filter((o) => o !== a);
        expect(
          others.some(
            (o) =>
              o.toLowerCase().includes(a.toLowerCase()) ||
              a.toLowerCase().includes(o.toLowerCase())
          )
        ).toBe(false);
      }
    }
  });

  it('drops a question when three believable decoys cannot be found', () => {
    // A single fact in isolation has no sibling terms to draw decoys from.
    const { questions, stats } = parseNotes(
      'Photosynthesis is the process that plants use for energy.'
    );
    expect(questions).toHaveLength(0);
    expect(stats.skipped.filter((s) => s.reason === 'no_options')).toHaveLength(1);
  });
});

describe('one answer, once', () => {
  it('does not ask two questions with the same right answer', () => {
    // Two different sentences, both landing on Germany. In a ten-question
    // quiz the second is free once you have seen the first.
    const { questions } = parseNotes(
      [
        'The Treaty of Versailles was signed by Germany in 1919.',
        'The Weimar Republic governed Germany after the war.',
        'Reparations were the payments demanded from Germany.',
        'Hyperinflation destroyed the value of the mark in 1923.',
        'The Reichstag was the parliament of the German state.',
      ].join('\n')
    );

    const answers = questions.map((q) => q.correctAnswer.toLowerCase());
    expect(new Set(answers).size).toBe(answers.length);
  });

  it('says why the repeat was dropped', () => {
    const { stats } = parseNotes(
      [
        'The Treaty of Versailles was signed by Germany in 1919.',
        'The Weimar Republic governed Germany after the war.',
        'Reparations were the payments demanded from Germany.',
        'Hyperinflation destroyed the value of the mark in 1923.',
        'The Reichstag was the parliament of the German state.',
      ].join('\n')
    );
    expect(stats.skipped.some((skip) => skip.reason === 'duplicate')).toBe(true);
  });

  it('leaves a set with no repeats alone', () => {
    // The same notes with the second Germany sentence taken out: nothing
    // here shares an answer, so nothing should be dropped for sharing one.
    const { questions, stats } = parseNotes(
      [
        'The Treaty of Versailles was signed by Germany in 1919.',
        'Hyperinflation destroyed the value of the mark in 1923.',
        'The Reichstag was the parliament of the German state.',
      ].join('\n')
    );
    expect(questions.length).toBe(3);
    expect(stats.skipped.some((skip) => skip.reason === 'duplicate')).toBe(false);
  });
});

describe('a list item is a list item, however the list was written', () => {
  const ITEMS = ['Hearts pump blood', 'lungs absorb oxygen', 'brains control body functions'];

  it('drops the conjunction from a bulleted list', () => {
    const { questions } = parseNotes(
      'Human Body Basics:\n- Hearts pump blood\n- lungs absorb oxygen\n- and brains control body functions'
    );
    expect(questions[0].answers).toEqual(ITEMS);
  });

  it('drops it from a numbered list too', () => {
    const { questions } = parseNotes(
      'Human Body Basics:\n1. Hearts pump blood\n2. lungs absorb oxygen\n3. and brains control body functions'
    );
    expect(questions[0].answers).toEqual(ITEMS);
  });

  it('drops it from an inline series, as it always did', () => {
    const { questions } = parseNotes(
      'Human Body Basics: Hearts pump blood, lungs absorb oxygen, and brains control body functions.'
    );
    expect(questions[0].answers).toEqual(ITEMS);
  });

  it('handles "or" the same way', () => {
    const { questions } = parseNotes('Rock types:\n- igneous\n- sedimentary\n- or metamorphic');
    expect(questions[0].answers).toEqual(['igneous', 'sedimentary', 'metamorphic']);
  });

  it('does not eat a word that merely starts with those letters', () => {
    const { questions } = parseNotes(
      'Circulatory parts:\n- arteries carry blood\n- organs filter waste\n- andirons are not organs'
    );
    expect(questions[0].answers).toContain('andirons are not organs');
    expect(questions[0].answers).toContain('organs filter waste');
  });
});

describe('rebuilding options for a deck already on the phone', () => {
  // What a stale subject can still tell us: its other answers, and the
  // sentences they came from.
  const POOL = ['Inflation', 'Deflation', 'Equilibrium', 'Monopsony', 'Elasticity'];
  const SOURCE = [
    'Inflation: a sustained rise in the general price level',
    'Deflation: a sustained fall in the general price level',
    'Equilibrium: the price at which supply equals demand',
    'Monopsony: a market with a single buyer',
    'Elasticity: how far demand responds to a change in price',
  ].join('\n');

  it('builds four options including the answer', () => {
    const built = rebuildOptions(
      'Equilibrium',
      'Which term means: the price at which supply equals demand?',
      POOL,
      SOURCE,
      'seed'
    );
    expect(built).not.toBeNull();
    expect(built).toHaveLength(4);
    expect(built).toContain('Equilibrium');
  });

  it('leaves the answer byte-for-byte alone', () => {
    // Other code finds it inside its own source line by exact match.
    const built = rebuildOptions('Monopsony', 'Which term means: a market with a single buyer?', POOL, SOURCE, 's');
    expect(built?.filter((o) => o.toLowerCase() === 'monopsony')).toEqual(['Monopsony']);
  });

  it('writes the decoys the way the answer is written', () => {
    const built = rebuildOptions(
      'equilibrium',
      'Subsidies lower the ______ price.',
      POOL,
      SOURCE,
      'seed'
    );
    expect(built).not.toBeNull();
    const capitalised = built!.filter((o) => /^[A-Z]/.test(o));
    expect(capitalised).toEqual([]);
  });

  it('gives up rather than pad, when the deck has too little to draw on', () => {
    expect(rebuildOptions('Osmosis', 'Which term means: water moving?', ['Osmosis'], '', 's')).toBeNull();
  });

  it('is deterministic, so the launch repair settles after one pass', () => {
    const once = rebuildOptions('Elasticity', 'Which term means: how far demand responds?', POOL, SOURCE, 'x');
    const twice = rebuildOptions('Elasticity', 'Which term means: how far demand responds?', POOL, SOURCE, 'x');
    expect(twice).toEqual(once);
  });
});

describe('a paste that lost its line breaks', () => {
  // Reported from a real subject: a heading welded to the front of the next
  // heading became the answer to a sixty-word question.
  const PASTE =
    "Earth & SpaceWater Cycle: Evaporation (water turns to vapor) $\\rightarrow$ Condensation " +
    "(clouds form) $\\rightarrow$ Precipitation (rain/snow falls).Solar System: The Sun is a star " +
    "at the center, orbited by 8 planets (Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, " +
    "Neptune).Seasons: Caused by Earth's tilted axis as it orbits the Sun, not by how close Earth " +
    "is to the Sun.";

  it('never welds one heading onto the next', () => {
    for (const q of parseNotes(PASTE).questions) {
      expect(q.correctAnswer).not.toMatch(/[a-z][A-Z]/);
    }
  });

  it('asks three ordinary questions instead of one enormous one', () => {
    const { questions } = parseNotes(PASTE);
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(q.prompt.split(/\s+/).length).toBeLessThanOrEqual(LIMITS.maxSentenceWords);
    }
  });

  it('reads the arrow chain as the ordered list it is', () => {
    const list = parseNotes(PASTE).questions.find((q) => q.kind === 'enumeration');
    expect(list?.answers).toEqual(['Evaporation', 'Condensation', 'Precipitation']);
    expect(list?.ordered).toBe(true);
  });

  it('leaves compound words that are really one word alone', () => {
    // The seam only counts when what follows reads as a heading of its own:
    // Title Case, two words or more, ending in a colon.
    for (const text of [
      'PowerPoint: a program for making slide decks in an office suite.',
      'The iPhone Settings: where the device options are changed by the user.',
      'mRNA: the messenger molecule that carries the code out of the nucleus.',
    ]) {
      for (const q of parseNotes(text).questions) {
        expect(q.correctAnswer).not.toContain('\n');
      }
      expect(parseNotes(text).questions.every((q) => !/^(Power|i|m)$/.test(q.correctAnswer))).toBe(
        true
      );
    }
  });
});

describe('limits', () => {
  it('flags and truncates oversized input', () => {
    const line = 'Mitochondria produce 36 ATP per glucose molecule.\n';
    const { stats } = parseNotes(line.repeat(400));
    expect(stats.truncatedInput).toBe(true);
  });

  it('never returns more than the question cap', () => {
    const lines = Array.from(
      { length: 120 },
      (_, i) => `Term${i}: a definition of the concept numbered ${i} in this list`
    ).join('\n');
    const { questions } = parseNotes(lines);
    expect(questions.length).toBeLessThanOrEqual(LIMITS.maxQuestions);
  });
});

describe('determinism', () => {
  it('produces identical output for identical input', () => {
    const notes = `Chlorophyll: the green pigment that absorbs light
      Osmosis = the movement of water across a membrane
      Mitosis - cell division producing identical daughter cells
      Mitochondria produce 36 ATP per glucose molecule.`;
    expect(JSON.stringify(parseNotes(notes))).toBe(JSON.stringify(parseNotes(notes)));
  });
});

describe('option order', () => {
  const NOTES = `Chlorophyll: the green pigment that absorbs light
    Osmosis: movement of water across a semipermeable membrane
    Glycolysis: breakdown of glucose into pyruvate
    Diffusion: spreading of particles down a concentration gradient
    Mitosis: division of a cell into two identical daughter cells
    Meiosis: division that halves the chromosome number
    Respiration: release of energy from glucose inside the cell
    Transcription: copying of DNA into messenger RNA
    Translation: building of a protein from messenger RNA
    Cytoplasm: the jelly that fills the inside of a cell
    Ribosome: the structure that assembles amino acids
    Chloroplast: the organelle where photosynthesis happens`;

  it('does not park the right answer in the same slot every time', () => {
    // The bug this guards: seededShuffle multiplied past 2^53, the rounding
    // wiped the low bits the index was read from, and the correct answer
    // came out last in 999 questions out of 1000. A student could pass by
    // always picking D.
    const slots = parseNotes(NOTES).questions.map((q) => q.answers.indexOf(q.correctAnswer));
    expect(slots.length).toBeGreaterThan(6);
    expect(new Set(slots).size).toBeGreaterThan(2);
  });

  it('always puts the right answer somewhere in the options', () => {
    for (const question of parseNotes(NOTES).questions) {
      expect(question.answers).toContain(question.correctAnswer);
    }
  });

  it('freezes the order, so the same notes always quiz the same way', () => {
    const first = parseNotes(NOTES).questions.map((q) => q.answers.join('|'));
    const second = parseNotes(NOTES).questions.map((q) => q.answers.join('|'));
    expect(first).toEqual(second);
  });
});

/**
 * Real notes that produced nonsense.
 *
 * Every case here is a question a student actually got asked, written down
 * so it cannot be asked again.
 */
describe('notes that used to break it', () => {
  const promptsOf = (text: string) => parseNotes(text).questions.map((q) => q.prompt);
  const answersOf = (text: string) =>
    parseNotes(text).questions.flatMap((q) => [q.correctAnswer, ...q.answers]);

  it('never splits a list inside a bracketed aside', () => {
    const result = parseNotes(
      'Energy Types: Potential (stored energy, like a stretched rubber band) and Kinetic (motion energy, like a rolling ball).'
    );
    const list = result.questions.find((q) => q.kind === 'enumeration');
    // Two things, not four fragments of the explanations after them.
    expect(list?.answers).toEqual(['Potential', 'Kinetic']);
    expect(list?.prompt).toBe('List the 2: Energy Types');
  });

  it('drops the "and" an Oxford comma leaves on the last item', () => {
    const list = parseNotes(
      'Human Body Basics: Hearts pump blood, lungs absorb oxygen, and brains control body functions.'
    ).questions.find((q) => q.kind === 'enumeration');
    expect(list?.answers).toEqual([
      'Hearts pump blood',
      'lungs absorb oxygen',
      'brains control body functions',
    ]);
  });

  it('reads a paste that lost its line breaks as separate facts', () => {
    const prompts = promptsOf(
      'Water Cycle: Evaporation happens first.Photosynthesis: Plants convert sunlight into stored chemical energy.Seasons: Caused by the tilt of the axis of Earth.'
    );
    expect(prompts).toHaveLength(3);
    // Three facts, three questions — not one question holding all three.
    for (const prompt of prompts) expect(prompt).not.toContain('Photosynthesis:');
  });

  it('drops a run-on sentence that leans on the term it is asking for', () => {
    // "…at the centre of it" only means anything beside the words "Solar
    // System", so on its own it is not a question, and the "it" is the
    // answer. Its neighbours still come through.
    const prompts = promptsOf(
      'Water Cycle: Evaporation happens first.Solar System: The Sun is a star at the centre of it.Seasons: Caused by the tilt of the axis of Earth.'
    );
    expect(prompts).toHaveLength(2);
    expect(prompts.join(' ')).not.toContain('centre of it');
    // And it is not salvaged by blanking a word out of its own term.
    expect(prompts.join(' ')).not.toContain('Solar');
  });

  it('keeps an abbreviation whole rather than splitting inside it', () => {
    const prompts = promptsOf('Capital: The U.S.A. has its seat of government in Washington.');
    expect(prompts.join(' ')).not.toContain('S.A.');
  });

  it('strips markup a paste dragged in with it', () => {
    const prompts = promptsOf(
      'Water Cycle: Evaporation $\\rightarrow$ Condensation $\\rightarrow$ Precipitation falls.'
    );
    expect(prompts.join(' ')).not.toContain('rightarrow');
    expect(prompts.join(' ')).not.toContain('$');
  });

  it('refuses a meaning too long to read as a question', () => {
    const long = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ');
    expect(promptsOf(`Photosynthesis: ${long}.`)).toHaveLength(0);
  });

  it('never offers an answer with a line break in it', () => {
    const answers = answersOf(
      'Energy & Matter\nAtom: The smallest unit of an element, made of protons and electrons.'
    );
    for (const answer of answers) expect(answer).not.toContain('\n');
  });

  it('still refuses a two-item list when nothing says it is one', () => {
    // "A and B" is how most sentences are written; only a named category
    // of things is evidence enough.
    const list = parseNotes(
      'Photosynthesis: Plants take in carbon dioxide and give out oxygen.'
    ).questions.find((q) => q.kind === 'enumeration');
    expect(list).toBeUndefined();
  });
});
