/**
 * A simulated learner working through a pack.
 *
 * This drives the app's own engine rather than imitating it: questions are ordered
 * by `selectNextItem` from lib/belief.ts, the repair set is gated by
 * `needsRefutation` from lib/scoring.ts, and the recheck round is built by
 * `recheckItems` from lib/store.ts. What the persona supplies is only the part a
 * real learner supplies: which belief they hold, which option that makes them pick,
 * how certain they say they are, and whether a correction sticks.
 *
 * That split is what makes the output worth anything. A number here is a claim
 * about the app's behaviour given a stated assumption about learners, never a
 * measurement of learners.
 */

import { SOUND, hypothesisKeys } from "@/lib/belief";
import { selectNextItem } from "@/lib/belief";
import { needsRefutation } from "@/lib/scoring";
import { missedItems, probeResponses, recheckItems } from "@/lib/store";
import { baseItemId, itemMetaFor } from "@/lib/topics";
import type { Conf, Item, Pack, Response, SessionRecord } from "@/lib/types";
import { CONF_WHEN_BELIEVED, CONF_WHEN_GUESSING, type Persona } from "./personas";
import { chance, pick, weighted } from "./rng";

/**
 * P(a learner picks the option their held belief points at).
 *
 * Below 1 for the same reason lib/belief.ts assumes the same thing: a held belief
 * still competes with a distractor that happens to read better. Kept as a separate
 * constant from the model's own ACT_ON_BELIEF on purpose. If the simulation used
 * the model's number, the belief model would be scored against a world built from
 * its own assumptions, and its recovery rate would mean nothing.
 */
const ACT_ON_BELIEF = 0.8;

/** What the learner actually believes, per concept, before they answer anything. */
export type Beliefs = Map<string, string>;

export interface Treatment {
  itemId: string;
  kind: "refutation" | "plain";
}

export interface SimResult {
  persona: Persona;
  pack: Pack;
  beliefs: Beliefs;
  probe: Response[];
  recheck: Response[];
  treatments: Treatment[];
  session: SessionRecord;
}

/**
 * Draws one belief per concept from the concepts the pack actually names.
 *
 * Taken from `hypothesisKeys` so the ground truth lives in exactly the space the
 * belief model searches. Anything else would be scoring the model on a question it
 * was never asked.
 */
export function drawBeliefs(
  pack: Pack,
  persona: Persona,
  random: () => number,
): Beliefs {
  const beliefs: Beliefs = new Map();
  const concepts = new Map<string, Item[]>();
  for (const item of pack.items) {
    const group = concepts.get(item.conceptId) ?? [];
    group.push(item);
    concepts.set(item.conceptId, group);
  }

  for (const [conceptId, group] of concepts) {
    if (chance(random, persona.soundRate)) {
      beliefs.set(conceptId, SOUND);
      continue;
    }
    const wrong = hypothesisKeys(group).filter((k) => k !== SOUND);
    beliefs.set(conceptId, wrong.length > 0 ? pick(random, wrong) : SOUND);
  }
  return beliefs;
}

function confOf(
  persona: Persona,
  random: () => number,
  from: "belief" | "guess",
): Conf {
  const table =
    from === "belief"
      ? CONF_WHEN_BELIEVED[persona.confidence]
      : CONF_WHEN_GUESSING[persona.confidence];
  return Number(weighted(random, table)) as Conf;
}

interface Pick {
  optionId: string;
  conf: Conf;
  /** Whether the answer came from a belief the learner holds, right or wrong. */
  fromBelief: boolean;
}

/** How this learner answers one question, given what they believe about it. */
export function answerItem(
  item: Item,
  belief: string,
  persona: Persona,
  random: () => number,
): Pick {
  const correct = item.options.find((o) => o.correct)!;
  const distractors = item.options.filter((o) => !o.correct);

  if (belief === SOUND) {
    // A slip is a misreading, not a belief, and the learner does not know it
    // happened: the certainty still comes from the table for something they think
    // they know. This is the case a personalised refutation is aimed at nothing.
    if (chance(random, persona.slipRate)) {
      return {
        optionId: pick(random, distractors).id,
        conf: confOf(persona, random, "belief"),
        fromBelief: true,
      };
    }
    return {
      optionId: correct.id,
      conf: confOf(persona, random, "belief"),
      fromBelief: true,
    };
  }

  const target = distractors.find((o) => o.misconception === belief);
  if (target && chance(random, ACT_ON_BELIEF)) {
    return {
      optionId: target.id,
      conf: confOf(persona, random, "belief"),
      fromBelief: true,
    };
  }

  // Either this question does not offer the belief they hold, or the belief lost
  // to a better-reading option. Both come out as a guess, and they know it.
  return {
    optionId: pick(random, item.options).id,
    conf: confOf(persona, random, "guess"),
    fromBelief: false,
  };
}

/** The probe round, ordered live by the app's own information-gain selection. */
export function runProbe(
  pack: Pack,
  persona: Persona,
  beliefs: Beliefs,
  random: () => number,
): Response[] {
  const responses: Response[] = [];
  for (let guard = 0; guard < pack.items.length + 1; guard += 1) {
    const item = selectNextItem(pack.items, responses);
    if (!item) break;
    const belief = beliefs.get(item.conceptId) ?? SOUND;
    const chosen = answerItem(item, belief, persona, random);
    const option = item.options.find((o) => o.id === chosen.optionId);
    responses.push({
      itemId: item.id,
      chosenOptionId: chosen.optionId,
      conf: chosen.conf,
      correct: Boolean(option?.correct),
      round: "probe",
    });
  }
  return responses;
}

/**
 * The repair round's own gating rule, read off the app rather than restated.
 *
 * The order is the one StudyFlow builds: refutations first, plain explanations
 * after, and nothing at all for an answer that was right.
 */
export function planRepair(pack: Pack, responses: Response[]): Treatment[] {
  const byId = new Map(probeResponses(responses).map((r) => [r.itemId, r]));
  const steps: Treatment[] = [];
  for (const item of missedItems(pack, responses)) {
    const response = byId.get(item.id);
    if (!response) continue;
    steps.push({
      itemId: item.id,
      kind: needsRefutation(response) ? "refutation" : "plain",
    });
  }
  return [
    ...steps.filter((s) => s.kind === "refutation"),
    ...steps.filter((s) => s.kind === "plain"),
  ];
}

/**
 * P(the belief is gone by the recheck round).
 *
 * A plain explanation leaves it in place with probability `stickiness`. A refutation
 * takes `refutationLift` of that stickiness away. `liftScale` is the sweep knob: at
 * 0 a refutation is worth exactly what a plain explanation is worth, which is the
 * null the whole app is arguing against.
 */
export function correctionChance(
  persona: Persona,
  kind: "refutation" | "plain" | "none",
  liftScale: number,
): number {
  if (kind === "none") return 1 - persona.stickiness;
  const lift = kind === "refutation" ? persona.refutationLift * liftScale : 0;
  return 1 - persona.stickiness * (1 - lift);
}

/** The recheck round: reworded questions over the misses, built by the app. */
export function runRecheck(
  pack: Pack,
  probe: Response[],
  treatments: Treatment[],
  persona: Persona,
  beliefs: Beliefs,
  random: () => number,
  liftScale: number,
): Response[] {
  const treatedBy = new Map(treatments.map((t) => [t.itemId, t.kind]));
  const responses: Response[] = [];

  for (const variant of recheckItems(pack, probe)) {
    const baseId = variant.variantOf ?? baseItemId(variant.id);
    const belief = beliefs.get(variant.conceptId) ?? SOUND;
    const kind = treatedBy.get(baseId) ?? "none";

    // A miss that was a misreading is not a belief to correct: the learner simply
    // reads it properly this time, or does not, at their own slip rate.
    const corrected =
      belief === SOUND
        ? !chance(random, persona.slipRate)
        : chance(random, correctionChance(persona, kind, liftScale));

    const correct = variant.options.find((o) => o.correct)!;
    const target =
      variant.options.find((o) => o.misconception === belief) ??
      variant.options.find((o) => !o.correct)!;
    const optionId = corrected ? correct.id : target.id;

    responses.push({
      itemId: variant.id,
      chosenOptionId: optionId,
      conf: confOf(persona, random, "belief"),
      correct: corrected,
      round: "recheck",
    });
  }
  return responses;
}

/** One persona's whole run through one pack, in the shape history stores. */
export function runSession(
  pack: Pack,
  persona: Persona,
  random: () => number,
  liftScale = 1,
  startedAt = Date.UTC(2026, 7, 20),
): SimResult {
  const beliefs = drawBeliefs(pack, persona, random);
  const probe = runProbe(pack, persona, beliefs, random);
  const treatments = planRepair(pack, probe);
  const recheck = runRecheck(
    pack,
    probe,
    treatments,
    persona,
    beliefs,
    random,
    liftScale,
  );

  return {
    persona,
    pack,
    beliefs,
    probe,
    recheck,
    treatments,
    session: {
      id: `sim-${persona.id}-${pack.id}`,
      packId: pack.id,
      packTitle: pack.title,
      origin: "builtin",
      startedAt,
      updatedAt: startedAt + 9 * 60_000,
      finished: true,
      probe,
      recheck,
      itemMeta: itemMetaFor(pack.items),
    },
  };
}
