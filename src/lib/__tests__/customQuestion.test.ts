import { buildCustomQuestion, CUSTOM_LIMITS } from '../customQuestion';
import { suggestDistractors } from '../noteParser';

const DECOYS = ['Chloroplast', 'Ribosome', 'Nucleus'];

function build(over: Partial<Parameters<typeof buildCustomQuestion>[0]> = {}) {
  return buildCustomQuestion({
    prompt: 'Which organelle releases energy from glucose?',
    answer: 'Mitochondria',
    decoys: DECOYS,
    ...over,
  });
}

describe('buildCustomQuestion', () => {
  it('keeps the student\'s words and marks their answer correct', () => {
    const { question } = build();
    expect(question?.prompt).toBe('Which organelle releases energy from glucose?');
    expect(question?.correctAnswer).toBe('Mitochondria');
    expect(question?.answers).toHaveLength(4);
    expect(question?.answers).toEqual(expect.arrayContaining(['Mitochondria', ...DECOYS]));
  });

  it('shuffles the options so the answer is not always first', () => {
    // Across enough questions the answer must land somewhere other than [0].
    const places = new Set(
      Array.from({ length: 12 }, (_, i) => {
        const { question } = build({ prompt: `Question number ${i}?` });
        return question?.answers.indexOf('Mitochondria');
      })
    );
    expect(places.size).toBeGreaterThan(1);
  });

  it('gives the same options every time for the same question', () => {
    expect(build().question?.answers).toEqual(build().question?.answers);
  });

  it('saves as a definition with no source line', () => {
    // No line was read to make it, so nothing may claim one was.
    const { question } = build();
    expect(question?.kind).toBe('definition');
    expect(question?.sourceLine).toBeNull();
  });

  it('trims and collapses whitespace', () => {
    const { question } = build({ answer: '  Mitochondria  ', prompt: 'What  is\n  it?' });
    expect(question?.correctAnswer).toBe('Mitochondria');
    expect(question?.prompt).toBe('What is it?');
  });

  it('refuses a question with no prompt or no answer', () => {
    expect(build({ prompt: '   ' }).issues).toContain('no_prompt');
    expect(build({ answer: '' }).issues).toContain('no_answer');
    expect(build({ prompt: '' }).question).toBeNull();
  });

  it('refuses until three wrong answers are written', () => {
    const partial = build({ decoys: ['Ribosome', '', ''] });
    expect(partial.issues).toContain('missing_decoys');
    expect(partial.question).toBeNull();
  });

  it('refuses a wrong answer that repeats the right one', () => {
    // Case and spacing don't make it a different option.
    const clash = build({ decoys: ['  mitochondria ', 'Ribosome', 'Nucleus'] });
    expect(clash.issues).toContain('repeated_option');
    expect(clash.question).toBeNull();
  });

  it('refuses two wrong answers that repeat each other', () => {
    expect(build({ decoys: ['Ribosome', 'ribosome', 'Nucleus'] }).issues).toContain(
      'repeated_option'
    );
  });

  it('refuses a prompt or answer too long to read on a phone', () => {
    expect(build({ prompt: 'x'.repeat(CUSTOM_LIMITS.maxPromptChars + 1) }).issues).toContain(
      'prompt_too_long'
    );
    expect(build({ answer: 'y'.repeat(CUSTOM_LIMITS.maxAnswerChars + 1) }).issues).toContain(
      'answer_too_long'
    );
  });

  it('warns without blocking when the question contains its answer', () => {
    const giveaway = build({ prompt: 'Mitochondria release energy from what?' });
    expect(giveaway.givesItselfAway).toBe(true);
    expect(giveaway.question).not.toBeNull();
    expect(build().givesItselfAway).toBe(false);
  });
});

describe('suggestDistractors', () => {
  const POOL = ['Chloroplast', 'Ribosome', 'Nucleus', 'Golgi body', 'Mitochondria'];

  it('borrows wrong answers from the subject', () => {
    const found = suggestDistractors('Mitochondria', POOL, 'seed');
    expect(found).toHaveLength(3);
    expect(POOL).toEqual(expect.arrayContaining(found));
  });

  it('never offers the right answer as a wrong one', () => {
    expect(suggestDistractors('Mitochondria', POOL, 'seed')).not.toContain('Mitochondria');
  });

  it('invents near-miss numbers, which need no pool at all', () => {
    const found = suggestDistractors('1945', [], 'seed');
    expect(found).toHaveLength(3);
    expect(found).not.toContain('1945');
    for (const year of found) expect(Number(year)).toBeGreaterThan(1900);
  });

  it('returns fewer than three rather than padding a thin subject', () => {
    // Better an honest gap the student fills than filler they can rule out.
    expect(suggestDistractors('Mitochondria', ['Ribosome'], 'seed').length).toBeLessThan(3);
    expect(suggestDistractors('Mitochondria', [], 'seed')).toEqual([]);
  });

  it('gives nothing for a blank answer', () => {
    expect(suggestDistractors('   ', POOL, 'seed')).toEqual([]);
  });

  it('offers different terms for a different seed', () => {
    const wide = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
    const first = suggestDistractors('Answer', wide, 'seed-1').join('|');
    const second = suggestDistractors('Answer', wide, 'seed-2').join('|');
    expect(first).not.toBe(second);
  });
});
