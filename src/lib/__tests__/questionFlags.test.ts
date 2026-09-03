import { flagFor, flagsFor, type Flag } from '../questionFlags';
import type { ParsedQuestion } from '../noteParser';

function q(over: Partial<ParsedQuestion> = {}): ParsedQuestion {
  return {
    prompt: 'What is osmosis in living cells?',
    correctAnswer: 'the movement of water',
    answers: ['the movement of water', 'a kind of sugar', 'a gas exchange', 'a cell wall'],
    kind: 'definition',
    sourceLine: 'Osmosis is the movement of water across a semi-permeable membrane.',
    ...over,
  };
}

function reasonOf(f: Flag | null): string | null {
  return f?.reason ?? null;
}

describe('a decoy that would also be right for this question', () => {
  it('is caught when another question asks the same thing', () => {
    // Two questions asking the same thing, and one's answer is offered as
    // the other's wrong option. Whichever the student picks, they are told
    // they were wrong — the question cannot be answered.
    const draft = [
      q({ answers: ['the movement of water', 'diffusion', 'a gas exchange', 'a cell wall'] }),
      q({
        prompt: 'What is osmosis in living cells called?',
        correctAnswer: 'diffusion',
        answers: ['diffusion', 'mitosis', 'turgor', 'lysis'],
      }),
    ];
    const flags = flagsFor(draft);
    expect(reasonOf(flags[0])).toBe('decoy_also_true');
    expect(flags[0]?.culprit).toBe('diffusion');
  });

  it('leaves a decoy borrowed from a DIFFERENT question alone', () => {
    // This is how options get built at all: both the offline parser and Nib
    // draw wrong answers from other facts in the same notes. Being true
    // elsewhere is what makes a decoy plausible, not what makes it broken.
    // Flagging these put 85% of a real batch in the "check this" pile.
    const draft = [
      q({ answers: ['the movement of water', 'diffusion', 'a gas exchange', 'a cell wall'] }),
      q({
        prompt: 'What moves particles down a concentration gradient?',
        correctAnswer: 'diffusion',
        answers: ['diffusion', 'mitosis', 'turgor', 'lysis'],
      }),
    ];
    expect(flagsFor(draft)[0]).toBeNull();
  });

  it('does not flag a question for its own correct answer', () => {
    expect(flagsFor([q()])[0]).toBeNull();
  });

  it('ignores case and punctuation when matching', () => {
    const draft = [
      q({ answers: ['the movement of water', 'Diffusion.', 'a gas exchange', 'a cell wall'] }),
      q({
        prompt: 'What is osmosis in living cells called?',
        correctAnswer: 'diffusion',
        answers: ['diffusion', 'a longer one', 'another one', 'a third one'],
      }),
    ];
    expect(reasonOf(flagsFor(draft)[0])).toBe('decoy_also_true');
  });
});

describe('two options saying the same thing', () => {
  it('is caught', () => {
    const flag = flagFor(
      q({ answers: ['the movement of water', 'the movement of watr', 'a gas', 'a wall'] }),
      0,
      []
    );
    expect(reasonOf(flag)).toBe('twin_options');
  });

  it('leaves genuinely different options alone', () => {
    expect(flagFor(q(), 0, [])).toBeNull();
  });
});

describe('a list that stopped early', () => {
  it('is caught at two items', () => {
    const flag = flagFor(
      q({
        kind: 'enumeration',
        prompt: 'Name the stages of mitosis.',
        correctAnswer: 'prophase',
        answers: ['prophase', 'metaphase'],
        sourceLine: 'The stages of mitosis are prophase and metaphase and others.',
      }),
      0,
      []
    );
    expect(reasonOf(flag)).toBe('short_list');
  });

  it('is happy at three', () => {
    const flag = flagFor(
      q({
        kind: 'enumeration',
        prompt: 'Name the stages of mitosis.',
        correctAnswer: 'prophase',
        answers: ['prophase', 'metaphase', 'anaphase'],
        sourceLine: 'The stages of mitosis are prophase and metaphase and anaphase.',
      }),
      0,
      []
    );
    expect(flag).toBeNull();
  });
});

describe('a line too short to test', () => {
  it('is caught under eight words', () => {
    const flag = flagFor(q({ sourceLine: 'Osmosis moves water.' }), 0, []);
    expect(reasonOf(flag)).toBe('thin_source');
  });
});

describe('an answer longer than its question', () => {
  it('is caught', () => {
    const flag = flagFor(
      q({
        prompt: 'Osmosis?',
        correctAnswer: 'the movement of water across a semi-permeable membrane',
      }),
      0,
      []
    );
    expect(reasonOf(flag)).toBe('long_answer');
  });

  it('does not apply to a list, which is marked on completeness', () => {
    const flag = flagFor(
      q({
        kind: 'enumeration',
        prompt: 'Stages?',
        correctAnswer: 'prophase metaphase anaphase telophase',
        answers: ['prophase', 'metaphase', 'anaphase', 'telophase'],
        sourceLine: 'The four stages of mitosis are prophase metaphase anaphase telophase.',
      }),
      0,
      []
    );
    expect(flag).toBeNull();
  });
});

describe('a question the student wrote', () => {
  it('is never second-guessed', () => {
    // He did not make it, so he does not get an opinion on it.
    const flag = flagFor(q({ sourceLine: null, prompt: 'Hi?', correctAnswer: 'a very long answer indeed here' }), 0, []);
    expect(flag).toBeNull();
  });
});

describe('one flag per card', () => {
  it('reports the most misleading problem, not all of them', () => {
    // Thin line AND a decoy that would also be right. The decoy makes it
    // unanswerable; the thin line only makes it weak. A card wearing three
    // warnings is a card nobody reads.
    const draft = [
      q({
        sourceLine: 'Water moves.',
        answers: ['the movement of water', 'diffusion', 'a longer one', 'another one'],
      }),
      q({
        prompt: 'What is osmosis in living cells called?',
        correctAnswer: 'diffusion',
        answers: ['diffusion', 'x one', 'y one', 'z one'],
      }),
    ];
    expect(reasonOf(flagsFor(draft)[0])).toBe('decoy_also_true');
  });
});
