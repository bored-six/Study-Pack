import { LIMITS, parseNotes } from '../noteParser';

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
