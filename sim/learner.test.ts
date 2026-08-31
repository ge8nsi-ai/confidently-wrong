/**
 * The harness's own arithmetic.
 *
 * The report is only worth reading if the simulated learner behaves the way the
 * persona says, so the three places a persona's numbers turn into behaviour are
 * pinned here: which belief gets drawn, which option that makes them pick, and what a
 * correction is worth. Run by `npm test` rather than `npm run sim`, because unlike
 * the cohort run these are assertions and cost nothing.
 */

import { describe, expect, it } from "vitest";
import { SOUND } from "@/lib/belief";
import { PACKS } from "@/lib/packs";
import type { Item } from "@/lib/types";
import { answerItem, correctionChance, drawBeliefs } from "./learner";
import { PERSONAS } from "./personas";
import { rng } from "./rng";

const pack = PACKS[0]!;
const persona = PERSONAS[0]!;

function item(): Item {
  return {
    id: "t-1",
    conceptId: "c-1",
    topic: "topic",
    stem: "stem?",
    options: [
      { id: "a", text: "right", correct: true },
      { id: "b", text: "wrong", correct: false, misconception: "m-1" },
    ],
    fallbackRefutation: { believe: "x", wrong: "y", actual: "z" },
  };
}

describe("drawBeliefs", () => {
  it("gives one belief per concept in the pack", () => {
    const beliefs = drawBeliefs(pack, persona, rng(1));
    const concepts = new Set(pack.items.map((i) => i.conceptId));
    expect(beliefs.size).toBe(concepts.size);
    for (const concept of concepts) expect(beliefs.has(concept)).toBe(true);
  });

  it("only ever draws a belief the pack itself names", () => {
    const beliefs = drawBeliefs(pack, persona, rng(7));
    const named = new Set<string>([SOUND]);
    for (const i of pack.items) {
      for (const o of i.options) if (o.misconception) named.add(o.misconception);
    }
    for (const belief of beliefs.values()) expect(named.has(belief)).toBe(true);
  });

  it("draws sound beliefs at roughly the persona's stated rate", () => {
    // Over many packs, not one: a single pack is too few concepts to say anything.
    let sound = 0;
    let total = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      for (const p of PACKS) {
        for (const belief of drawBeliefs(p, persona, rng(seed)).values()) {
          total += 1;
          if (belief === SOUND) sound += 1;
        }
      }
    }
    expect(sound / total).toBeCloseTo(persona.soundRate, 1);
  });
});

describe("answerItem", () => {
  it("answers correctly when the belief is sound and no slip happens", () => {
    const never = { ...persona, slipRate: 0 };
    const pick = answerItem(item(), SOUND, never, rng(3));
    expect(pick.optionId).toBe("a");
    expect(pick.fromBelief).toBe(true);
  });

  it("picks a distractor when a sound belief slips, and does not know it", () => {
    const always = { ...persona, slipRate: 1 };
    const pick = answerItem(item(), SOUND, always, rng(3));
    expect(pick.optionId).toBe("b");
    // The certainty still comes from the believed table: a slip is not felt.
    expect(pick.fromBelief).toBe(true);
  });

  it("picks the option its held misconception points at, most of the time", () => {
    let onBelief = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      if (answerItem(item(), "m-1", persona, rng(seed)).optionId === "b") onBelief += 1;
    }
    // ACT_ON_BELIEF plus the times a guess lands on it anyway, so above the constant.
    expect(onBelief / 400).toBeGreaterThan(0.75);
  });

  it("reports a guess when the question does not offer the belief held", () => {
    const pick = answerItem(item(), "m-elsewhere", persona, rng(5));
    expect(pick.fromBelief).toBe(false);
  });
});

describe("correctionChance", () => {
  it("is the plain rate when a refutation has no lift over one", () => {
    const plain = correctionChance(persona, "plain", 1);
    expect(correctionChance(persona, "refutation", 0)).toBeCloseTo(plain, 10);
  });

  it("rises with the lift assumption and never falls", () => {
    const chances = [0, 0.25, 0.5, 0.75, 1].map((s) =>
      correctionChance(persona, "refutation", s),
    );
    for (let i = 1; i < chances.length; i += 1) {
      expect(chances[i]!).toBeGreaterThan(chances[i - 1]!);
    }
  });

  it("stays a probability for every persona at full lift", () => {
    for (const p of PERSONAS) {
      for (const kind of ["refutation", "plain", "none"] as const) {
        const c = correctionChance(p, kind, 1);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it("treats an untreated miss as the plain rate, since neither adds a lift", () => {
    expect(correctionChance(persona, "none", 1)).toBeCloseTo(
      correctionChance(persona, "plain", 1),
      10,
    );
  });
});
