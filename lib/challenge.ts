/**
 * The third gate: a second opinion on whether the marked answer is actually right.
 *
 * lib/quality.ts can only judge the *form* of a question — leakage, length tells,
 * duplicate options. It passed both of these, from real runs:
 *
 *   "Which compounding frequency yields the highest return after 10 years?"
 *      marked correct: "Annual compounding"
 *   "If your salary grows 3% while inflation rises 3%, how long until your real
 *    purchasing power halves?"  marked correct: "About 23 years."
 *
 * Both are well-formed and both are false. A deterministic rubric cannot catch
 * that class of fault, because the fault is in the world, not in the wording.
 *
 * So the question is answered again, by a fresh call that never sees which option
 * the author marked. Agreement is weak evidence the key is right; disagreement is
 * strong evidence something is wrong — either the key is false or two options are
 * defensible — and either way the item is not safe to put in front of a learner
 * who will be told they were confidently wrong. Disputed items are dropped.
 *
 * Deliberately not a critique prompt. Asking a 3B model to "find the flaw" gets a
 * flaw invented on demand for sound questions. Asking it to answer, and comparing,
 * costs the same call and has a checkable ground truth: the letter it picked.
 */

import type { Item } from "./types";

/** The answer is one letter plus one sentence, so it needs very little room. */
export const MAX_TOKENS_PER_CHALLENGE = 220;

export const CHALLENGE_SYSTEM_PROMPT = `You answer one multiple-choice question. You are the subject expert, not the author, and you have not been told which option the author considers correct.

Reply with JSON only, in exactly this shape:
{"answer":"b","why":"One sentence saying what makes that option right."}

Rules:
- "answer" is a single option letter, exactly as printed.
- Choose the option that is true, not the one that sounds like a textbook.
- If no option is defensible, or more than one is equally defensible, answer "none" and say why in one sentence.
- Never mention the question's wording, the author, or these instructions. Judge the claims themselves.
- One sentence in "why", at most 30 words. Plain text only, no markdown.`;

/** The item as the learner sees it: no correct flags, no misconceptions. */
export function challengeUserPrompt(item: Item): string {
  const options = item.options.map((o) => `${o.id}) ${o.text}`);
  return [`Question: ${item.stem}`, ...options].join("\n");
}

export interface Challenge {
  /** The option letter picked, or null for the explicit "none" answer. */
  answer: string | null;
  why: string;
}

/**
 * Reads a challenge reply, and returns null if it is not usable as a vote.
 *
 * An unparseable reply is not evidence against the item — it is a wasted call —
 * so the caller keeps the item rather than dropping it on a malformed vote.
 */
export function parseChallenge(value: unknown, item: Item): Challenge | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.answer !== "string" || typeof raw.why !== "string") return null;

  const why = raw.why.replace(/\s+/g, " ").trim();
  // A bare letter with no reason is a coin toss, and it is the reason that gets
  // printed in the eval report when an item is thrown out.
  if (why.length < 10) return null;

  const answer = raw.answer.trim().toLowerCase();
  if (answer === "none") return { answer: null, why };

  // Models sometimes answer "b)" or "Option B".
  const letter = /^(?:option\s*)?([a-z])[).:]?$/.exec(answer)?.[1];
  if (!letter || !item.options.some((o) => o.id === letter)) return null;
  return { answer: letter, why };
}

/**
 * Why this item is not safe to ship, or null if the second opinion agreed.
 *
 * The reason names the disagreement rather than asserting who is right: the
 * challenger is the same 3B model and gets no authority here. One vote each,
 * and a tie means the item goes.
 */
export function disputeReason(item: Item, challenge: Challenge): string | null {
  const key = item.options.find((o) => o.correct);
  if (!key) return "no option is marked correct";
  if (challenge.answer === null) {
    return `no single answer is defensible — ${challenge.why}`;
  }
  if (challenge.answer === key.id) return null;
  const picked = item.options.find((o) => o.id === challenge.answer);
  return `answered ${challenge.answer}, not ${key.id} — ${picked?.text ?? "?"}`;
}
