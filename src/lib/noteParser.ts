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

export const LIMITS = {
  /** Roughly 4–5 pages. Not a perf limit — reviewing more than this is misery. */
  maxInputChars: 10_000,
  maxQuestions: 50,
  minWordsPerLine: 4,
  /** Longer sentences make unreadable questions on a phone. */
  maxSentenceWords: 35,
  maxAnswerWords: 5,
} as const;

export type QuestionKind = 'definition' | 'cloze';

export interface ParsedQuestion {
  prompt: string;
  correctAnswer: string;
  /** Exactly 4 options, shuffled. */
  answers: string[];
  kind: QuestionKind;
  sourceLine: string;
}

export type SkipReason = 'too_short' | 'heading' | 'too_long' | 'no_fact' | 'no_options';

/** Plain-language reasons, shown to the student beside the skipped line. */
export const SKIP_LABEL: Record<SkipReason, string> = {
  too_short: 'too short to test',
  heading: 'looks like a heading',
  too_long: 'too long to read as a question',
  no_fact: 'no clear fact to test',
  no_options: "couldn't build enough answer options",
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

/** Strips bullets, numbering, and trailing punctuation noise. */
function stripMarkers(line: string): string {
  return line
    .replace(/^\s*(?:[-*•·>+]|\(?\d{1,2}[.)]|[a-z][.)])\s+/i, '')
    .replace(/^#+\s*/, '')
    .trim();
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function wordCount(text: string): number {
  return words(text).length;
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
  // Short, capitalised, and unpunctuated is a title, not a statement.
  return wordCount(line) <= 6 && /^[A-Z]/.test(line) && !/[.!?,;]$/.test(line);
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

/** Deterministic shuffle seeded by the question text — stable across renders. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) * 16777619;
    h >>>= 0;
  }
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
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

function matchDefinition(line: string): Definition | null {
  // "ATP stands for adenosine triphosphate"
  const stands = /^(.{1,40}?)\s+(?:stands for|is short for|is an acronym for)\s+(.+)$/i.exec(line);
  if (stands) {
    const term = cleanTerm(stands[1]);
    const meaning = cleanTerm(stands[2]);
    if (term && wordCount(meaning) >= 1) return { term, meaning, acronym: true };
  }

  // "Chlorophyll: the green pigment…"  (guard against times and URLs)
  const colon = /^([^:]{2,60}):\s+(.{6,})$/.exec(line);
  if (colon && !/https?$/i.test(colon[1]) && !/\d$/.test(colon[1])) {
    const term = cleanTerm(colon[1]);
    const meaning = cleanTerm(colon[2]);
    if (term && wordCount(term) <= 6 && wordCount(meaning) >= 2) {
      return { term, meaning, acronym: false };
    }
  }

  // "Osmosis = movement of water…"
  const equals = /^([^=]{2,60})=\s*(.{6,})$/.exec(line);
  if (equals) {
    const term = cleanTerm(equals[1]);
    const meaning = cleanTerm(equals[2]);
    if (term && wordCount(term) <= 6 && wordCount(meaning) >= 2) {
      return { term, meaning, acronym: false };
    }
  }

  // "Mitosis - cell division" (spaced dash only, so hyphenated words survive)
  const dash = /^(.{2,40}?)\s+-\s+(.{6,})$/.exec(line);
  if (dash) {
    const term = cleanTerm(dash[1]);
    const meaning = cleanTerm(dash[2]);
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
    const meaning = cleanTerm(verb[2] ?? verb[4] ?? verb[6] ?? '');
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

function definitionPrompt(def: Definition): string {
  const meaning = def.meaning.replace(/\s*[.;]+$/, '');
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

// --- main ---------------------------------------------------------------

export function parseNotes(input: string): ParseResult {
  const truncatedInput = input.length > LIMITS.maxInputChars;
  const text = normalize(truncatedInput ? input.slice(0, LIMITS.maxInputChars) : input);

  const rawLines = text
    .split('\n')
    .map(stripMarkers)
    .filter((line) => line.length > 0);

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
  }
  const drafts: Draft[] = [];
  const termPool = new Set<string>();
  const skipped: SkippedLine[] = [];
  let linesUsed = 0;

  for (const line of rawLines) {
    if (wordCount(line) < LIMITS.minWordsPerLine) {
      skipped.push({ text: line, reason: 'too_short' });
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
