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

/** Strips markdown the model sprinkles in, collapses whitespace, caps length. */
export function clean(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length === 0 || text.length > maxLength) return null;
  return text;
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

/** Validates one model-produced item. Returns null rather than throwing. */
export function parseGeneratedItem(value: unknown): GeneratedItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const stem = clean(raw.stem, 300);
  const correct = clean(raw.correct, 240);
  const topic = clean(raw.topic, 60);
  if (!stem || !correct || !topic) return null;

  const conceptId = slugify(
    clean(raw.conceptId, 80) ?? topic,
    slugify(topic, "topic"),
  );

  if (!Array.isArray(raw.distractors)) return null;
  const distractors: GeneratedItem["distractors"] = [];
  const seen = new Set([correct.toLowerCase()]);
  for (const entry of raw.distractors) {
    if (typeof entry !== "object" || entry === null) continue;
    const d = entry as Record<string, unknown>;
    const text = clean(d.text, 240);
    const misconception = clean(d.misconception, 240);
    if (!text || !misconception) continue;
    if (misconception.length < 12) continue;
    // A distractor that repeats the correct answer would make the item unanswerable.
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    distractors.push({ text, misconception });
  }
  if (distractors.length < 2) return null;

  const fallback = parseGeneratedRefutation(raw.fallbackRefutation);
  if (!fallback) return null;

  return {
    conceptId,
    topic,
    stem,
    correct,
    distractors: distractors.slice(0, 3),
    fallbackRefutation: fallback,
  };
}

function parseGeneratedRefutation(value: unknown): Refutation | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const believe = clean(raw.believe, 400);
  const wrong = clean(raw.wrong, 400);
  const actual = clean(raw.actual, 600);
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
- Every claim must come from the supplied material. Invent nothing.
- Plain text only. No markdown, no asterisks, no bold.
- Never write "all of the above", "none of the above", or "both A and B".
- The fallbackRefutation must address the first distractor's misconception.
- The stem must be answerable without seeing the options.`;

export function generateUserPrompt(
  material: string,
  position: number,
  total: number,
  usedConcepts: string[],
): string {
  const used =
    usedConcepts.length > 0 ? usedConcepts.join("; ") : "none yet";
  return `MATERIAL:
${material}

Write question ${position} of ${total}. Cover an idea distinct from these already-used topics: ${used}.`;
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
