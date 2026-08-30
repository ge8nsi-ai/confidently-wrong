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
 * lib/challenge.ts, and made to cite itself: lib/grounding.ts requires a verbatim
 * span of the supplied material that settles it, and locates that span in the
 * material rather than trusting the model's word for it. The two catch different
 * things, so both run, in parallel because neither needs the other's answer. The
 * second opinion catches a marked answer that is false; the citation catches a
 * question whose premise the source never states, which a second opinion agrees
 * with precisely because the key reasons soundly from it.
 *
 * Repetition is caught in two layers: free word overlap first, then an embedding
 * of the stem compared against the stems already kept. The second layer exists
 * because a small model given narrow material rewords its own question, and a
 * reworded question shares almost no words with the original.
 *
 * Five gates and up to eleven attempts can outlast the 60s the route gets, so
 * the loop also watches the clock and returns a short pack rather than nothing.
 *
 * The one place the sequence is broken is the wait: the next question is asked
 * while the current one is being verified. Those two calls have nothing to say to
 * each other — verification judges a finished question, and the next prompt only
 * needs the ground already covered, which is known before either runs — so paying
 * for them one after the other bought nothing but latency.
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
import {
  GROUNDING_SYSTEM_PROMPT,
  MAX_TOKENS_PER_GROUNDING,
  groundingUserPrompt,
  numberFailure,
  parseGrounding,
  sourceNoteFrom,
  verifyGrounding,
  type GroundingVerdict,
} from "./grounding";
import { chatJson, embed } from "./mistral";
import { checkItem } from "./quality";
import { findNearDuplicate } from "./similarity";
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
 * Raised from three when the dispute gate went in, and from five when the
 * paraphrase gate followed: on narrow material a small model spends several
 * attempts circling ground it has already covered, and each repetition layer
 * turns a wasted question into a wasted call. Eight leaves every source in the
 * eval finishing above its floor with roughly half the 50s budget unspent, and
 * the clock guard below is what stops this number from mattering on the route.
 */
const SPARE_ATTEMPTS = 8;

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

/**
 * Room for the two verification calls, which run together.
 *
 * They are independent judgements of the same finished question — one answers it
 * again, the other makes it cite the material — so neither waits for the other.
 * Sequentially they cost an attempt's worth of clock: the first eval with the
 * citation gate in had two of three sources stopping on the time budget rather
 * than on the question count, which is a worse pack than either check prevents.
 */
const RESERVE_FOR_VERIFY_MS = 9_000;

/** Room for one embedding of one stem — the cheapest of the three calls. */
const RESERVE_FOR_EMBED_MS = 3_000;

export type RejectionStage =
  | "shape"
  | "rubric"
  | "duplicate"
  | "paraphrase"
  | "disputed"
  | "ungrounded"
  | "error";

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
  /** Extra calls spent asking the model to cite the span that settles the item. */
  groundingCalls: number;
  /** Items thrown out because nothing in the material supports them. */
  ungrounded: number;
  /** Kept items carrying a verified span from the learner's own material. */
  cited: number;
  /**
   * Items kept without a span because the reply's shape was unusable — too thin
   * to show, or a paste rather than a located sentence. Not a fault of the item.
   */
  unusableCitations: number;
  /** Calls spent embedding a stem to compare it against the stems already kept. */
  embedCalls: number;
  /** Items thrown out as paraphrases that word overlap did not catch. */
  paraphrased: number;
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
  /**
   * Questions already asked, so a later batch does not ask them again.
   *
   * Endless mode calls this loop several times over one piece of material, and each
   * call starts with an empty memory of what it has covered. Seeding that memory is
   * what keeps batch four off the ground batch one already took. Only the two
   * free repetition layers are seeded — the prompt's covered-ground list and the
   * word-overlap check — because the embeddings of earlier stems are not kept
   * anywhere, so the paid paraphrase gate still only sees the current batch.
   */
  avoid?: { topic: string; stem: string }[];
  /**
   * Where item ids start counting, so a later batch does not collide with an
   * earlier one. Item ids are `${packId}-${n}`, and two items with the same id
   * would be one item as far as every response, posterior and score is concerned.
   */
  indexOffset?: number;
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

/**
 * Asks for the span of the material that settles the question, and checks that
 * the span is really there.
 *
 * Temperature 0 for the same reason as the challenge above: whether an item ships
 * should not depend on the dice. The verdict carries the span when it passes,
 * because a verified quote is worth more than a verdict — it becomes the line the
 * learner is shown.
 */
async function ground(item: Item, material: string): Promise<GroundingVerdict> {
  const reply = await chatJson(
    [
      { role: "system", content: GROUNDING_SYSTEM_PROMPT },
      { role: "user", content: groundingUserPrompt(item, material) },
    ],
    { maxTokens: MAX_TOKENS_PER_GROUNDING, timeoutMs: 15_000, temperature: 0 },
  );
  return verifyGrounding(item, material, parseGrounding(reply));
}

export async function generateItems({
  material,
  count,
  packId,
  focus = [],
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  avoid = [],
  indexOffset = 0,
  onWarn,
}: GenerateOptions): Promise<GenerationOutcome> {
  const items: Item[] = [];
  const usedConcepts: string[] = avoid.map(
    (a) => `${a.topic} (asked: ${a.stem})`,
  );
  const usedKeys = new Set(avoid.map((a) => a.topic.toLowerCase()));
  const usedStems: string[] = avoid.map((a) => a.stem);
  /** One vector per kept stem, in step with usedStems where embedding worked. */
  const keptVectors: { stem: string; vector: number[] }[] = [];
  const rejections: Rejection[] = [];
  let keptDespiteRubric = 0;
  let repairCalls = 0;
  let repaired = 0;
  let challengeCalls = 0;
  let disputed = 0;
  let groundingCalls = 0;
  let ungrounded = 0;
  let cited = 0;
  let unusableCitations = 0;
  let embedCalls = 0;
  let paraphrased = 0;
  let stoppedEarly = false;

  const startedAt = Date.now();
  const timeLeft = () => timeBudgetMs - (Date.now() - startedAt);

  const maxAttempts = count + SPARE_ATTEMPTS;
  let attempts = 0;

  /**
   * The next question, already being written.
   *
   * Started while the current one is verified, so the wall clock per kept item is
   * the longer of the two calls rather than their sum. Held as a promise rather
   * than a result because it may never be needed: a full pack discards it, and
   * anything already paid for is cheaper to drop than to wait for.
   */
  let prefetched: Promise<unknown> | null = null;

  const askForItem = (position: number): Promise<unknown> =>
    chatJson(
      [
        { role: "system", content: GENERATE_SYSTEM_PROMPT },
        {
          role: "user",
          content: generateUserPrompt(
            material,
            position,
            count,
            // Copied: the live array keeps growing while this call is in flight.
            [...usedConcepts],
            focus[position - 1],
          ),
        },
      ],
      { maxTokens: MAX_TOKENS_PER_ITEM, timeoutMs: 20_000, temperature: 0.4 },
    );

  /** Takes the in-flight question if there is one, otherwise asks for one now. */
  const nextRaw = (position: number): Promise<unknown> => {
    const pending = prefetched;
    prefetched = null;
    return pending ?? askForItem(position);
  };

  const reject = (attempt: number, stage: RejectionStage, reason: string) => {
    rejections.push({ attempt, stage, reason });
    onWarn?.(`attempt ${attempt} rejected at ${stage} — ${reason}`);
  };

  /**
   * Marks ground as covered for the next prompt.
   *
   * Called for kept questions and for ones rejected as repetition alike: from
   * the prompt's point of view a reworded question is ground already visited,
   * and saying so is what stops the model returning to it.
   */
  const noteCovered = (topic: string, stem: string) => {
    usedConcepts.push(`${topic} (asked: ${stem})`);
    usedKeys.add(topic.toLowerCase());
    usedStems.push(stem);
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
    /** Whether this attempt's ground was already recorded, before the verdicts. */
    let noted = false;

    try {
      const raw = await nextRaw(items.length + 1);

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
        // Rejecting it silently lets the next prompt walk into the same ground.
        // The eval showed the cost: one source spent six attempts rewording a
        // single inflation question, because nothing ever told it to stop.
        noteCovered(generated.topic, generated.stem);
        continue;
      }

      // Word overlap is free and runs first; this only pays for what it missed.
      // The vector is kept whether or not it matches, so each stem is embedded
      // once and later stems compare against it without another call.
      let stemVector: number[] | null = null;
      if (count > 1 && canAffordToSkip && timeLeft() > RESERVE_FOR_EMBED_MS) {
        embedCalls += 1;
        // A failed embedding leaves the word-overlap verdict standing. The check
        // discards work, so it must not discard on its own malfunction.
        const [vector] = await embed([generated.stem], { timeoutMs: 8_000 }).catch(
          () => [],
        );
        stemVector = vector ?? null;
        if (stemVector) {
          const at = findNearDuplicate(
            stemVector,
            keptVectors.map((k) => k.vector),
          );
          if (at !== null) {
            reject(
              attempt,
              "paraphrase",
              `rewords "${keptVectors[at]!.stem}" as "${generated.stem}"`,
            );
            paraphrased += 1;
            noteCovered(generated.topic, generated.stem);
            continue;
          }
        }
      }

      const assembled = assembleItem(generated, packId, indexOffset + items.length);
      const graded = checkItem(assembled);
      if (!graded.ok) {
        reject(attempt, "rubric", graded.failures.map((f) => f.check).join(", "));
        if (canAffordToSkip) continue;
        keptDespiteRubric += 1;
      }

      // The free half of the citation gate: a duration or a distance the material
      // never mentions is invented, and seeing that costs nothing. Runs before the
      // paid calls so the commonest fabrication never buys one.
      const invented = canAffordToSkip ? numberFailure(assembled, material) : null;
      if (invented) {
        reject(attempt, "ungrounded", `${invented} | asked: ${assembled.stem}`);
        ungrounded += 1;
        noteCovered(generated.topic, generated.stem);
        continue;
      }

      // The last two gates, run together: one answers the question again blind to
      // the key, the other makes it cite the material. Worth paying for only when
      // the answer could change the outcome — at the floor the item ships either
      // way, so the calls would buy nothing.
      let sourceNote: string | undefined;
      if (canAffordToSkip && timeLeft() > RESERVE_FOR_VERIFY_MS) {
        challengeCalls += 1;
        groundingCalls += 1;
        // The next question is asked here, not after the verdicts come back. It is
        // covered ground either way: this item is noted below whether it is kept or
        // disputed, so the prompt in flight is the same prompt either outcome would
        // have produced. Kept unawaited so a verdict of "drop it" costs no wait.
        noteCovered(generated.topic, generated.stem);
        noted = true;
        if (
          items.length + 1 < count &&
          attempt < maxAttempts &&
          timeLeft() > RESERVE_FOR_ATTEMPT_MS + RESERVE_FOR_VERIFY_MS
        ) {
          // Rejection is swallowed here and re-thrown on await by the next attempt,
          // where it is recorded against that attempt like any other failed call.
          const inflight = askForItem(items.length + 2);
          inflight.catch(() => undefined);
          prefetched = inflight;
        }
        // A failed call leaves the item in, in both cases: silence is not a
        // dispute, and an unreachable API is not an unciteable question.
        const [dispute, cite] = await Promise.all([
          challenge(assembled).catch(() => null),
          ground(assembled, material).catch(
            (): GroundingVerdict => ({ failure: null, quote: null, unusable: null }),
          ),
        ]);
        if (dispute) {
          // The stem travels with the reason: a dispute is a claim about the
          // world, and it cannot be adjudicated without the question it is about.
          reject(attempt, "disputed", `${dispute} | asked: ${assembled.stem}`);
          disputed += 1;
          continue;
        }
        if (cite.failure) {
          reject(attempt, "ungrounded", `${cite.failure} | asked: ${assembled.stem}`);
          ungrounded += 1;
          continue;
        }
        if (cite.quote) {
          sourceNote = sourceNoteFrom(cite.quote);
          cited += 1;
        } else if (cite.unusable) {
          // The question stands; only its citation was lost. Logged rather than
          // silent, because a run where most replies are pastes is a prompt to fix
          // and would otherwise look like a run where the material had no spans.
          unusableCitations += 1;
          onWarn?.(`attempt ${attempt} kept without a citation — ${cite.unusable}`);
        }
      }

      items.push(sourceNote ? { ...assembled, sourceNote } : assembled);
      if (wasRepaired) repaired += 1;
      if (stemVector) keptVectors.push({ stem: generated.stem, vector: stemVector });
      if (!noted) noteCovered(generated.topic, generated.stem);
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
    groundingCalls,
    ungrounded,
    cited,
    unusableCitations,
    embedCalls,
    paraphrased,
    stoppedEarly,
  };
}
