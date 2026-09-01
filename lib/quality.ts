/**
 * A rubric for one question, applied without asking a model anything.
 *
 * A generated item can be well-formed JSON and still be a bad question: the stem
 * gives the answer away, the distractors are not the sort of thing anyone would
 * pick, the correct option is conspicuously the longest. None of that shows up in
 * a schema check, and a small model produces all three.
 *
 * These are the classic item-writing faults from test construction, written as
 * predicates so the generator can be measured rather than trusted. `npm run eval`
 * reports the pass rate over real generated packs; the built-in packs are held to
 * the same rubric in the test suite.
 */

import { contentWords } from "./custom-pack";
import type { Item, Option } from "./types";

export interface QualityFailure {
  check: string;
  detail: string;
}

export interface QualityReport {
  itemId: string;
  ok: boolean;
  failures: QualityFailure[];
}

/** Phrases that make a stem unanswerable on its own. */
const OPTION_REFERRING = [
  "which of the following",
  "which of these",
  "of the following",
  "from the list below",
  "choose from",
  "select all",
];

/** Options that test reading of the option list rather than the material. */
const META_OPTIONS = [
  "all of the above",
  "none of the above",
  "both a and b",
  "both of the above",
  "a and b",
  "all of these",
  "none of these",
];

/**
 * How much longer the correct answer may be than the mean distractor.
 *
 * Length as a tell is the best-documented giveaway in multiple-choice writing: a
 * model that hedges the true answer into a careful clause and leaves the wrong
 * ones blunt has written a question answerable without knowing anything. 1.6 is
 * loose enough that a genuinely longer fact passes.
 */
const MAX_CORRECT_LENGTH_RATIO = 1.6;

/** Above this word overlap, the stem has told the learner the answer. */
const LEAK_OVERLAP = 0.65;

function normalised(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Lowercase words only, punctuation gone.
 *
 * The containment test has to survive punctuation drift: an answer written "In
 * the thylakoid membrane." appears in a stem as "...the thylakoid membrane, where"
 * and a raw substring check misses it over one comma.
 */
function bare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Jaccard overlap of content words. 1 is identical, 0 shares nothing. */
export function overlap(a: string, b: string): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Below this, a clause is too generic for its presence in the stem to mean much. */
const LEAK_CLAUSE_CHARS = 20;

/**
 * True when the stem hands over the correct answer.
 *
 * Three ways it happens: the answer appears whole inside the question, one of its
 * clauses does, or the question is the answer reworded. The clause case is the one
 * a small model actually falls into: it sets the scene with the very fact being
 * asked about ("Given light is absorbed in the thylakoid membrane, where...") and
 * a whole-string check waves it through. Overlap catches the rewording.
 */
export function leaksAnswer(stem: string, correct: string): boolean {
  const s = bare(stem);
  const c = bare(correct);
  if (c.length >= 12 && s.includes(c)) return true;
  for (const clause of correct.split(/[,;:—]|\s-\s/)) {
    const piece = bare(clause);
    if (piece.length >= LEAK_CLAUSE_CHARS && s.includes(piece)) return true;
  }
  return overlap(stem, correct) >= LEAK_OVERLAP;
}

function distractorsOf(item: Item): Option[] {
  return item.options.filter((o) => !o.correct);
}

/**
 * Applies every check to one item and names what failed.
 *
 * Ordered so a structurally broken item reports that rather than a cascade of
 * consequences: the later checks assume one correct option exists.
 */
export function checkItem(item: Item): QualityReport {
  const failures: QualityFailure[] = [];
  const fail = (check: string, detail: string) => failures.push({ check, detail });

  const correct = item.options.filter((o) => o.correct);
  if (correct.length !== 1) {
    fail("one-correct", `${correct.length} options marked correct`);
    return { itemId: item.id, ok: false, failures };
  }
  const answer = correct[0]!;
  const wrong = distractorsOf(item);

  if (item.options.length < 3) {
    fail("enough-options", `only ${item.options.length} options`);
  }
  if (wrong.length < 2) {
    fail("enough-distractors", `only ${wrong.length} distractors`);
  }

  for (const option of wrong) {
    const misconception = option.misconception?.trim() ?? "";
    if (misconception.length < 12) {
      fail("misconception-named", `option ${option.id} names no misconception`);
      continue;
    }
    // The misconception is meant to be the belief behind the option, stated as a
    // claim. Echoing the option text back adds nothing for the refutation to work
    // from, and the repair round is built on it.
    if (normalised(misconception) === normalised(option.text)) {
      fail(
        "misconception-distinct",
        `option ${option.id} repeats its own text as the misconception`,
      );
    }
  }

  const seen = new Map<string, string>();
  for (const option of item.options) {
    const text = normalised(option.text);
    const previous = seen.get(text);
    if (previous) {
      fail("distinct-options", `options ${previous} and ${option.id} are the same`);
    }
    seen.set(text, option.id);
    if (META_OPTIONS.some((meta) => text === meta || text.startsWith(`${meta} `))) {
      fail("no-meta-option", `option ${option.id} is "${option.text}"`);
    }
  }

  const stem = normalised(item.stem);
  if (OPTION_REFERRING.some((phrase) => stem.includes(phrase))) {
    fail("self-contained-stem", "the stem points at the option list");
  }
  if (leaksAnswer(item.stem, answer.text)) {
    fail("no-answer-leak", "the stem gives the answer away");
  }

  if (wrong.length > 0) {
    const mean =
      wrong.reduce((sum, o) => sum + o.text.length, 0) / wrong.length;
    if (mean > 0 && answer.text.length > mean * MAX_CORRECT_LENGTH_RATIO) {
      fail(
        "answer-length-tell",
        `correct option is ${(answer.text.length / mean).toFixed(1)}x the mean distractor`,
      );
    }
  }

  const { believe, wrong: contradiction, actual } = item.fallbackRefutation;
  if (!believe.trim() || !contradiction.trim() || !actual.trim()) {
    fail("refutation-shape", "the fallback refutation is missing a part");
  } else if (normalised(contradiction) === normalised(actual)) {
    fail("refutation-shape", "the fallback refutation repeats itself");
  }

  return { itemId: item.id, ok: failures.length === 0, failures };
}

export interface PackQuality {
  reports: QualityReport[];
  passed: number;
  total: number;
  /** Fraction of items with no failures. 1 when the pack is empty. */
  passRate: number;
  /** How many items each check rejected, most frequent first. */
  failuresByCheck: { check: string; count: number }[];
}

/**
 * Scores a whole pack and says which checks are doing the rejecting.
 *
 * The breakdown is the useful half: a pass rate says the generator is imperfect,
 * the histogram says which prompt line to change.
 */
export function checkPack(items: Item[]): PackQuality {
  const reports = items.map(checkItem);
  const passed = reports.filter((r) => r.ok).length;

  const counts = new Map<string, number>();
  for (const report of reports) {
    // An item that trips the same check twice still counts once, so the histogram
    // reads as "items rejected by this rule".
    for (const check of new Set(report.failures.map((f) => f.check))) {
      counts.set(check, (counts.get(check) ?? 0) + 1);
    }
  }

  return {
    reports,
    passed,
    total: reports.length,
    passRate: reports.length === 0 ? 1 : passed / reports.length,
    failuresByCheck: [...counts.entries()]
      .map(([check, count]) => ({ check, count }))
      .sort((a, b) => b.count - a.count || a.check.localeCompare(b.check)),
  };
}

/** Every check name, so the eval report can show the ones that never fired. */
export const CHECKS = [
  "one-correct",
  "enough-options",
  "enough-distractors",
  "misconception-named",
  "misconception-distinct",
  "distinct-options",
  "no-meta-option",
  "self-contained-stem",
  "no-answer-leak",
  "answer-length-tell",
  "refutation-shape",
] as const;
