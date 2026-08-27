/**
 * The question-generation loop, extracted from the route so it can be measured.
 *
 * One paid completion per question, sequential so each prompt can steer the next
 * away from ground already covered. Two gates stand between the model and the
 * pack: `validateGeneratedItem` for shape, and the rubric in lib/quality.ts for
 * whether the question is answerable at all. Rejections are returned rather than
 * only logged, which is what `npm run eval` reports on.
 *
 * One rejection gets a second chance rather than a discard: a reply whose only
 * fault is missing misconceptions is a good question with its diagnostic half
 * absent, and asking for that half alone costs a fraction of asking again.
 */

import {
  GENERATE_SYSTEM_PROMPT,
  REPAIR_SYSTEM_PROMPT,
  applyMisconceptions,
  assembleItem,
  generateUserPrompt,
  isNearDuplicateStem,
  parseMisconceptionList,
  repairTarget,
  repairUserPrompt,
  validateGeneratedItem,
} from "./custom-pack";
import { chatJson } from "./mistral";
import { checkItem } from "./quality";
import type { Item } from "./types";

/**
 * Enough headroom that a wordy item finishes its JSON. A truncated reply is not
 * parseable at all, so a cap that is too tight wastes the whole paid call.
 */
export const MAX_TOKENS_PER_ITEM = 900;

/** A repair reply is a short list of sentences, so it needs far less room. */
export const MAX_TOKENS_PER_REPAIR = 400;

/**
 * A pack ships if at least this many questions survive, even when the learner
 * asked for more. A 3B model drops the odd malformed item, and three good
 * questions beat a 502.
 */
export const MIN_ITEMS_KEPT = 3;

/** Spare attempts, to cover the items that come back unusable. */
const SPARE_ATTEMPTS = 3;

export type RejectionStage = "shape" | "rubric" | "duplicate" | "error";

export interface Rejection {
  attempt: number;
  stage: RejectionStage;
  reason: string;
}

export interface GenerationOutcome {
  items: Item[];
  attempts: number;
  rejections: Rejection[];
  /** Items kept despite failing the rubric, because the pack was near the floor. */
  keptDespiteRubric: number;
  /** Extra calls spent asking for missing misconceptions. */
  repairCalls: number;
  /** Items that only exist because a repair call succeeded. */
  repaired: number;
}

export interface GenerateOptions {
  material: string;
  count: number;
  packId: string;
  /** One point per question to build around. Voice mode supplies these. */
  focus?: string[];
  onWarn?: (message: string) => void;
}

/**
 * Asks only for the misconceptions a reply left out, and returns the reply with
 * them filled in. Returns null if the reply is not worth a second call or the
 * second call does not come back usable — the caller then rejects as before.
 */
async function repairMisconceptions(raw: unknown): Promise<unknown | null> {
  const target = repairTarget(raw);
  if (!target) return null;

  const reply = await chatJson(
    [
      { role: "system", content: REPAIR_SYSTEM_PROMPT },
      { role: "user", content: repairUserPrompt(target) },
    ],
    { maxTokens: MAX_TOKENS_PER_REPAIR, timeoutMs: 15_000, temperature: 0.3 },
  );

  const filled = parseMisconceptionList(reply, target.texts.length);
  if (!filled) return null;

  const byText = new Map<string, string>();
  target.texts.forEach((text, i) => byText.set(text.toLowerCase(), filled[i]!));
  return applyMisconceptions(raw, byText);
}

export async function generateItems({
  material,
  count,
  packId,
  focus = [],
  onWarn,
}: GenerateOptions): Promise<GenerationOutcome> {
  const items: Item[] = [];
  const usedConcepts: string[] = [];
  const usedKeys = new Set<string>();
  const usedStems: string[] = [];
  const rejections: Rejection[] = [];
  let keptDespiteRubric = 0;
  let repairCalls = 0;
  let repaired = 0;

  const maxAttempts = count + SPARE_ATTEMPTS;
  let attempts = 0;

  const reject = (attempt: number, stage: RejectionStage, reason: string) => {
    rejections.push({ attempt, stage, reason });
    onWarn?.(`attempt ${attempt} rejected at ${stage} — ${reason}`);
  };

  for (let attempt = 1; attempt <= maxAttempts && items.length < count; attempt += 1) {
    attempts = attempt;
    // Once dropping an item would leave the pack below the floor, a flawed
    // question beats no pack: narrow material genuinely cannot always yield more.
    const attemptsLeft = maxAttempts - attempt;
    const canAffordToSkip = items.length + attemptsLeft >= MIN_ITEMS_KEPT;

    try {
      const raw = await chatJson(
        [
          { role: "system", content: GENERATE_SYSTEM_PROMPT },
          {
            role: "user",
            content: generateUserPrompt(
              material,
              items.length + 1,
              count,
              usedConcepts,
              focus[items.length],
            ),
          },
        ],
        { maxTokens: MAX_TOKENS_PER_ITEM, timeoutMs: 20_000, temperature: 0.4 },
      );

      let validated = validateGeneratedItem(raw);
      let wasRepaired = false;
      // The only fault worth a second call: the question is sound and just came
      // back without the beliefs behind its wrong answers.
      if (!validated.ok && validated.reason.includes("unusable misconception")) {
        const original = validated.reason;
        repairCalls += 1;
        // A failed repair leaves the original shape reason as the honest one, so the
        // network error is swallowed rather than reported as the item's fault.
        const patched = await repairMisconceptions(raw).catch(() => null);
        if (patched) {
          const retried = validateGeneratedItem(patched);
          if (retried.ok) {
            validated = retried;
            wasRepaired = true;
          }
        }
        if (!wasRepaired) {
          reject(attempt, "shape", `${original}, repair failed`);
          continue;
        }
      }
      if (!validated.ok) {
        reject(attempt, "shape", validated.reason);
        continue;
      }
      const generated = validated.item;

      const repeated =
        usedKeys.has(generated.topic.toLowerCase()) ||
        isNearDuplicateStem(generated.stem, usedStems);
      if (repeated && canAffordToSkip) {
        reject(attempt, "duplicate", `asks again about ${generated.topic}`);
        continue;
      }

      const assembled = assembleItem(generated, packId, items.length);
      const graded = checkItem(assembled);
      if (!graded.ok) {
        reject(attempt, "rubric", graded.failures.map((f) => f.check).join(", "));
        if (canAffordToSkip) continue;
        keptDespiteRubric += 1;
      }

      items.push(assembled);
      if (wasRepaired) repaired += 1;
      usedConcepts.push(`${generated.topic} (asked: ${generated.stem})`);
      usedKeys.add(generated.topic.toLowerCase());
      usedStems.push(generated.stem);
    } catch (error) {
      // A single failed question does not sink the pack. The reason is kept for the
      // server log and the eval report; the client never sees model detail.
      reject(
        attempt,
        "error",
        error instanceof Error ? error.message : String(error),
      );
      continue;
    }
  }

  return { items, attempts, rejections, keptDespiteRubric, repairCalls, repaired };
}
