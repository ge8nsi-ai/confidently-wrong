/**
 * What the cohort is actually able to measure.
 *
 * Two things, and neither is "refutation works on people":
 *
 * 1. Belief recovery. The simulated learner's held misconception is drawn from the
 *    same hypothesis space lib/belief.ts searches, so the model can be scored on
 *    whether it named the right one. That is a fact about the model's arithmetic,
 *    not about learners, and it is the strongest number in here.
 *
 * 2. Policy efficiency. Given a stated assumption about how much a refutation is
 *    worth over a plain explanation, how many corrections does the app's targeted
 *    policy give up against refuting every miss, and how many paid calls does it
 *    save doing it. Sweeping the assumption is the point: the honest claim is a
 *    curve, not a number.
 */

import { SOUND, beliefStates, topBelief } from "@/lib/belief";
import { quadrant } from "@/lib/scoring";
import type { Pack, Response } from "@/lib/types";
import type { Beliefs, SimResult, Treatment } from "./learner";
import { correctionChance } from "./learner";
import type { Persona } from "./personas";

export interface Recovery {
  /** Concepts the learner was asked about at all. */
  concepts: number;
  /** Concepts where the leading belief matched what the learner actually held. */
  identified: number;
  /** Concepts where the learner held a misconception, rather than having it right. */
  heldMisconception: number;
  /** Of those, the ones the model named exactly. */
  misconceptionsNamed: number;
  /** Concepts with at least one answer that was wrong and held with certainty. */
  sureWrongConcepts: number;
  /** Of those, the ones the model named exactly. The case the app acts on. */
  sureWrongNamed: number;
}

/** Scores lib/belief.ts against what the simulated learner really believed. */
export function recovery(
  pack: Pack,
  probe: Response[],
  beliefs: Beliefs,
): Recovery {
  const out: Recovery = {
    concepts: 0,
    identified: 0,
    heldMisconception: 0,
    misconceptionsNamed: 0,
    sureWrongConcepts: 0,
    sureWrongNamed: 0,
  };

  const sureWrongConcepts = new Set(
    probe
      .filter((r) => quadrant(r) === "SURE_WRONG")
      .map((r) => pack.items.find((i) => i.id === r.itemId)?.conceptId)
      .filter((c): c is string => Boolean(c)),
  );

  for (const state of beliefStates(pack.items, probe)) {
    if (state.observations === 0) continue;
    const truth = beliefs.get(state.conceptId) ?? SOUND;
    const named = topBelief(state)?.key;
    const hit = named === truth;

    out.concepts += 1;
    if (hit) out.identified += 1;
    if (truth !== SOUND) {
      out.heldMisconception += 1;
      if (hit) out.misconceptionsNamed += 1;
    }
    if (sureWrongConcepts.has(state.conceptId)) {
      out.sureWrongConcepts += 1;
      if (hit) out.sureWrongNamed += 1;
    }
  }
  return out;
}

export type PolicyName = "targeted" | "blanket" | "plain";

export interface PolicyOutcome {
  /** Paid refutation calls the policy spends. */
  calls: number;
  /** Expected beliefs cleared, over the misses that were beliefs at all. */
  corrections: number;
  /** Misses that were misreadings rather than beliefs. No policy touches these. */
  slips: number;
  /** Misses that were a held misconception. The denominator that matters. */
  beliefs: number;
}

/**
 * What a policy would achieve on one run, in expectation rather than by sampling.
 *
 * Expectation because the comparison is between policies over the same misses, and
 * sampling would put a coin flip between them. The sampled version is what
 * runSession already produced, and it is what the report's before-and-after uses.
 */
export function applyPolicy(
  result: SimResult,
  policy: PolicyName,
  liftScale: number,
): PolicyOutcome {
  const out: PolicyOutcome = { calls: 0, corrections: 0, slips: 0, beliefs: 0 };
  const byItem = new Map(result.treatments.map((t) => [t.itemId, t.kind]));

  for (const [itemId, targetedKind] of byItem) {
    const item = result.pack.items.find((i) => i.id === itemId);
    if (!item) continue;
    const truth = result.beliefs.get(item.conceptId) ?? SOUND;

    if (truth === SOUND) {
      out.slips += 1;
      // Still costs a call under a blanket policy, which is half the point.
      if (policy === "blanket") out.calls += 1;
      if (policy === "targeted" && targetedKind === "refutation") out.calls += 1;
      continue;
    }

    out.beliefs += 1;
    const kind: Treatment["kind"] =
      policy === "blanket"
        ? "refutation"
        : policy === "plain"
          ? "plain"
          : targetedKind;
    if (kind === "refutation") out.calls += 1;
    out.corrections += correctionChance(result.persona, kind, liftScale);
  }
  return out;
}

/** The gating rule's own arithmetic: who got a refutation and who did not. */
export function gatingCounts(results: SimResult[]): {
  refutations: number;
  plain: number;
  sureWrongTreated: number;
  guessedWrongRefuted: number;
} {
  let refutations = 0;
  let plain = 0;
  let sureWrongTreated = 0;
  let guessedWrongRefuted = 0;

  for (const result of results) {
    const byId = new Map(result.probe.map((r) => [r.itemId, r]));
    for (const treatment of result.treatments) {
      const response = byId.get(treatment.itemId);
      if (!response) continue;
      if (treatment.kind === "refutation") {
        refutations += 1;
        if (quadrant(response) === "SURE_WRONG") sureWrongTreated += 1;
        if (response.conf === 1) guessedWrongRefuted += 1;
      } else {
        plain += 1;
      }
    }
  }
  return { refutations, plain, sureWrongTreated, guessedWrongRefuted };
}

/** Personas, for the report table. */
export function personaLine(persona: Persona): string {
  return `${persona.name} · ${persona.confidence}, sound ${Math.round(
    persona.soundRate * 100,
  )}%, sticky ${Math.round(persona.stickiness * 100)}%`;
}
