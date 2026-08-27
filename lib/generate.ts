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
 *
 * A question that clears both gates is then answered again, blind to the key, by
 * lib/challenge.ts. That is the only check that can see a well-formed question
 * whose marked answer is simply false.
 *
 * Three gates and up to eleven attempts can outlast the 60s the route gets, so
 * the loop also watches the clock and returns a short pack rather than nothing.
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
import {
  CHALLENGE_SYSTEM_PROMPT,
  MAX_TOKENS_PER_CHALLENGE,
  challengeUserPrompt,
  disputeReason,
  parseChallenge,
} from "./challenge";
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

/**
 * Spare attempts, to cover the items that come back unusable.
 *
 * Raised from three when the dispute gate went in: it throws out about one in
 * three questions, and with the old budget a pack of six landed on the floor of
 * three. A dropped question should cost a call, not a question.
 */
const SPARE_ATTEMPTS = 5;

/**
 * How long the whole loop may spend before it stops starting new work.
 *
 * The route it runs in is capped at 60s on Vercel, and a killed function returns
 * nothing at all — a short pack beats a 504. Three gates and eleven possible
 * attempts can outlast that, so the loop watches the clock rather than assuming
 * it will finish.
 */
export const DEFAULT_TIME_BUDGET_MS = 50_000;

/** Room to start another question: the generate call itself may take 20s. */
const RESERVE_FOR_ATTEMPT_MS = 14_000;

/** Room for the cheaper second-opinion call, which is one letter of output. */
const RESERVE_FOR_CHALLENGE_MS = 7_000;

export type RejectionStage = "shape" | "rubric" | "duplicate" | "disputed" | "error";

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
  /** Extra calls spent answering the question a second time, blind to the key. */
  challengeCalls: number;
  /** Items thrown out because that second answer disagreed with the key. */
  disputed: number;
  /** True when the loop stopped on the clock rather than on the question count. */
  stoppedEarly: boolean;
}

export interface GenerateOptions {
  material: string;
  count: number;
  packId: string;
  /** One point per question to build around. Voice mode supplies these. */
  focus?: string[];
  /** Wall clock the loop may use, defaulting to what the route can afford. */
  timeBudgetMs?: number;
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

/**
 * Answers the assembled question again, blind to which option is marked correct,
 * and returns why the item should be dropped — or null to keep it.
 *
 * Temperature 0: this is a fact check, and a sampled second opinion would make
 * whether an item ships depend on the dice.
 */
async function challenge(item: Item): Promise<string | null> {
  const reply = await chatJson(
    [
      { role: "system", content: CHALLENGE_SYSTEM_PROMPT },
      { role: "user", content: challengeUserPrompt(item) },
    ],
    { maxTokens: MAX_TOKENS_PER_CHALLENGE, timeoutMs: 15_000, temperature: 0 },
  );
  const parsed = parseChallenge(reply, item);
  // An unusable reply is a wasted call, not evidence against the question.
  if (!parsed) return null;
  return disputeReason(item, parsed);
}

export async function generateItems({
  material,
  count,
  packId,
  focus = [],
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
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
  let challengeCalls = 0;
  let disputed = 0;
  let stoppedEarly = false;

  const startedAt = Date.now();
  const timeLeft = () => timeBudgetMs - (Date.now() - startedAt);

  const maxAttempts = count + SPARE_ATTEMPTS;
  let attempts = 0;

  const reject = (attempt: number, stage: RejectionStage, reason: string) => {
    rejections.push({ attempt, stage, reason });
    onWarn?.(`attempt ${attempt} rejected at ${stage} — ${reason}`);
  };

  for (let attempt = 1; attempt <= maxAttempts && items.length < count; attempt += 1) {
    // Stopping one question short is recoverable; being killed mid-call is not.
    if (timeLeft() < RESERVE_FOR_ATTEMPT_MS) {
      stoppedEarly = true;
      onWarn?.(
        `stopped after ${items.length} of ${count} questions — ${Math.round((Date.now() - startedAt) / 1000)}s of the time budget used`,
      );
      break;
    }
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

      // Worth paying for only when the answer could change the outcome: at the
      // floor the item ships either way, so the call would buy nothing.
      if (canAffordToSkip && timeLeft() > RESERVE_FOR_CHALLENGE_MS) {
        challengeCalls += 1;
        // A failed call leaves the item in. Silence is not a dispute.
        const dispute = await challenge(assembled).catch(() => null);
        if (dispute) {
          // The stem travels with the reason: a dispute is a claim about the
          // world, and it cannot be adjudicated without the question it is about.
          reject(attempt, "disputed", `${dispute} | asked: ${assembled.stem}`);
          disputed += 1;
          continue;
        }
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

  return {
    items,
    attempts,
    rejections,
    keptDespiteRubric,
    repairCalls,
    repaired,
    challengeCalls,
    disputed,
    stoppedEarly,
  };
}
