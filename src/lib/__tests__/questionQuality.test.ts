/**
 * The rules that decide whether a question is worth asking.
 *
 * These are deliberately tested on notes nobody reported — history,
 * geography, economics, chemistry — because the point of a rule is that it
 * holds for input it has never seen. Fixing the sentences in a bug report
 * fixes those sentences.
 */
import { parseNotes } from '../noteParser';
import {
  contentWords,
  danglesOutward,
  optionsAreLevel,
  fitsAsOption,
  givesItselfAway,
  isAskable,
  tightenMeaning,
} from '../questionQuality';

describe('a question may not contain its own answer', () => {
  it('catches the answer sitting in the prompt', () => {
    expect(
      givesItselfAway('Which term means: Light moves in straight lines?', 'Light Travel')
    ).toBe(true);
    expect(
      givesItselfAway('Which term means: the study of earthquakes?', 'Seismology')
    ).toBe(false);
  });

  it('ignores a word too short to be the giveaway', () => {
    // "cell" is incidental in a sentence about cells; the answer is still work.
    expect(
      givesItselfAway('Which term means: the layer that surrounds a cell?', 'Cell membrane')
    ).toBe(false);
  });

  it('ignores words that are common everywhere', () => {
    expect(
      givesItselfAway('Which term means: the process where plants make food?', 'Food chain')
    ).toBe(false);
  });
});

describe('a meaning has to stand on its own', () => {
  it('refuses one that points outside itself', () => {
    expect(danglesOutward('The Sun is a star at the centre of it')).toBe(true);
    expect(danglesOutward('This is what happens when water freezes')).toBe(true);
    expect(danglesOutward('These are the three branches of government')).toBe(true);
  });

  it('accepts one that names what it is about', () => {
    expect(danglesOutward('The force that pulls objects toward the Earth')).toBe(false);
    expect(danglesOutward('Caused by the tilt of the axis as it orbits the Sun')).toBe(false);
  });
});

describe('a definition is trimmed to the part that defines', () => {
  it('cuts a bracketed aside off the end', () => {
    expect(
      tightenMeaning('travels faster than sound (why you see lightning before thunder)')
    ).toBe('travels faster than sound');
  });

  it('cuts an illustration off the end', () => {
    expect(tightenMeaning('a metal that conducts heat well, e.g. copper and silver')).toBe(
      'a metal that conducts heat well'
    );
    expect(tightenMeaning('a large body of ice, such as a glacier')).toBe('a large body of ice');
  });

  it('leaves a definition that is already tight alone', () => {
    const tight = 'the smallest unit of an element';
    expect(tightenMeaning(tight)).toBe(tight);
  });

  it('never trims a definition down to a fragment', () => {
    // Cutting here would leave "a gas" — the aside was doing the work.
    const thin = 'a gas (nitrogen)';
    expect(contentWords(tightenMeaning(thin)).length).toBeGreaterThanOrEqual(1);
  });
});

describe('the gate', () => {
  it('lets a real question through', () => {
    expect(
      isAskable({ prompt: 'Which term means: the study of earthquakes?', answer: 'Seismology' })
    ).toBe(true);
  });

  it('keeps short answers, which are often the right ones', () => {
    expect(
      isAskable({ prompt: 'Mitochondria produce ______ ATP per glucose molecule.', answer: '36' })
    ).toBe(true);
    expect(
      isAskable({ prompt: 'The blank carries the genetic code of a cell.', answer: 'DNA' })
    ).toBe(true);
  });

  it('refuses a prompt too long to read on a phone', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    expect(isAskable({ prompt: `Which term means: ${long}?`, answer: 'Something' })).toBe(false);
  });

  it('refuses markup that survived cleaning', () => {
    expect(
      isAskable({ prompt: 'Which term means: a \\rightarrow b happens?', answer: 'Reaction' })
    ).toBe(false);
  });
});

describe('an option already printed in the question is not an option', () => {
  it('drops one whose words are all in the prompt', () => {
    const prompt = 'Which term means: the capital city of France?';
    expect(fitsAsOption('France', prompt, 'Paris')).toBe(false);
    expect(fitsAsOption('Berlin', prompt, 'Paris')).toBe(true);
  });

  it('never offers the answer as its own decoy', () => {
    expect(fitsAsOption('Paris', 'Which term means: the capital of France?', 'Paris')).toBe(false);
  });
});

/**
 * The whole pipeline, on subjects that have never been reported broken.
 * Anything the rules let through has to survive being read.
 */
describe('notes it has never seen', () => {
  const SUBJECTS = [
    `Inflation: a general rise in prices across an economy over time.
     Recession: a period of falling output lasting two quarters or more.
     Tariff: a tax placed on imported goods, e.g. steel and aluminium.
     Fiscal policy is government spending and taxation.`,
    `Erosion: the wearing away of rock by wind, water or ice.
     Delta: a landform where a river meets a slower body of water.
     The three types of rock are igneous, sedimentary and metamorphic.
     Weathering: the breakdown of rock in place (without movement).`,
    `Catalyst: a substance that speeds a reaction without being consumed.
     The pH of a neutral solution is 7.
     Isotope: an atom with the usual protons but a different neutron count.
     Noble gases are helium, neon, argon and krypton.`,
    `Feudalism: a system where land was held in return for service.
     The Magna Carta was signed in 1215.
     Suffrage: the right to vote in public elections.
     The three estates were the clergy, the nobility and the commoners.`,
  ];

  const all = SUBJECTS.flatMap((notes) => parseNotes(notes).questions);

  it('produces a useful number of questions from ordinary notes', () => {
    expect(all.length).toBeGreaterThanOrEqual(12);
  });

  it('never asks a question that states its own answer', () => {
    for (const q of all) {
      expect(givesItselfAway(q.prompt, q.correctAnswer)).toBe(false);
    }
  });

  it('never asks a question nobody could read', () => {
    for (const q of all) {
      expect(isAskable({ prompt: q.prompt, answer: q.correctAnswer })).toBe(true);
      expect(q.prompt.trim()).toBe(q.prompt);
      expect(q.prompt).not.toMatch(/\s{2,}/);
    }
  });

  it('never offers an option that is inside another one', () => {
    for (const q of all) {
      for (const option of q.answers) {
        const others = q.answers.filter((o) => o !== option);
        for (const other of others) {
          expect(other.toLowerCase().includes(option.toLowerCase())).toBe(false);
        }
      }
    }
  });

  it('always includes the right answer among the options', () => {
    for (const q of all) {
      expect(q.answers).toContain(q.correctAnswer);
    }
  });

  it('never offers an option already printed in the question', () => {
    for (const q of all) {
      if (q.kind === 'enumeration') continue;
      for (const option of q.answers) {
        if (option === q.correctAnswer) continue;
        expect(fitsAsOption(option, q.prompt, q.correctAnswer)).toBe(true);
      }
    }
  });

  it('carries no leftover markup or stray brackets in any answer', () => {
    for (const q of all) {
      for (const option of q.answers) {
        expect(option).not.toMatch(/[()\\${}]/);
        expect(option).not.toContain('\n');
        expect(option.trim()).toBe(option);
      }
    }
  });

  it('builds every list from items of a consistent shape', () => {
    for (const q of all) {
      if (q.kind !== 'enumeration') continue;
      // A list mixing "Potential" with "like a rolling ball)" is a split gone
      // wrong; real list items sit within a word or two of each other.
      const lengths = q.answers.map((a) => a.split(/\s+/).length);
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(3);
    }
  });
});

describe('an option set you cannot sort by looking', () => {
  it('rejects an initialism standing among long words', () => {
    // The three-letter one is the initialism whatever the stem says.
    expect(optionsAreLevel('ATP', ['ATP', 'Anaphase', 'Chlorophyll', 'Calvin Cycle'])).toBe(false);
    expect(optionsAreLevel('TCP', ['Established', 'Networking', 'TCP', 'Acknowledge'])).toBe(false);
  });

  it('accepts a set of initialisms', () => {
    expect(optionsAreLevel('ATP', ['ATP', 'RNA', 'DNA', 'ADP'])).toBe(true);
  });

  it('accepts ordinary terms of ordinary lengths', () => {
    expect(
      optionsAreLevel('Equilibrium', ['Inflation', 'Deflation', 'Equilibrium', 'Monopsony'])
    ).toBe(true);
  });

  it('rejects an answer far longer than everything beside it', () => {
    expect(optionsAreLevel('Photophosphorylation', ['Ion', 'Gas', 'Acid', 'Photophosphorylation'])).toBe(
      false
    );
  });

  it('says nothing about a set with no decoys yet', () => {
    expect(optionsAreLevel('Energy', ['Energy'])).toBe(true);
  });
});

describe('options written the same way as each other', () => {
  /**
   * A cloze answer is lifted from mid-sentence and is lowercase; a defined
   * term opened its line and is capitalised. Put them in one list and the
   * odd one out is the answer, without reading the question.
   */
  const NOTES = [
    'Elasticity measures how far demand responds to a change in price.',
    'Monopsony describes a market with a single buyer.',
    'Merit goods are goods the state judges people underconsume.',
    'Subsidies shift the supply curve rightward and lower the equilibrium price.',
    'Progressive taxation takes a larger proportion of income from higher earners.',
  ].join('\n');

  it('never leaves the answer as the only one of its case', () => {
    for (const q of parseNotes(NOTES).questions) {
      if (q.kind === 'enumeration') continue;
      const decoys = q.answers.filter((a) => a !== q.correctAnswer);
      if (decoys.length === 0) continue;
      const capitalised = (t: string) => /^[A-Z]/.test(t);
      const oddOneOut = decoys.every((d) => capitalised(d) !== capitalised(q.correctAnswer));
      expect(oddOneOut).toBe(false);
    }
  });

  it('leaves the answer itself untouched, because other code searches for it', () => {
    // buildModifiedTrueFalse finds the answer inside its own source line by
    // exact match; a changed capital there fails silently.
    for (const q of parseNotes(NOTES).questions) {
      if (!q.sourceLine) continue;
      expect(q.sourceLine).toContain(q.correctAnswer);
    }
  });
});

describe('questions already saved that the parser would now refuse', () => {
  // Verbatim from the reported subject.
  const WELDED = {
    prompt:
      'Which term means: Evaporation (water turns to vapor) $\\rightarrow$ Condensation (clouds ' +
      'form) $\\rightarrow$ Precipitation (rain/snow falls).Solar System: The Sun is a star at the ' +
      "center, orbited by 8 planets (Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, " +
      "Neptune).Seasons: Caused by Earth's tilted axis as it orbits the Sun, not by how close " +
      'Earth is to the Sun?',
    answer: 'Earth & SpaceWater Cycle',
  };

  it('refuses the one the student kept failing', () => {
    expect(isAskable(WELDED)).toBe(false);
  });

  it('keeps the ordinary questions from the same note', () => {
    expect(
      isAskable({
        prompt: 'Which term means: The Sun is a star at the center, orbited by 8 planets?',
        answer: 'Solar System',
      })
    ).toBe(true);
    expect(
      isAskable({
        prompt:
          "Which term means: Caused by Earth's tilted axis as it orbits the Sun, not by how " +
          'close Earth is to the Sun?',
        answer: 'Seasons',
      })
    ).toBe(true);
  });

  it('keeps a list question, whose prompt is short and whose answer is one item', () => {
    expect(isAskable({ prompt: 'List the 3: Water Cycle', answer: 'Evaporation' })).toBe(true);
  });

  it('keeps a short answer with no content words of its own', () => {
    // The cleanup runs over real decks; "36" and "pH" must survive it.
    expect(isAskable({ prompt: 'Mitochondria produce ______ ATP per glucose.', answer: '36' })).toBe(
      true
    );
    expect(isAskable({ prompt: 'Which term means: a measure of acidity?', answer: 'pH' })).toBe(true);
  });
});
