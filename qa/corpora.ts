/**
 * Test material for the audit.
 *
 * Six realistic note sets, deliberately written with **no shared
 * vocabulary**, so that any answer, distractor or prompt appearing in two
 * of them at once is evidence the generator invented it rather than read
 * it. Each one mixes the three shapes the parser knows: definitions,
 * prose worth blanking, and lists.
 *
 * Then a pile of hostile input, because a student pastes whatever their
 * lecturer typed.
 */

export interface Corpus {
  name: string;
  /** What this corpus is here to exercise. */
  intent: string;
  text: string;
}

export const REALISTIC: Corpus[] = [
  {
    name: 'biology',
    intent: 'definition-heavy with one bulleted list and numeric facts',
    text: `Chapter 4: Cellular Respiration

Mitochondrion: the organelle where aerobic respiration takes place
Glycolysis: breakdown of glucose into two pyruvate molecules
Chlorophyll: the green pigment that absorbs light for photosynthesis
ATP stands for adenosine triphosphate
Osmosis = movement of water across a semipermeable membrane
Cytoplasm - the jelly-like fluid filling the interior of a cell

The stages of mitosis:
1. Prophase
2. Metaphase
3. Anaphase
4. Telophase

Aerobic respiration yields 38 ATP molecules per glucose molecule.
The Calvin Cycle fixes carbon dioxide inside the stroma of the chloroplast.
Ribosomes assemble proteins from amino acids delivered by transfer RNA.
Human somatic cells contain 46 chromosomes arranged in 23 pairs.`,
  },
  {
    name: 'history',
    intent: 'dates and proper nouns — the numeric distractor path',
    text: `Unit 2: The Interwar Years

Reparations: payments demanded from a defeated nation after a war
Appeasement: conceding to an aggressor to avoid open conflict
Hyperinflation - runaway collapse in the purchasing power of a currency
The Treaty of Versailles was signed in 1919.
The Wall Street Crash began in October 1929.
The Weimar Republic governed Germany until 1933.

The causes of the depression include bank failures, tariff walls and falling demand.

Chamberlain returned from Munich in 1938 carrying a signed declaration.
Unemployment in Germany reached 6 million by the winter of 1932.`,
  },
  {
    name: 'chemistry',
    intent: 'acronyms, symbols, percentages and an inline series',
    text: `Topic: Bonding and Structure

Electronegativity: the tendency of an atom to attract a shared pair of electrons
Isotope: atoms of one element differing in neutron number
Ionic bonding is the transfer of electrons from a metal to a non-metal
Sublimation = the change of a solid directly into a gas

The three states of matter are solid, liquid and gas.

Types of intermolecular force:
- Hydrogen bonding
- Dipole dipole
- London dispersion

Water boils at 100 degrees under standard atmospheric pressure.
The atmosphere is roughly 78 percent nitrogen by volume.`,
  },
  {
    name: 'economics',
    intent: 'abstract terms, no proper nouns, long sentences',
    text: `Lesson 6: Market Failure

Externality: a cost or benefit falling on somebody outside the transaction
Deadweight loss: the surplus destroyed when a market settles away from equilibrium
Elasticity - the responsiveness of quantity demanded to a change in price
Monopsony: a market in which a single buyer faces many sellers

Subsidies shift the supply curve rightward and lower the equilibrium price.
Progressive taxation takes a larger proportion of income from higher earners.

Sources of market failure:
- Public goods
- Imperfect information
- Merit goods
- Negative externalities

A minimum wage set above the equilibrium creates a surplus of labour.`,
  },
  {
    name: 'computing',
    intent: 'acronyms, technical compounds, an ordered list',
    text: `Module 3: Networking

Latency: the delay between sending a packet and its arrival
Bandwidth: the maximum throughput a link can sustain
TCP stands for transmission control protocol
Encapsulation = wrapping a payload in the header of a lower layer
Firewall - a filter enforcing a policy on traffic crossing a boundary

The steps of a handshake:
1. Synchronise
2. Acknowledge
3. Established

Ethernet frames carry a checksum computed over the entire payload.
The default port for encrypted web traffic is 443.`,
  },
  {
    name: 'geography',
    intent: 'place names, bulleted list without a heading colon',
    text: `Week 5: Rivers and Coasts

Meander: a sweeping bend in the lower course of a river
Longshore drift: the movement of sediment along a coastline by angled waves
Estuary - the tidal mouth where a river widens into the sea
Weathering: the breakdown of rock in place without transport

The Mississippi drains an enormous basin across the interior of the continent.

Coastal defences:
- Groynes
- Sea walls
- Beach nourishment
- Managed retreat

Deposition happens where the current slows and loses its carrying capacity.`,
  },
];

/**
 * Nasty input. None of it should throw, hang, or produce a question that
 * cannot be answered.
 */
export const ADVERSARIAL: Corpus[] = [
  { name: 'empty', intent: 'nothing at all', text: '' },
  { name: 'whitespace', intent: 'only blanks', text: '   \n\n\t  \n   ' },
  { name: 'single-word', intent: 'below every threshold', text: 'Mitochondria' },
  {
    name: 'literal-blank-marker',
    intent: 'notes that already contain the cloze marker',
    text: `The powerhouse of the cell is the ______ organelle.
Fill in: the capital of France is ______ in the north.
Osmosis: movement of water across a membrane
Diffusion: spreading of particles down a gradient
Glycolysis: breakdown of glucose into pyruvate`,
  },
  {
    name: 'regex-metacharacters',
    intent: 'terms containing characters with meaning in replace()',
    text: `C++ is a compiled systems programming language
$& notation: the matched substring in a replacement pattern
A* search: an informed pathfinding algorithm using a heuristic
[]: the subscript operator used for indexing into an array
Regex $1 refers to the first captured group in a replacement`,
  },
  {
    name: 'times-and-urls',
    intent: 'colons that are not definitions',
    text: `Lecture at 10:30 in the main hall on Tuesday morning
See https://example.com/notes for the full reading list
Ratio: the sample was mixed 3:1 with distilled water
Osmosis: movement of water across a semipermeable membrane
Diffusion: spreading of particles down a concentration gradient
Glycolysis: breakdown of glucose into two pyruvate molecules`,
  },
  {
    name: 'all-headings',
    intent: 'a table of contents, nothing to test',
    text: `Chapter 1
Chapter 2: Introduction
Unit 4
Section 2.1
Summary
Review`,
  },
  {
    name: 'all-tasks',
    intent: 'a to-do list, no facts',
    text: `Read chapter four before Friday
Answer questions 1 to 12 in the workbook
Submit the lab report by Thursday evening
Bring a calculator to the practical session
Review the past paper from last summer`,
  },
  {
    name: 'duplicate-lines',
    intent: 'the same fact pasted five times',
    text: Array(5)
      .fill('Osmosis: movement of water across a semipermeable membrane')
      .join('\n'),
  },
  {
    name: 'self-referential-definition',
    intent: 'the term appears inside its own definition — a giveaway',
    text: `Photosynthesis: photosynthesis is the process plants use to make food
Osmosis: osmosis describes water moving across a membrane
Diffusion: spreading of particles down a concentration gradient
Glycolysis: breakdown of glucose into two pyruvate molecules`,
  },
  {
    name: 'crlf',
    intent: 'pasted from Windows',
    text: 'Osmosis: movement of water across a membrane\r\nDiffusion: spreading of particles\r\nGlycolysis: breakdown of glucose into pyruvate\r\nMitosis: division of a cell nucleus into two',
  },
  {
    name: 'smart-punctuation',
    intent: 'curly quotes and em dashes from a word processor',
    text: `Osmosis — movement of water across a “semipermeable” membrane
Diffusion — spreading of particles down a concentration gradient
Glycolysis — breakdown of glucose into two pyruvate molecules
Mitosis — division of a cell nucleus into two identical nuclei`,
  },
  {
    name: 'emoji-and-rtl',
    intent: 'mixed scripts and pictographs',
    text: `Mitochondria 🔋: the powerhouse of the cell ⚡
تعريف: حركة الماء عبر غشاء شبه منفذ
Osmosis: movement of water across a semipermeable membrane
Diffusion: spreading of particles down a concentration gradient`,
  },
  {
    name: 'one-enormous-word',
    intent: 'a pathological token',
    text: `${'supercalifragilistic'.repeat(40)} is the longest word in the notes
Osmosis: movement of water across a membrane
Diffusion: spreading of particles down a gradient
Glycolysis: breakdown of glucose into pyruvate`,
  },
  {
    name: 'no-punctuation-wall',
    intent: 'one unbroken paragraph',
    text: `the cell membrane controls what enters and leaves the cell the nucleus stores genetic material the mitochondria release energy from glucose the ribosomes build proteins from amino acids the cytoplasm suspends the organelles in a jelly like fluid`,
  },
  {
    name: 'numeric-soup',
    intent: 'numbers everywhere — exercises numeric distractors',
    text: `The boiling point of water is 100 degrees at sea level
The freezing point of water is 0 degrees at sea level
A human body contains 206 bones once fully grown
Light travels at 299792458 metres per second in a vacuum
The population reached 8000000000 people in 2022
Growth was 3.5 percent over the preceding quarter`,
  },
  {
    name: 'over-limit',
    intent: 'longer than the documented input cap',
    text: Array(400)
      .fill(0)
      .map(
        (_, i) =>
          `Term${i}: a distinct meaning number ${i} written out at some length for testing`
      )
      .join('\n'),
  },
  {
    name: 'markdown-noise',
    intent: 'hashes, asterisks, nested bullets',
    text: `# Biology
## Cells
* Osmosis: movement of water across a membrane
  * Diffusion: spreading of particles down a gradient
- **Glycolysis**: breakdown of glucose into pyruvate
> Mitosis: division of a cell nucleus into two`,
  },
  {
    name: 'list-without-items',
    intent: 'a colon heading whose list never arrives',
    text: `The stages of mitosis:

Osmosis: movement of water across a semipermeable membrane
Diffusion: spreading of particles down a concentration gradient
Glycolysis: breakdown of glucose into two pyruvate molecules`,
  },
  {
    name: 'oversized-list',
    intent: 'more list items than the enumeration cap allows',
    text: `The amino acids:
- Alanine
- Arginine
- Asparagine
- Aspartate
- Cysteine
- Glutamine
- Glycine
- Histidine`,
  },
];

export const ALL: Corpus[] = [...REALISTIC, ...ADVERSARIAL];

/**
 * Rewrites the domain vocabulary of a note while leaving every structural
 * signal — punctuation, capitalisation, word length, line shape — exactly
 * as it was.
 *
 * This is the control experiment for the repetition audit: parsing the
 * original and the rewrite must produce the *same shape* of quiz with
 * *different content*. Identical content out of different content in means
 * the output was never really read from the input.
 */
export function rewriteVocabulary(text: string): string {
  const memo = new Map<string, string>();
  const consonants = 'bdfgklmnprstvz';
  const vowels = 'aeiou';

  return text.replace(/[A-Za-z]{5,}/g, (word) => {
    const lower = word.toLowerCase();
    let replacement = memo.get(lower);
    if (!replacement) {
      // Deterministic pseudo-word of identical length, so every
      // length-based heuristic in the parser sees exactly what it saw.
      let h = 2166136261;
      for (let i = 0; i < lower.length; i++) {
        h = (h ^ lower.charCodeAt(i)) * 16777619;
        h >>>= 0;
      }
      let out = '';
      for (let i = 0; i < word.length; i++) {
        h = (h * 1103515245 + 12345) >>> 0;
        out += i % 2 === 0 ? consonants[h % consonants.length] : vowels[h % vowels.length];
      }
      replacement = out;
      memo.set(lower, replacement);
    }
    // Restore the original capitalisation pattern.
    if (word === word.toUpperCase()) return replacement.toUpperCase();
    if (word[0] === word[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });
}
