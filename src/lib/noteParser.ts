/**
 * Turns pasted study notes into quiz questions — fully offline, no AI.
 *
 * Two techniques, tried in order per line:
 *   1. Definition patterns ("Term: meaning", "X is Y", "X stands for Y").
 *      These always produce the TERM as the answer, never the definition —
 *      short answers fit on buttons and make believable distractors.
 *   2. Cloze deletion — blank out the most quizzable word in the sentence.
 *
 * Wrong answers are drawn from other terms in the same notes, so they are
 * topically related instead of obviously filler.
 */

import { CLAIM_VERB, ILLUSTRATION_PREFIX } from './quizzable';

export const LIMITS = {
  /** Roughly 4–5 pages. Not a perf limit — reviewing more than this is misery. */
  maxInputChars: 10_000,
  maxQuestions: 50,
  minWordsPerLine: 4,
  /** Longer sentences make unreadable questions on a phone. */
  maxSentenceWords: 35,
  maxAnswerWords: 5,
} as const;

export type QuestionKind = 'definition' | 'cloze' | 'enumeration';

export interface ParsedQuestion {
  prompt: string;
  correctAnswer: string;
  /** Exactly 4 options, shuffled — or every list item, for enumeration. */
  answers: string[];
  kind: QuestionKind;
  /** The line this came from; null when the student wrote the question. */
  sourceLine: string | null;
  /** Enumeration only: items were numbered, so order is part of the answer. */
  ordered?: boolean;
}

export type SkipReason =
  | 'too_short'
  | 'heading'
  | 'too_long'
  | 'no_fact'
  | 'no_options'
  | 'illustration';

/** Plain-language reasons, shown to the student beside the skipped line. */
export const SKIP_LABEL: Record<SkipReason, string> = {
  too_short: 'too short to test',
  heading: 'looks like a heading',
  too_long: 'too long to read as a question',
  no_fact: 'no clear fact to test',
  no_options: "couldn't build enough answer options",
  illustration: 'an example, not a fact to test',
};

export interface SkippedLine {
  text: string;
  reason: SkipReason;
}

export interface ParseStats {
  linesRead: number;
  linesUsed: number;
  /** Every line that produced no question, with the reason why. */
  skipped: SkippedLine[];
  truncatedInput: boolean;
  cappedQuestions: boolean;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  stats: ParseStats;
}

// --- word lists ---------------------------------------------------------

/** Function words that must never become the blank, and never a distractor. */
const STOPWORDS = new Set(
  `a an and are as at be been being but by can cannot could did do does doing done
   down during each either else for from further had has have having he her here hers
   him his how however i if in into is it its itself just may me might more most much
   must my no nor not of off on once only or other our out over own same she should so
   some such than that the their them then there these they this those through to too
   under until up upon us very was we were what when where which while who whom why
   will with within without would you your yours also both few many several such via
   between among about after before above below because although though since whether
   often usually always never sometimes rather quite even still yet already
   one two three four five six seven eight nine ten first second third next last
   called known used using use uses make makes made get gets given give gives
   occur occurs occurred happen happens include includes including contain contains
   consist consists produce produces produced allow allows require requires`
    .split(/\s+/)
    .filter(Boolean)
);

/** Words that actually mark a heading, used to label the skip reason honestly. */
const HEADING_WORDS = new Set([
  'chapter',
  'unit',
  'week',
  'lesson',
  'section',
  'part',
  'topic',
  'module',
  'page',
  'figure',
  'table',
  'diagram',
  'summary',
  'review',
]);

/** Words that organise notes rather than appear in them — never quizzable. */
const STRUCTURAL = new Set([
  'chapter',
  'unit',
  'week',
  'lesson',
  'section',
  'part',
  'topic',
  'module',
  'page',
  'figure',
  'table',
  'diagram',
  'example',
  'summary',
  'review',
  'exam',
  'quiz',
  'test',
  'homework',
  'lecture',
  'class',
  'notes',
  'note',
  'today',
  'tomorrow',
  'yesterday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
]);

/**
 * Passive constructions ("X is described by…") look like definitions to a
 * regex but read terribly as questions. Better handled as cloze.
 */
const PASSIVE_MEANING =
  /^(?:described|known|used|found|called|seen|made|given|considered|regarded|classified|divided|composed|characterised|characterized|measured|represented|expressed|written|shown|caused|affected|studied|taught|based|related|linked|associated)\b/i;

/** Subjects that make a useless definition question. */
const WEAK_SUBJECTS = new Set([
  'it',
  'this',
  'that',
  'there',
  'they',
  'these',
  'those',
  'he',
  'she',
  'we',
  'you',
  'i',
  'the',
  'a',
  'an',
  'one',
  'some',
  'each',
  'both',
  'another',
  'such',
]);

// --- helpers ------------------------------------------------------------

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–|—/g, '-')
    .replace(/[ \t]+/g, ' ');
}

/** A note line, remembering how it was marked up before cleaning. */
interface Line {
  text: string;
  /** Was it a bullet or numbered item? List detection needs this. */
  marked: boolean;
  /** Numbered items imply a sequence; bullets do not. */
  numbered: boolean;
}

/** Strips bullets, numbering, and heading hashes, keeping what was there. */
function stripMarkers(raw: string): Line {
  const numbered = /^\s*\(?\d{1,2}[.)]\s+/.test(raw);
  const bulleted = /^\s*[-*•·>+]\s+/.test(raw) || /^\s*[a-z][.)]\s+/i.test(raw);
  const text = raw
    .replace(/^\s*(?:[-*•·>+]|\(?\d{1,2}[.)]|[a-z][.)])\s+/i, '')
    .replace(/^#+\s*/, '')
    .trim();
  return { text, marked: numbered || bulleted, numbered };
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Cuts a trailing illustration off a definition. Notes often run the meaning
 * and its example together on one line ("Hyperbole is exaggeration… Example:
 * I have told you a million times"), and the example belongs to neither the
 * question nor the answer. Returns '' when the text is nothing but example,
 * so the caller's length check rejects it.
 */
function stripIllustration(text: string): string {
  const cut = text.search(
    /(?:^|[.;]\s+)(?:examples?\s*[:—-]|for example\b|for instance\b|e\.?g\.?[\s:,])/i
  );
  if (cut < 0) return text;
  return text.slice(0, cut).replace(/[.;,\s]+$/, '');
}

function cleanTerm(term: string): string {
  return term.replace(/^[^\w(]+|[^\w)%]+$/g, '').trim();
}

function isNumeric(value: string): boolean {
  return /^-?\d[\d,]*(?:\.\d+)?%?$/.test(value.trim());
}

/**
 * Headings ("Chapter 4: Cellular Respiration", "Cell Structure") carry no
 * fact to test. Checked only after definition patterns have had their turn,
 * so "Osmosis: movement of water" is still caught as a definition.
 */
function isHeading(line: string): boolean {
  const first = words(line)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  if (HEADING_WORDS.has(first)) return true;

  // A heading labels what follows; it doesn't claim anything. "The eight most
  // common figures of speech" has no verb and no full stop, so there is
  // nothing in it to be right or wrong about.
  if (/[.!?;]$/.test(line)) return false;
  if (CLAIM_VERB.test(line)) return false;
  return wordCount(line) <= 8;
}

function isYear(value: string): boolean {
  const n = Number(value.replace(/[^\d-]/g, ''));
  return Number.isInteger(n) && n >= 1000 && n <= 2100;
}

/** Proper-noun-ish: starts capital and has a lowercase letter, or is an acronym. */
function titleish(word: string): boolean {
  const w = cleanTerm(word);
  if (!w) return false;
  return (/^[A-Z]/.test(w) && /[a-z]/.test(w)) || /^[A-Z]{2,}\d*$/.test(w);
}

/**
 * Deterministic shuffle seeded by the question text — stable across renders.
 *
 * Two things this has to get right, both about the low bits of the state:
 *
 *   - Math.imul, not `*`. Both multipliers overflow 2^53 as doubles and the
 *     rounding wipes the low bits out entirely. Written with plain `*` this
 *     returned one fixed permutation whatever the seed, which put the
 *     correct answer last in almost every multiple-choice question.
 *   - The index comes off the top of the state, not `% (i + 1)`. An LCG's
 *     low bits cycle far too short to pick from, and taking them left the
 *     first option a third more likely than the rest.
 */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  }
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = Math.floor((h / 0x1_0000_0000) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// --- definition patterns ------------------------------------------------

interface Definition {
  term: string;
  meaning: string;
  /** Phrasing differs for acronyms. */
  acronym: boolean;
}

function matchDefinitionShape(line: string): Definition | null {
  // "ATP stands for adenosine triphosphate"
  const stands = /^(.{1,40}?)\s+(?:stands for|is short for|is an acronym for)\s+(.+)$/i.exec(line);
  if (stands) {
    const term = cleanTerm(stands[1]);
    const meaning = stripIllustration(cleanTerm(stands[2]));
    if (term && wordCount(meaning) >= 1) return { term, meaning, acronym: true };
  }

  // "Chlorophyll: the green pigment…"  (guard against times and URLs)
  const colon = /^([^:]{2,60}):\s+(.{6,})$/.exec(line);
  if (colon && !/https?$/i.test(colon[1]) && !/\d$/.test(colon[1])) {
    const term = cleanTerm(colon[1]);
    const meaning = stripIllustration(cleanTerm(colon[2]));
    if (term && wordCount(term) <= 6 && wordCount(meaning) >= 2) {
      return { term, meaning, acronym: false };
    }
  }

  // "Osmosis = movement of water…"
  const equals = /^([^=]{2,60})=\s*(.{6,})$/.exec(line);
  if (equals) {
    const term = cleanTerm(equals[1]);
    const meaning = stripIllustration(cleanTerm(equals[2]));
    if (term && wordCount(term) <= 6 && wordCount(meaning) >= 2) {
      return { term, meaning, acronym: false };
    }
  }

  // "Mitosis - cell division" (spaced dash only, so hyphenated words survive)
  const dash = /^(.{2,40}?)\s+-\s+(.{6,})$/.exec(line);
  if (dash) {
    const term = cleanTerm(dash[1]);
    const meaning = stripIllustration(cleanTerm(dash[2]));
    if (term && wordCount(term) <= 5 && wordCount(meaning) >= 2) {
      return { term, meaning, acronym: false };
    }
  }

  // "Photosynthesis is the process by which…" / "X means Y" / "X refers to Y"
  const verb =
    /^(.{2,50}?)\s+(?:is|are)\s+(?:defined as|known as|called)\s+(.+)$|^(.{2,50}?)\s+(?:means|refers to)\s+(.+)$|^(.{2,50}?)\s+(?:is|are)\s+(.{12,})$/i.exec(
      line
    );
  if (verb) {
    const term = cleanTerm(verb[1] ?? verb[3] ?? verb[5] ?? '');
    const meaning = stripIllustration(cleanTerm(verb[2] ?? verb[4] ?? verb[6] ?? ''));
    const firstWord = words(term)[0]?.toLowerCase() ?? '';
    const negated = /^(?:not|also|only|still|always|never)\b/i.test(meaning);
    if (
      term &&
      meaning &&
      wordCount(term) <= 5 &&
      wordCount(meaning) >= 3 &&
      !WEAK_SUBJECTS.has(firstWord) &&
      !STRUCTURAL.has(firstWord) &&
      !negated &&
      !PASSIVE_MEANING.test(meaning)
    ) {
      return { term, meaning, acronym: false };
    }
  }

  return null;
}

/**
 * A definition, once the shapes that only look like one are turned away.
 * "Example: Peter picked a peck of pickled peppers" is a colon line, but
 * "Example" is not a term and the tongue twister is not its meaning.
 */
function matchDefinition(line: string): Definition | null {
  const found = matchDefinitionShape(line);
  if (!found) return null;

  const firstWord = words(found.term)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  if (STRUCTURAL.has(firstWord)) return null;

  // stripIllustration can empty a meaning that was nothing but example.
  if (wordCount(found.meaning) < 2) return null;

  return found;
}

function definitionPrompt(def: Definition): string {
  let meaning = def.meaning.replace(/\s*[.;]+$/, '');
  // Cleaning can eat a closing quote — put it back rather than leave it open.
  if ((meaning.match(/"/g)?.length ?? 0) % 2 === 1) meaning += '"';
  return def.acronym
    ? `Which term is short for "${meaning}"?`
    : `Which term means: ${meaning}?`;
}

// --- cloze deletion -----------------------------------------------------

interface Candidate {
  text: string;
  start: number;
  end: number;
  score: number;
}

/**
 * Finds the most quizzable span in a sentence. Prefers numbers, then proper
 * nouns, then terms repeated elsewhere in the notes, then long rare words.
 */
function clozeCandidates(sentence: string, frequency: Map<string, number>): Candidate[] {
  const tokens = sentence.split(/\s+/).filter(Boolean);
  const candidates: Candidate[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const bare = cleanTerm(raw);
    if (!bare) continue;
    const lower = bare.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (bare.length < 3 && !isNumeric(bare)) continue;

    let score = 0;
    let text = bare;
    let end = i;

    if (isNumeric(bare)) {
      score += isYear(bare) ? 11 : 10;
    } else if (titleish(bare) && i > 0) {
      score += 6;
      // Absorb a following capitalised word: "World War", "Calvin Cycle"
      const next = tokens[i + 1] ? cleanTerm(tokens[i + 1]) : '';
      if (next && titleish(next) && !STOPWORDS.has(next.toLowerCase())) {
        text = `${bare} ${next}`;
        end = i + 1;
        score += 2;
      }
    } else if (i === 0) {
      // Sentence-initial lowercase words are rarely the point.
      continue;
    }

    const seen = frequency.get(lower) ?? 0;
    if (seen >= 2) score += 4;
    // Long words are domain terms far more often than filler ("cytoplasm",
    // "photosynthesis"), so they clear the bar on length alone.
    if (bare.length >= 9) score += 4;
    else if (bare.length >= 7) score += 2;
    else if (bare.length >= 6) score += 1;

    if (score <= 0) continue;
    if (wordCount(text) > LIMITS.maxAnswerWords) continue;

    candidates.push({ text, start: i, end, score });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function buildCloze(sentence: string, candidate: Candidate): string {
  const tokens = sentence.split(/\s+/).filter(Boolean);
  const before = tokens.slice(0, candidate.start).join(' ');
  const after = tokens.slice(candidate.end + 1).join(' ');
  // Keep punctuation that trailed the blanked token, so the sentence still reads.
  const trailing = /[.,;:!?)"']+$/.exec(tokens[candidate.end])?.[0] ?? '';
  return `${before} ______${trailing} ${after}`.replace(/\s+/g, ' ').trim();
}

// --- distractors --------------------------------------------------------

function numericDistractors(value: string, seed: string): string[] {
  const suffix = value.endsWith('%') ? '%' : '';
  const n = Number(value.replace(/[,%]/g, ''));
  if (!Number.isFinite(n)) return [];

  const out = new Set<string>();
  const push = (v: number) => {
    if (!Number.isFinite(v)) return;
    const rounded = Number.isInteger(n) ? Math.round(v) : Number(v.toFixed(2));
    if (rounded === n || (n > 0 && rounded <= 0)) return;
    out.add(`${rounded}${suffix}`);
  };

  if (isYear(value)) {
    for (const delta of [2, 5, 11, 20, 3]) push(n + (out.size % 2 === 0 ? delta : -delta));
  } else if (Math.abs(n) <= 12) {
    for (const delta of [1, 2, 3, 4]) push(n + delta), push(n - delta);
  } else {
    for (const factor of [0.5, 0.75, 1.25, 1.5, 2]) push(n * factor);
  }

  return seededShuffle([...out], seed).slice(0, 3);
}

/** Picks wrong answers from other terms in the same notes, matched by shape. */
function termDistractors(answer: string, pool: string[], seed: string): string[] {
  const answerLower = answer.toLowerCase();
  const answerWords = wordCount(answer);
  const usable = pool.filter((term) => {
    const lower = term.toLowerCase();
    if (lower === answerLower) return false;
    if (lower.includes(answerLower) || answerLower.includes(lower)) return false;
    // A bare number is never a believable stand-in for a term.
    if (isNumeric(term)) return false;
    if (words(lower).some((w) => STRUCTURAL.has(w.replace(/[^a-z]/g, '')))) return false;
    return true;
  });

  // Prefer candidates with a similar word count so options look uniform.
  const ranked = [...new Set(usable)].sort((a, b) => {
    const da = Math.abs(wordCount(a) - answerWords);
    const db = Math.abs(wordCount(b) - answerWords);
    if (da !== db) return da - db;
    return Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length);
  });

  const near = ranked.filter((t) => Math.abs(wordCount(t) - answerWords) <= 1);
  const shuffled = seededShuffle(near.length >= 3 ? near : ranked, seed);

  // Reject options that overlap each other ("Allosteric" beside "Allosteric
  // regulation" gives the answer away).
  const chosen: string[] = [];
  for (const term of shuffled) {
    const lower = term.toLowerCase();
    const overlaps = chosen.some((picked) => {
      const other = picked.toLowerCase();
      return other.includes(lower) || lower.includes(other);
    });
    if (overlaps) continue;
    chosen.push(term);
    if (chosen.length === 3) break;
  }
  return chosen;
}

/**
 * Three wrong answers for one right one.
 *
 * Numbers get near-miss numbers, which need nothing but the answer itself;
 * everything else borrows sibling terms from `pool`, so a subject with
 * little in it yet will honestly return fewer than three rather than pad
 * the question out with filler.
 *
 * Exported because a question the student wrote by hand needs decoys too,
 * and it must get them from the same code the parser's questions use.
 */
export function suggestDistractors(
  answer: string,
  pool: readonly string[],
  seed: string
): string[] {
  const clean = answer.trim();
  if (!clean) return [];
  return isNumeric(clean)
    ? numericDistractors(clean, seed)
    : termDistractors(clean, [...pool], seed);
}

// --- enumeration --------------------------------------------------------

const NUMBER_WORD: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

export const ENUM_LIMITS = { min: 3, max: 6 } as const;

interface EnumDraft {
  title: string;
  items: string[];
  ordered: boolean;
  source: string;
}

/** Instructions ("read chapter 4") are tasks to do, not facts to learn. */
const TASK_LINE =
  /^(?:read|answer|do|study|watch|bring|submit|review|finish|complete|practice|memorise|memorize|revise|prepare|email|print|ask)\b/i;

/**
 * The text before the colon. The count word is dropped because the prompt
 * already states the number — "List the 4: four stages" reads badly.
 */
function cleanListTitle(raw: string): string {
  return raw
    .replace(/\s*:\s*$/, '')
    .replace(/^(?:the|these|those)\s+/i, '')
    .replace(/^(?:two|three|four|five|six|seven|eight)\s+/i, '')
    .trim();
}

function plausibleItem(text: string): boolean {
  const count = wordCount(text);
  if (count < 1 || count > 5) return false;
  return !TASK_LINE.test(text);
}

/**
 * "Stages of mitosis:" followed by marked short lines. The colon line must
 * have nothing substantial after it, or it's a definition instead.
 */
function findListBlocks(lines: Line[]): { drafts: EnumDraft[]; consumed: Set<number> } {
  const drafts: EnumDraft[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const head = lines[i];
    if (!/:\s*$/.test(head.text)) continue;

    const title = cleanListTitle(head.text);
    const firstWord = words(title)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
    if (!title || STRUCTURAL.has(firstWord)) continue;

    const items: string[] = [];
    let numbered = false;
    let j = i + 1;
    while (j < lines.length && lines[j].marked && plausibleItem(lines[j].text)) {
      items.push(lines[j].text.replace(/[.;,]$/, ''));
      numbered = numbered || lines[j].numbered;
      j++;
    }

    if (items.length < ENUM_LIMITS.min || items.length > ENUM_LIMITS.max) continue;

    drafts.push({
      title,
      items,
      ordered: numbered,
      source: `${head.text} ${items.join(', ')}`,
    });
    for (let k = i; k < j; k++) consumed.add(k);
    i = j - 1;
  }

  return { drafts, consumed };
}

/** "The four stages of mitosis are prophase, metaphase, anaphase and telophase." */
function findInlineSeries(line: string): EnumDraft | null {
  const match =
    /^(.{3,60}?)\s+(?:are|include|consist of|comprise)\s+(.+)$/i.exec(line) ??
    /^(.{3,60}?):\s+(.+,.+)$/.exec(line);
  if (!match) return null;

  // Read the count from the raw title — cleanListTitle removes it.
  const stated = words(match[1])
    .map((w) => NUMBER_WORD[w.toLowerCase().replace(/[^a-z]/g, '')])
    .find((n) => n != null);

  const title = cleanListTitle(match[1]);
  // "Example: buzz, clang, hiss" is an illustration, not a list to memorise.
  const firstWord = words(title)[0]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
  if (!title || STRUCTURAL.has(firstWord)) return null;

  const tail = match[2].replace(/\.$/, '');
  if (!/,/.test(tail)) return null;

  const items = tail
    .split(/\s*,\s*|\s+and\s+|\s+or\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  if (items.length < ENUM_LIMITS.min || items.length > ENUM_LIMITS.max) return null;
  if (!items.every(plausibleItem)) return null;

  // When the title states a count, it must agree — otherwise we split wrong.
  if (stated != null && stated !== items.length) return null;

  return { title, items, ordered: false, source: line };
}

/** Splits a line into sentences, keeping abbreviations intact enough. */
function splitSentences(line: string): string[] {
  return line
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function enumerationPrompt(draft: EnumDraft): string {
  const title = draft.title.replace(/^(?:list|name)\s+/i, '');
  return `List the ${draft.items.length}: ${title}`;
}

// --- main ---------------------------------------------------------------

export function parseNotes(input: string): ParseResult {
  const truncatedInput = input.length > LIMITS.maxInputChars;
  const text = normalize(truncatedInput ? input.slice(0, LIMITS.maxInputChars) : input);

  const lines = text
    .split('\n')
    .map(stripMarkers)
    .filter((line) => line.text.length > 0);
  const rawLines = lines.map((line) => line.text);

  // Word frequency across the whole note — repeated words are likely key terms.
  const frequency = new Map<string, number>();
  for (const word of text.toLowerCase().split(/[^a-z0-9'-]+/)) {
    if (!word || STOPWORDS.has(word) || word.length < 4) continue;
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  interface Draft {
    prompt: string;
    answer: string;
    kind: QuestionKind;
    source: string;
    /** Enumeration carries its whole item list instead of one answer. */
    items?: string[];
    ordered?: boolean;
  }
  const drafts: Draft[] = [];
  const termPool = new Set<string>();
  const skipped: SkippedLine[] = [];
  let linesUsed = 0;

  // Lists first — they span several lines, and those lines must not then be
  // read again as standalone facts.
  const { drafts: listDrafts, consumed } = findListBlocks(lines);
  for (const draft of listDrafts) {
    drafts.push({
      prompt: enumerationPrompt(draft),
      answer: draft.items[0],
      kind: 'enumeration',
      source: draft.source,
      items: draft.items,
      ordered: draft.ordered,
    });
    // List items are exactly the kind of sibling terms that make good decoys
    // for the other questions in these notes.
    draft.items.forEach((item) => termPool.add(item));
    linesUsed++;
  }

  for (let index = 0; index < rawLines.length; index++) {
    if (consumed.has(index)) continue;
    const line = rawLines[index];

    if (wordCount(line) < LIMITS.minWordsPerLine) {
      skipped.push({ text: line, reason: 'too_short' });
      continue;
    }

    // A to-do line has nothing to learn, even when it parses cleanly.
    if (TASK_LINE.test(line)) {
      skipped.push({ text: line, reason: 'no_fact' });
      continue;
    }

    // A list can be the second sentence of a paragraph, so check each one.
    const series = splitSentences(line)
      .map(findInlineSeries)
      .find((found): found is EnumDraft => found != null);
    if (series) {
      drafts.push({
        prompt: enumerationPrompt(series),
        answer: series.items[0],
        kind: 'enumeration',
        source: series.source,
        items: series.items,
        ordered: series.ordered,
      });
      series.items.forEach((item) => termPool.add(item));
      linesUsed++;
      continue;
    }

    const definition = matchDefinition(line);
    if (definition && wordCount(definition.term) <= LIMITS.maxAnswerWords) {
      drafts.push({
        prompt: definitionPrompt(definition),
        answer: definition.term,
        kind: 'definition',
        source: line,
      });
      termPool.add(definition.term);
      linesUsed++;
      continue;
    }

    if (isHeading(line)) {
      skipped.push({ text: line, reason: 'heading' });
      continue;
    }

    // Cloze: split the line into sentences and try each.
    const sentences = line
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter(Boolean);

    let used = false;
    let reason: SkipReason = 'no_fact';
    for (const sentence of sentences) {
      // An illustration demonstrates a fact, it doesn't state one. Blanking a
      // word out of "Example: Peter picked a peck of pickled peppers" tests
      // whether you memorised a tongue twister, not what alliteration is.
      if (ILLUSTRATION_PREFIX.test(sentence)) {
        reason = 'illustration';
        continue;
      }

      const count = wordCount(sentence);
      if (count > LIMITS.maxSentenceWords) {
        reason = 'too_long';
        continue;
      }
      if (count < LIMITS.minWordsPerLine) continue;
      if (/\?$/.test(sentence)) continue;

      const [best] = clozeCandidates(sentence, frequency);
      if (!best || best.score < 4) continue;

      drafts.push({
        prompt: buildCloze(sentence, best),
        answer: best.text,
        kind: 'cloze',
        source: sentence,
      });
      termPool.add(best.text);
      used = true;
    }

    if (used) linesUsed++;
    else skipped.push({ text: line, reason });
  }

  // Extra distractor material: capitalised terms anywhere in the notes.
  for (const match of text.matchAll(/\b[A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{2,}){0,2}\b/g)) {
    const term = cleanTerm(match[0]);
    if (!term) continue;
    const lower = term.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (words(lower).some((w) => STRUCTURAL.has(w))) continue;
    termPool.add(term);
  }

  const pool = [...termPool];
  const questions: ParsedQuestion[] = [];
  const seenPrompts = new Set<string>();

  for (const draft of drafts) {
    if (questions.length >= LIMITS.maxQuestions) break;

    const key = draft.prompt.toLowerCase();
    if (seenPrompts.has(key)) continue;

    // Enumeration needs no decoys — the items are the answer.
    if (draft.kind === 'enumeration' && draft.items) {
      seenPrompts.add(key);
      questions.push({
        prompt: draft.prompt,
        correctAnswer: draft.items[0],
        answers: draft.items,
        kind: 'enumeration',
        sourceLine: draft.source,
        ordered: draft.ordered,
      });
      continue;
    }

    const seed = draft.prompt + draft.answer;
    const distractors = isNumeric(draft.answer)
      ? numericDistractors(draft.answer, seed)
      : termDistractors(draft.answer, pool, seed);

    // A multiple-choice question needs three believable wrong answers or it
    // isn't a question — drop it rather than pad with nonsense.
    if (distractors.length < 3) {
      skipped.push({ text: draft.source, reason: 'no_options' });
      continue;
    }

    seenPrompts.add(key);
    questions.push({
      prompt: draft.prompt,
      correctAnswer: draft.answer,
      answers: seededShuffle([draft.answer, ...distractors], seed),
      kind: draft.kind,
      sourceLine: draft.source,
    });
  }

  return {
    questions,
    stats: {
      linesRead: rawLines.length,
      linesUsed,
      skipped,
      truncatedInput,
      cappedQuestions: drafts.length > questions.length && questions.length >= LIMITS.maxQuestions,
    },
  };
}
