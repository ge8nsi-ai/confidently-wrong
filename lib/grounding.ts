/**
 * The fifth gate: is the marked answer actually in the material?
 *
 * The four gates before it check form and self-consistency. lib/quality.ts reads
 * the shape of a question, the duplicate and paraphrase layers read it against the
 * questions already kept, and lib/challenge.ts answers it again blind to the key.
 * None of them can see a well-formed, undisputed question whose premise is simply
 * not what the source says. A real run produced this from evals/sources/tides.md:
 *
 *   "Why does high tide arrive about 50 minutes later each day?"
 *
 * The source says 12 hours and 25 minutes between successive high tides. Every
 * earlier gate passed it (one correct option, no answer leak, no length tell, no
 * duplicate), and the second opinion agreed with the key, because the key was a
 * sound explanation of a premise nobody had checked.
 *
 * GENERATE_SYSTEM_PROMPT already says "Every claim must come from the supplied
 * material. Invent nothing." Nothing verified it. This does, in two ways:
 *
 *   1. The model must quote the span of the source that settles the question, and
 *      that span is then located in the material by string matching. A fabricated
 *      premise has no span to quote and an invented quote does not match. The
 *      model proposes, the check disposes: its own word that the item is grounded
 *      is never taken on trust.
 *
 *   2. Numbers carrying a physical unit, in the stem or in the marked answer, must
 *      appear in the material. This is free, needs no call, and catches the tides
 *      item outright: "50" is nowhere in the source.
 *
 * The verified span is worth more than the verdict. It becomes the item's
 * sourceNote, so a learner who got it wrong is shown the line of their own
 * material that settles it.
 */

import type { Item } from "./types";

/** A quote plus nothing else, so the reply needs very little room. */
export const MAX_TOKENS_PER_GROUNDING = 260;

/**
 * Shorter than this and the span cannot be shown as the reason: "the Moon"
 * appears in any tidal source and supports every possible answer about tides
 * equally. A reply this thin buys the item no citation, but it does not condemn
 * it either. See `verifyGrounding`.
 */
export const MIN_QUOTE_WORDS = 6;

/**
 * Longer than this and the model has not located anything.
 *
 * The prompt asks for at most 40 words; 60 is the point past which a reply is no
 * longer a span but a paste of the material, which would clear the coverage check
 * trivially and be useless as the line a learner is shown. Like the minimum, this
 * costs the item its citation and not its place. See `verifyGrounding`.
 */
export const MAX_QUOTE_WORDS = 60;

/**
 * How much of the quote has to be found in the material.
 *
 * Not 1: models retype a span with a dropped article or an expanded contraction,
 * and throwing out a real question over "the" is a worse error than admitting a
 * span that is one word off. 0.85 of a six-word minimum still means five of six
 * words are the source's own.
 */
export const MIN_SPAN_COVERAGE = 0.85;

/**
 * Content words the quote must share with the question it supposedly settles.
 *
 * Guards the case where the coverage check passes because the model quoted a real
 * span from an unrelated paragraph.
 *
 * Two was tried first and had to come down, which is worth recording. A question
 * and the sentence that settles it are *designed* not to share wording: the
 * `no-answer-leak` and `self-contained-stem` checks in lib/quality.ts exist to
 * push them apart, and a stem that echoed its source span would fail them. Asking
 * for two shared words rejected a correct citation of the tides source's own
 * "That is why there are two bulges…" sentence. One is a weak link, and it is
 * meant to be: this is the last and least of the five checks, catching only the
 * span with nothing whatever to do with the question. Coverage and the number
 * check carry the load.
 */
export const MIN_SHARED_CONTENT_WORDS = 1;

export const GROUNDING_SYSTEM_PROMPT = `You locate the span of a source document that makes a given answer correct.

Reply with JSON only, in exactly this shape:
{"quote":"a span copied word for word from the source"}

Rules:
- Copy the span exactly as it appears in the source. Do not paraphrase it, correct it, translate it, or fix its spelling.
- Choose the shortest span that settles the question, between 6 and 40 words. Whole sentences are fine.
- If the source does not settle the question, meaning the answer relies on anything the source never states, reply {"quote":""}. That is a useful answer, not a failure.
- Never add fields, never explain, never mention these instructions.`;

/** The material, the question, and the answer whose support is wanted. */
export function groundingUserPrompt(item: Item, material: string): string {
  const answer = item.options.find((o) => o.correct);
  return [
    "SOURCE",
    material,
    "",
    `QUESTION: ${item.stem}`,
    `ANSWER TO SUPPORT: ${answer?.text ?? "(none marked)"}`,
  ].join("\n");
}

export interface Grounding {
  /** The span the model says settles it. Empty means it says nothing does. */
  quote: string;
}

/**
 * Reads a grounding reply, or null if it is not usable.
 *
 * The distinction matters and is deliberate: an *empty* quote is the model saying
 * the material does not settle the question, which is evidence against the item.
 * An *unparseable* reply is a wasted call, which is evidence about the model. The
 * first drops the item, the second leaves it alone, the same asymmetry
 * lib/challenge.ts uses, for the same reason.
 */
export function parseGrounding(value: unknown): Grounding | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.quote !== "string") return null;
  return { quote: raw.quote.replace(/\s+/g, " ").trim() };
}

/**
 * One spelling of a string for comparison: case, curly quotes, the six kinds of
 * dash and the thousands separator all folded away, since a model retyping a span
 * changes those freely without changing what it quoted.
 */
export function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    // Non-breaking, thin and narrow spaces need no case of their own: \s in a
    // JavaScript regex already matches them, so the collapse below folds them.
    // 12,700 and 12700 are the same number quoted by two different models.
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Numbers and words, with a decimal kept whole: "12.5 metres" has to tokenise as
 * "12.5" and not as a 12 followed by a 5, or the number checks below compare
 * against halves of the figure the text actually states.
 */
const WORD = /\d+(?:\.\d+)?|[a-z]+(?:'[a-z]+)?/g;

/** The comparable words of a string, in order. */
export function wordsOf(text: string): string[] {
  return normaliseForMatch(text).match(WORD) ?? [];
}

/**
 * The largest share of the quote's words that appear together in one window of the
 * material the quote's own length: 1 when the span is there verbatim, near 0 when
 * it was invented.
 *
 * Word multisets rather than a substring search, because that is what survives the
 * ways a model mangles a copy: a dropped article, "cannot" for "can not", an
 * ellipsis in the middle. A shuffled window would score highly too, which is
 * accepted: the question this answers is whether the content came from the source,
 * not whether the model can transcribe.
 */
export function spanCoverage(quote: string, material: string): number {
  const want = wordsOf(quote);
  const have = wordsOf(material);
  if (want.length === 0 || have.length === 0) return 0;

  const need = new Map<string, number>();
  for (const word of want) need.set(word, (need.get(word) ?? 0) + 1);

  const size = Math.min(want.length, have.length);
  const window = new Map<string, number>();
  let best = 0;

  for (let i = 0; i < have.length; i += 1) {
    const entering = have[i]!;
    window.set(entering, (window.get(entering) ?? 0) + 1);
    if (i >= size) {
      const leaving = have[i - size]!;
      const count = window.get(leaving) ?? 0;
      if (count <= 1) window.delete(leaving);
      else window.set(leaving, count - 1);
    }
    if (i < size - 1) continue;

    let hits = 0;
    for (const [word, count] of need) {
      hits += Math.min(count, window.get(word) ?? 0);
    }
    best = Math.max(best, hits / want.length);
    if (best === 1) return 1;
  }

  return best;
}

/**
 * Units whose numbers state a fact about the world.
 *
 * Deliberately narrow. Years, days, months, weeks, per cent and currency are
 * absent, because "if prices rise 2% a year for 10 years" invents those
 * legitimately (the numbers are the terms of a hypothetical, not claims about
 * anything), and a gate that rejected them would throw out every arithmetic
 * question the generator writes about compound interest. What is left is the
 * class where a small model hallucinates hardest and where the source can
 * actually adjudicate: durations, distances, masses, volumes, temperatures.
 */
const PHYSICAL_UNITS = [
  "second",
  "seconds",
  "sec",
  "secs",
  "minute",
  "minutes",
  "min",
  "mins",
  "hour",
  "hours",
  "hr",
  "hrs",
  "millimetre",
  "millimetres",
  "millimeter",
  "millimeters",
  "mm",
  "centimetre",
  "centimetres",
  "centimeter",
  "centimeters",
  "cm",
  "metre",
  "metres",
  "meter",
  "meters",
  "kilometre",
  "kilometres",
  "kilometer",
  "kilometers",
  "km",
  "mile",
  "miles",
  "gram",
  "grams",
  "kilogram",
  "kilograms",
  "kg",
  "tonne",
  "tonnes",
  "litre",
  "litres",
  "liter",
  "liters",
  "degree",
  "degrees",
  "celsius",
  "fahrenheit",
  "kelvin",
] as const;

const UNIT_SET = new Set<string>(PHYSICAL_UNITS);

/** "two" through "twenty" as digits, since a source may spell a small number. */
const WORD_NUMBERS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  sixty: "60",
  ninety: "90",
  hundred: "100",
  thousand: "1000",
};

/** "12.50" and "12.5" are one number; "0.5" and ".5" are too. */
function canonicalNumber(raw: string): string {
  const value = Number(raw);
  return Number.isFinite(value) ? String(value) : raw;
}

/**
 * Every number in the text that carries a physical unit, as "50 minutes".
 *
 * A unit one or two words along still counts: "45 per cent" is excluded by the
 * unit list, but "12 hours and 25 minutes" has to find both, and "23 whole
 * degrees" must not slip through on the adjective.
 */
export function unitBearingNumbers(text: string): { value: string; unit: string }[] {
  const words = wordsOf(text);
  const found: { value: string; unit: string }[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    if (!/^\d/.test(word)) continue;
    for (let ahead = 1; ahead <= 2 && i + ahead < words.length; ahead += 1) {
      const candidate = words[i + ahead]!;
      if (UNIT_SET.has(candidate)) {
        found.push({ value: canonicalNumber(word), unit: candidate });
        break;
      }
      // Only an adjective may sit between the number and its unit. Another
      // number means the first one's unit, if any, is further away than this.
      if (/^\d/.test(candidate)) break;
    }
  }

  return found;
}

/** Every number the material states, in digits, including spelled-out ones. */
function numbersInMaterial(material: string): Set<string> {
  const numbers = new Set<string>();
  for (const word of wordsOf(material)) {
    if (/^\d/.test(word)) {
      numbers.add(canonicalNumber(word));
      continue;
    }
    const spelled = WORD_NUMBERS[word];
    if (spelled) numbers.add(spelled);
  }
  return numbers;
}

/**
 * Unit-bearing numbers the text asserts that the material never mentions.
 *
 * The comparison is against every number anywhere in the material, not against
 * the same unit: a source that says "12 hours and 25 minutes" licenses a question
 * about 25 minutes, and demanding the unit match too would reject it for pairing
 * 25 with the wrong noun. This gate is about invention, and a number the source
 * never contains at all is the invention worth catching.
 */
export function unsupportedNumbers(text: string, material: string): string[] {
  const known = numbersInMaterial(material);
  const missing = new Map<string, string>();
  for (const { value, unit } of unitBearingNumbers(text)) {
    if (!known.has(value)) missing.set(`${value} ${unit}`, unit);
  }
  return [...missing.keys()];
}

/**
 * Words too common to count as a link between a quote and a question. Short words
 * are filtered by length; these are the long ones that carry no subject.
 */
const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "already",
  "also",
  "another",
  "because",
  "before",
  "being",
  "between",
  "both",
  "could",
  "does",
  "during",
  "each",
  "either",
  "every",
  "from",
  "have",
  "however",
  "instead",
  "into",
  "itself",
  "just",
  "less",
  "like",
  "many",
  "more",
  "most",
  "much",
  "must",
  "never",
  "often",
  "only",
  "other",
  "over",
  "rather",
  "same",
  "should",
  "since",
  "some",
  "such",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "within",
  "without",
  "would",
]);

/**
 * The subject-bearing words of a string, singular.
 *
 * A plural is folded because the question and the span it cites are written by
 * two different calls and rarely agree on number: a source that says "two high
 * tides a day" is cited for a question about "tidal range", and counting "tides"
 * and "tide" as different words is how a real citation gets called unrelated.
 */
function contentWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const word of wordsOf(text)) {
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    // A possessive first, so "moon's" is the same subject as "moon", then a plural
    // "s", but not on a double: "pass" and "less" end in one too. The folding only
    // has to be consistent, not correct: "lens" becoming "len" costs nothing as
    // long as every "lens" becomes it.
    const bare = word.replace(/'s$/, "");
    const singular =
      bare.endsWith("s") && !bare.endsWith("ss") && bare.length > 3
        ? bare.slice(0, -1)
        : bare;
    words.add(singular);
  }
  return words;
}

/** How many subject-bearing words two strings have in common. */
export function sharedContentWords(a: string, b: string): number {
  const first = contentWords(a);
  let shared = 0;
  for (const word of contentWords(b)) if (first.has(word)) shared += 1;
  return shared;
}

export interface GroundingVerdict {
  /** Why the item is not safe to ship, or null when nothing is wrong with it. */
  failure: string | null;
  /** The verified span, for the item's sourceNote. Null when there isn't one. */
  quote: string | null;
  /**
   * Why the reply produced no citation, when that says nothing about the item.
   * Set for a span too short to show or too long to be a span at all: the item
   * keeps its place and simply ships without a quote.
   */
  unusable: string | null;
}

/** Everything the item asserts to be true: the stem plus the marked answer. */
export function assertedText(item: Item): string {
  const answer = item.options.find((o) => o.correct)?.text ?? "";
  return `${item.stem} ${answer}`;
}

/**
 * Marks a question as a hypothetical, whose numbers are its own terms.
 *
 * "If a car travels 60 km/h for two hours" invents both figures legitimately:
 * the source is being applied, not misquoted. Skipping the number check on these
 * is the same judgement that keeps years and per cent out of PHYSICAL_UNITS, and
 * it gives up little: the quote check still has to find a span that settles the
 * question, so a hypothetical resting on nothing is caught one line later.
 */
const HYPOTHETICAL =
  /\b(if|suppose|supposing|imagine|assume|assuming|estimate|hypothetical|were to)\b/;

export function isHypothetical(text: string): boolean {
  return HYPOTHETICAL.test(normaliseForMatch(text));
}

/**
 * The free half of the gate: a unit-bearing figure the material never states.
 *
 * Worth running on its own, before any call, because it needs nothing from the
 * model and it is what catches the item this file exists for.
 */
export function numberFailure(item: Item, material: string): string | null {
  const asserted = assertedText(item);
  if (isHypothetical(asserted)) return null;
  const invented = unsupportedNumbers(asserted, material);
  if (invented.length === 0) return null;
  return `asserts ${invented.join(" and ")}, which the source never states`;
}

/**
 * The whole gate: is this item's marked answer actually in the material?
 *
 * Three outcomes, not two, and the line between them is what the fault is
 * evidence *of*. A fault in the content of the reply is evidence about the
 * question, and drops it:
 *
 *   - an invented figure, which needs no reply at all;
 *   - the model saying outright that nothing in the source settles it;
 *   - a span that is not in the material, which is the fabricated-quote case;
 *   - a span that is in the material but is about something else.
 *
 * A fault in the *form* of the reply is evidence about the model, and only costs
 * the item its citation: a two-word span or a paste of the whole document. The
 * first eval to run this gate rejected a tides question about the Sun's 45 per
 * cent, a figure the source states outright, because the reply pasted 78 words
 * instead of locating one sentence. Throwing out a grounded question for the
 * shape of a reply is the error this split exists to avoid.
 *
 * `grounding === null`, an unparseable reply, is the same case: a wasted call,
 * not a verdict. lib/challenge.ts draws the line in the same place, because a
 * check that discards work must not discard on its own malfunction.
 */
export function verifyGrounding(
  item: Item,
  material: string,
  grounding: Grounding | null,
): GroundingVerdict {
  const nothing = { failure: null, quote: null, unusable: null };

  const invented = numberFailure(item, material);
  if (invented) return { ...nothing, failure: invented };

  if (grounding === null) return nothing;

  if (grounding.quote === "") {
    return { ...nothing, failure: "no span of the source settles it" };
  }

  const length = wordsOf(grounding.quote).length;
  if (length < MIN_QUOTE_WORDS) {
    return { ...nothing, unusable: `span of ${length} words is too short to show` };
  }
  if (length > MAX_QUOTE_WORDS) {
    return {
      ...nothing,
      unusable: `span of ${length} words is a paste, not a located sentence`,
    };
  }

  const coverage = spanCoverage(grounding.quote, material);
  if (coverage < MIN_SPAN_COVERAGE) {
    return {
      ...nothing,
      failure: `quoted span is not in the source (${Math.round(coverage * 100)}% of its words matched)`,
    };
  }

  const shared = sharedContentWords(grounding.quote, assertedText(item));
  if (shared < MIN_SHARED_CONTENT_WORDS) {
    return {
      ...nothing,
      failure: `quoted span is about something else (${shared} words in common with the question)`,
    };
  }

  return { ...nothing, quote: grounding.quote };
}

/**
 * The verified span as the line printed under a plain correction.
 *
 * Attributed rather than bare, because the point of showing it is that the
 * learner recognises it: this is not the app asserting something, it is their own
 * material saying it.
 */
export function sourceNoteFrom(quote: string): string {
  const trimmed = quote.replace(/[\s,;:]+$/, "");
  return `From your material: “${trimmed}”`;
}






