import type { Refutation } from "./types";

export const MAX_BODY_BYTES = 4 * 1024;

export interface RefuteRequest {
  itemId: string;
  chosenOptionId: string;
  stem: string;
  chosenOptionText: string;
  misconception: string;
  correctOptionText: string;
  fallbackRefutation: Refutation;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.length > max) return null;
  return t;
}

export function parseRefutation(value: unknown): Refutation | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const believe = str(v.believe, 400);
  const wrong = str(v.wrong, 400);
  const actual = str(v.actual, 600);
  if (!believe || !wrong || !actual) return null;
  return { believe, wrong, actual };
}

export function parseRefuteRequest(value: unknown): RefuteRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const itemId = str(v.itemId, 80);
  const chosenOptionId = str(v.chosenOptionId, 80);
  const stem = str(v.stem, 600);
  const chosenOptionText = str(v.chosenOptionText, 400);
  const misconception = str(v.misconception, 400);
  const correctOptionText = str(v.correctOptionText, 400);
  const fallbackRefutation = parseRefutation(v.fallbackRefutation);
  if (
    !itemId ||
    !chosenOptionId ||
    !stem ||
    !chosenOptionText ||
    !misconception ||
    !correctOptionText ||
    !fallbackRefutation
  ) {
    return null;
  }
  return {
    itemId,
    chosenOptionId,
    stem,
    chosenOptionText,
    misconception,
    correctOptionText,
    fallbackRefutation,
  };
}

export const REFUTE_SYSTEM_PROMPT = `You write short refutation texts for a learner who answered a question wrongly while feeling certain. You get the question, the specific wrong option they chose, and the misconception it represents. Return JSON with exactly three fields.
believe: state the belief they hold, in second person, in one sentence, charitably - no mockery.
wrong: the single clearest reason it is false. Prefer one concrete, checkable fact over a general argument.
actual: the correct model in two sentences, phrased so it explains the same observation their wrong belief was trying to explain.
Never exceed two sentences per field. Never add caveats or encouragement. Never mention that you are an AI.`;

export function refuteUserPrompt(req: RefuteRequest): string {
  return [
    `Question: ${req.stem}`,
    `The option they chose: ${req.chosenOptionText}`,
    `The misconception this represents: ${req.misconception}`,
    `The correct option: ${req.correctOptionText}`,
  ].join("\n");
}
