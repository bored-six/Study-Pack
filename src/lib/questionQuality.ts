/**
 * Whether a generated question is worth asking.
 *
 * The parser had no such gate. Each format built a prompt and pushed it,
 * so every rule about what makes a question answerable had to be
 * remembered separately in each place, and mostly was not. What came out
 * was questions that answered themselves ("Which term means: Light moves
 * in straight lines…?" — Light Travel), questions carrying an aside that
 * explained nothing ("…faster than sound (why you see lightning before
 * hearing thunder)"), and questions that pointed at something they had
 * not said ("The Sun is a star at the centre of it").
 *
 * Everything here is a rule about the shape of a question rather than a
 * fix for one note, and every draft goes through `isAskable` before it
 * reaches the review screen.
 */

/** Words too common to count as a giveaway when they turn up in a prompt. */
const COMMON = new Set(
  `about above after against along among around because before behind below
   between beyond during except inside into near outside over since through
   under until upon within without also both each either every other some
   such than that their them then there these this those very what when
   where which while will with would your
   thing things kind kinds type types form forms part parts way ways
   used using make makes made give gives given take takes taken
   called known first second third next last more most less least`.split(/\s+/)
);

/** The words in a phrase that actually carry its meaning. */
export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !COMMON.has(word));
}

/**
 * How long a word has to be before finding it in the prompt counts as
 * giving the answer away.
 *
 * Four letters is too short — "cell" turning up in "the layer around a
 * cell" leaves "cell membrane" a fair question. Five is where a repeated
 * word stops being incidental and starts being the answer.
 */
const TELLING_LENGTH = 5;

/**
 * The prompt contains the answer.
 *
 * A question that says the thing it is asking for tests reading, not
 * recall. This is the single most common way a generated question is
 * worthless, and nothing was checking for it.
 */
export function givesItselfAway(prompt: string, answer: string): boolean {
  const inPrompt = new Set(contentWords(prompt));
  return contentWords(answer).some(
    (word) => word.length >= TELLING_LENGTH && inPrompt.has(word)
  );
}

/**
 * The meaning refers to something it never named.
 *
 * "The Sun is a star at the centre of it" only makes sense next to the
 * term it came from, so on its own it is unanswerable — and the "it" is
 * the answer, which makes it circular as well as vague.
 */
export function danglesOutward(meaning: string): boolean {
  const text = meaning.trim();
  if (/^(?:this|these|those|it|they|them)\b/i.test(text)) return true;
  return /\b(?:of|to|for|in|on|from|with|by|about|around|inside|within)\s+(?:it|them|this|these|those)\s*[.!?]?$/i.test(
    text
  );
}

/**
 * The definition, trimmed to the part that defines.
 *
 * A note explains as it goes: a bracketed aside, an "e.g." tail, a "which
 * is why…" clause. All of it is help for the reader of the note and noise
 * in a question, so it is cut before the prompt is built rather than
 * carried into it.
 */
export function tightenMeaning(meaning: string): string {
  const tightened = meaning
    // a trailing aside — "(why you see lightning before hearing thunder)"
    .replace(/\s*\([^)]*\)\s*$/, '')
    // An illustration tacked on the end. The word-boundary goes inside the
    // alternation: "e.g." ends in a full stop, and \b after one never
    // matches, so a trailing \b silently disabled this whole branch.
    .replace(
      /\s*[,;-]?\s*(?:\be\.?\s?g\.?|\b(?:for example|for instance|such as|like)\b)[^.]*$/i,
      ''
    )
    // a "which is why…" aftertthought
    .replace(/\s*,?\s*\bwhich is why\b[^.]*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[,;]\s*$/, '')
    .trim();

  // Never trim a definition down to a fragment; a short one was fine as it was.
  return contentWords(tightened).length >= 2 ? tightened : meaning.trim();
}

export interface Askable {
  prompt: string;
  answer: string;
}

/** The most a prompt may run to and still be read on a phone. */
const MAX_PROMPT_WORDS = 32;

/**
 * The one gate every generated question passes, whatever built it.
 *
 * Deliberately strict: a note that yields four good questions and drops
 * two is a better deck than one that yields six of which two are
 * nonsense, because the nonsense is what makes someone stop trusting the
 * whole thing.
 */
export function isAskable({ prompt, answer }: Askable): boolean {
  const question = prompt.trim();
  const solution = answer.trim();
  if (!question || !solution) return false;

  // Something has to be asked, and something has to be answerable.
  if (contentWords(question).length < 3) return false;
  // Not contentWords: plenty of real answers are shorter than a content
  // word ever is — "36", "pH", "DNA" — and a gate that drops those is
  // wrong about answers rather than strict about them.
  if (!/[a-z0-9]/i.test(solution)) return false;
  if (question.split(/\s+/).length > MAX_PROMPT_WORDS) return false;

  // Markup that survived cleaning is a sign the line was never prose.
  if (/[\\${}|<>]|\s\s/.test(question)) return false;

  if (givesItselfAway(question, solution)) return false;
  return true;
}

/**
 * Options that would not survive being read next to the question.
 *
 * A distractor already sitting in the prompt is either a tell or a
 * confusion, and it is the prompt that decides — which is why this cannot
 * live in the distractor picker, which never sees one.
 */
export function fitsAsOption(option: string, prompt: string, answer: string): boolean {
  const clean = option.trim();
  if (!clean) return false;
  if (clean.toLowerCase() === answer.trim().toLowerCase()) return false;

  const inPrompt = new Set(contentWords(prompt));
  const words = contentWords(clean);

  // Short options — "7", "pH" — carry no content words at all, so the
  // content-word test says nothing about them. Ask the literal question
  // instead: is this token already printed in the prompt?
  if (words.length === 0) {
    const token = clean.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!token) return false;
    return !contentWords(prompt)
      .concat(prompt.toLowerCase().split(/[^a-z0-9]+/))
      .includes(token);
  }

  // Every word of it is already on the page: it reads as part of the question.
  return !words.every((word) => inPrompt.has(word));
}

/**
 * How far an option's length may sit from its neighbours' before the shape
 * of the word answers the question on its own.
 */
const SIZE_BAND = 1.6;

/**
 * Whether an option set can be shown side by side without the answer
 * standing out.
 *
 * Four options are only a question if choosing between them needs the
 * material. "Which term is short for adenosine triphosphate?" offering ATP
 * beside Anaphase, Chlorophyll and Calvin Cycle is not a question — the
 * three-letter one is the initialism whatever the stem says, and a student
 * who has never opened the notes gets it.
 *
 * The picker already prefers decoys of the answer's own shape and size, so
 * this only catches what the notes could not supply: an initialism in a set
 * of notes holding no other initialisms. There is no honest way to build
 * that set, and inventing a plausible-looking decoy would be inventing
 * material. The question is still worth asking — it just has to be asked as
 * one the student types rather than picks.
 *
 * The same reasoning already governs modified true/false, which refuses a
 * multi-word answer because the long chip would give itself away.
 */
export function optionsAreLevel(answer: string, options: readonly string[]): boolean {
  const decoys = options.filter((option) => option !== answer).map((option) => option.trim().length);
  if (decoys.length === 0) return true;

  const shortest = Math.min(...decoys);
  const longest = Math.max(...decoys);
  const size = answer.trim().length;

  return size <= longest * SIZE_BAND && size * SIZE_BAND >= shortest;
}
