/**
 * Custom pack generation: prompts, validation, and assembly.
 *
 * The model is asked for a flat shape — one correct answer plus three wrong ones
 * with named misconceptions — and this file assembles the Item. Structural rules
 * (exactly one correct option, misconceptions only on wrong options) are therefore
 * guaranteed by construction rather than by trusting the model to comply.
 */

import type { Item, Option, Refutation } from "./types";

/** Material is truncated before it reaches the model; token spend is bounded. */
export const MAX_MATERIAL_CHARS = 12_000;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MIN_MATERIAL_CHARS = 200;
export const MIN_ITEMS = 4;
export const MAX_ITEMS = 8;

/** Strips the markdown the model sprinkles in and collapses whitespace. */
function normalise(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

/** Strips markdown the model sprinkles in, collapses whitespace, caps length. */
export function clean(value: unknown, maxLength: number): string | null {
  const text = normalise(value);
  if (!text || text.length > maxLength) return null;
  return text;
}

/**
 * Like clean, but an overlong value is cut back to its last whole sentence
 * rather than thrown away.
 *
 * A small model asked to build a question around a long fact writes long prose,
 * and rejecting the item for being twenty characters over wasted a paid call on
 * an otherwise good question. Only sentence boundaries are cut on — a mid-clause
 * truncation could turn a true answer into a false one. Nothing salvageable
 * inside the budget still returns null.
 */
export function condense(value: unknown, maxLength: number): string | null {
  /** Below this, what survived the cut is a stub rather than an answer. */
  const MIN_KEPT = 30;
  const text = normalise(value);
  if (!text) return null;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  let end = -1;
  for (const match of cut.matchAll(/[.!?](?=\s|$)/g)) end = match.index;
  if (end + 1 < MIN_KEPT) return null;
  return cut.slice(0, end + 1);
}

/**
 * Trims a display label on a word boundary.
 *
 * A topic is a heading, not a claim, so cutting it short cannot make it false —
 * unlike an answer, where only whole sentences are safe to keep.
 */
export function clipLabel(value: unknown, maxLength: number): string | null {
  const text = normalise(value);
  if (!text) return null;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = (lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut)
    .replace(/[\s,;:.]+$/, "");
  return trimmed.length > 0 ? trimmed : null;
}

export function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : fallback;
}

export interface GeneratedItem {
  conceptId: string;
  topic: string;
  stem: string;
  correct: string;
  distractors: { text: string; misconception: string }[];
  fallbackRefutation: Refutation;
}

/** Why an item was thrown away, for the server-side log. */
export type ItemRejection =
  | { ok: true; item: GeneratedItem }
  | { ok: false; reason: string };

/**
 * Validates one model-produced item and says why when it fails.
 *
 * The reason is logged server-side so a change in how a small model drifts is
 * visible without guessing; the client never sees it.
 */
export function validateGeneratedItem(value: unknown): ItemRejection {
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "not an object" };
  }
  const raw = value as Record<string, unknown>;

  const stem = condense(raw.stem, 300);
  const correct = condense(raw.correct, 240);
  const topic = clipLabel(raw.topic, 72);
  if (!stem) return { ok: false, reason: "unusable stem" };
  if (!correct) return { ok: false, reason: "unusable correct answer" };
  if (!topic) return { ok: false, reason: "unusable topic" };

  const conceptId = slugify(
    clean(raw.conceptId, 80) ?? topic,
    slugify(topic, "topic"),
  );

  if (!Array.isArray(raw.distractors)) {
    return { ok: false, reason: "distractors missing" };
  }
  const distractors: GeneratedItem["distractors"] = [];
  const seen = new Set([correct.toLowerCase()]);
  for (const entry of raw.distractors) {
    if (typeof entry !== "object" || entry === null) continue;
    const d = entry as Record<string, unknown>;
    const text = condense(d.text, 240);
    const misconception = condense(d.misconception, 240);
    if (!text || !misconception) continue;
    if (misconception.length < 12) continue;
    // A distractor that repeats the correct answer would make the item unanswerable.
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    distractors.push({ text, misconception });
  }
  if (distractors.length < 2) {
    return {
      ok: false,
      reason: `only ${distractors.length} usable distractor${distractors.length === 1 ? "" : "s"}`,
    };
  }

  return {
    ok: true,
    item: {
      conceptId,
      topic,
      stem,
      correct,
      distractors: distractors.slice(0, 3),
      // A missing or malformed refutation is built from the first distractor
      // instead of costing the whole item. This text is the standby anyway: the
      // repair round calls the model live and only falls back when that fails.
      fallbackRefutation:
        parseGeneratedRefutation(raw.fallbackRefutation) ??
        derivedRefutation(distractors[0]!, correct),
    },
  };
}

/** Validates one model-produced item. Returns null rather than throwing. */
export function parseGeneratedItem(value: unknown): GeneratedItem | null {
  const result = validateGeneratedItem(value);
  return result.ok ? result.item : null;
}

function derivedRefutation(
  distractor: GeneratedItem["distractors"][number],
  correct: string,
): Refutation {
  return {
    believe: `You believe: ${distractor.misconception}`,
    wrong: "That is not what the material says.",
    actual: correct,
  };
}

function parseGeneratedRefutation(value: unknown): Refutation | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const believe = condense(raw.believe, 400);
  const wrong = condense(raw.wrong, 400);
  const actual = condense(raw.actual, 600);
  if (!believe || !wrong || !actual) return null;
  return { believe, wrong, actual };
}

const LETTERS = ["a", "b", "c", "d"] as const;

/**
 * Builds the Item. The correct answer is placed at a position derived from the
 * item index so it is not always first, without needing a random seed.
 */
export function assembleItem(
  generated: GeneratedItem,
  packId: string,
  index: number,
): Item {
  const wrong: Option[] = generated.distractors.map((d, i) => ({
    id: LETTERS[i]!,
    text: d.text,
    correct: false,
    misconception: d.misconception,
  }));

  const correctAt = index % (wrong.length + 1);
  const texts = [...wrong];
  texts.splice(correctAt, 0, {
    id: "x",
    text: generated.correct,
    correct: true,
  });

  const options: Option[] = texts.map((option, i) => ({
    ...option,
    id: LETTERS[i]!,
  }));

  return {
    id: `${packId}-${index + 1}`,
    conceptId: generated.conceptId,
    topic: generated.topic,
    stem: generated.stem,
    options,
    fallbackRefutation: generated.fallbackRefutation,
  };
}

export const GENERATE_SYSTEM_PROMPT = `You write one multiple-choice question at a time to expose misconceptions in a learner who has not studied the material yet.

Reply with JSON only, in exactly this shape:
{"conceptId":"kebab-case-slug","topic":"Short human label","stem":"One question","correct":"The correct answer","distractors":[{"text":"A wrong answer a learner would actually pick","misconception":"The false belief behind it, written as a statement"},{"text":"...","misconception":"..."},{"text":"...","misconception":"..."}],"fallbackRefutation":{"believe":"You believe ...","wrong":"One concrete fact that contradicts it.","actual":"What is actually happening, in two short sentences."}}

Rules:
- Exactly three distractors. Each must be clearly wrong but tempting.
- Be brief. The question is at most 25 words. Every answer is one short sentence of at most 20 words. Never explain your reasoning inside an answer.
- Every claim must come from the supplied material. Invent nothing.
- Plain text only. No markdown, no asterisks, no bold.
- Reply with the JSON on one line, with no line breaks inside it.
- Never write "all of the above", "none of the above", or "both A and B".
- The fallbackRefutation must address the first distractor's misconception.
- Never reword a question that has already been asked. Ask about a different fact.
- The stem must be answerable without seeing the options.`;

export function generateUserPrompt(
  material: string,
  position: number,
  total: number,
  usedConcepts: string[],
  focus?: string,
): string {
  const used =
    usedConcepts.length > 0 ? usedConcepts.join("; ") : "none yet";
  // A caller that already knows which points matter — voice mode, working from a
  // marked explanation — names one per question, which keeps a small model from
  // circling the same idea when the material is narrow.
  const aim = focus
    ? `\nBase this question on this specific point: ${focus}\nAsk about it in your own short words. Do not quote that sentence back.`
    : "";
  return `MATERIAL:
${material}

Write question ${position} of ${total}. Cover an idea distinct from these already-used topics: ${used}.${aim}`;
}

/** Validates a caller-supplied list of points to build questions around. */
export function parseFocusList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const text = clean(entry, 300);
    if (!text || text.length < 8) continue;
    out.push(text);
    if (out.length === MAX_ITEMS) break;
  }
  return out;
}

/** Word set for overlap comparison, minus the words every question shares. */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "because", "but", "by", "does",
  "do", "for", "from", "how", "in", "is", "it", "its", "not", "of", "on", "or",
  "that", "the", "their", "them", "this", "to", "what", "when", "which", "why",
  "with", "you", "your",
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

/**
 * True when a stem asks what an earlier stem already asked.
 *
 * Narrow material makes a small model circle the same question in different
 * words, which wastes a slot and teaches nothing new. Jaccard overlap of content
 * words catches the rewordings without touching genuinely distinct questions.
 */
export function isNearDuplicateStem(stem: string, existing: string[]): boolean {
  const words = contentWords(stem);
  if (words.size === 0) return existing.length > 0;
  for (const other of existing) {
    const otherWords = contentWords(other);
    if (otherWords.size === 0) continue;
    let shared = 0;
    for (const word of words) if (otherWords.has(word)) shared += 1;
    const union = words.size + otherWords.size - shared;
    if (union > 0 && shared / union >= 0.6) return true;
  }
  return false;
}

/** Trims material to the model budget on a paragraph boundary where possible. */
export function trimMaterial(text: string): string {
  const collapsed = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (collapsed.length <= MAX_MATERIAL_CHARS) return collapsed;
  const cut = collapsed.slice(0, MAX_MATERIAL_CHARS);
  const lastBreak = cut.lastIndexOf("\n\n");
  return lastBreak > MAX_MATERIAL_CHARS / 2 ? cut.slice(0, lastBreak) : cut;
}

export function clampItemCount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 6;
  return Math.min(MAX_ITEMS, Math.max(MIN_ITEMS, Math.round(n)));
}
