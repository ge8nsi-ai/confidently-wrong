/**
 * Twelve simulated learners.
 *
 * The personalities are not decoration. Every field is a number the simulation
 * reads, and the blurb is the sentence that number came from: "Priya checks her
 * answer twice and still says she is only fairly sure" is what `confidence:
 * "cautious"` means, and writing it down is what stops the cohort quietly becoming
 * twelve copies of one average learner.
 *
 * What a persona does NOT claim is that a real person behaves this way. These are
 * assumptions, stated in one place so they can be argued with and swept. See
 * sim/README.md for what the cohort can and cannot be used to say.
 */

import type { Conf } from "@/lib/types";

/** How a learner's certainty relates to whether they actually know the answer. */
export type ConfidenceStyle = "overconfident" | "calibrated" | "cautious";

export interface Persona {
  id: string;
  name: string;
  /** The sentence the numbers below came from. */
  blurb: string;
  /** P(this learner has a given concept right rather than holding a misconception). */
  soundRate: number;
  confidence: ConfidenceStyle;
  /** P(picking a distractor anyway on a concept they understand). Misreading. */
  slipRate: number;
  /**
   * P(a held misconception survives a plain statement of the correct answer).
   *
   * The lever the app's whole thesis sits on, so it is a persona trait rather than
   * a constant: a learner who never held the belief has nothing to be stubborn
   * about, and one who built a year of reasoning on it has plenty.
   */
  stickiness: number;
  /**
   * How much of that stickiness a personalised refutation gets through.
   *
   * 0 means the refutation is worth no more than the plain explanation. 1 means it
   * removes the belief outright. Butterfield and Metcalfe's hypercorrection effect
   * is the reason this is above zero for confidently held beliefs; the size of it
   * is an assumption, and sim/cohort.sim.ts sweeps it rather than trusting it.
   */
  refutationLift: number;
}

/** Certainty a learner reaches for when the answer came from a belief they hold. */
export const CONF_WHEN_BELIEVED: Record<ConfidenceStyle, Record<Conf, number>> = {
  overconfident: { 1: 0.05, 2: 0.25, 3: 0.7 },
  calibrated: { 1: 0.15, 2: 0.45, 3: 0.4 },
  cautious: { 1: 0.35, 2: 0.5, 3: 0.15 },
};

/** Certainty a learner reaches for when they are guessing and know it. */
export const CONF_WHEN_GUESSING: Record<ConfidenceStyle, Record<Conf, number>> = {
  overconfident: { 1: 0.3, 2: 0.45, 3: 0.25 },
  calibrated: { 1: 0.7, 2: 0.25, 3: 0.05 },
  cautious: { 1: 0.85, 2: 0.13, 3: 0.02 },
};

export const PERSONAS: Persona[] = [
  {
    id: "marcus",
    name: "Marcus",
    blurb:
      "Read the textbook once in year 9 and has been confident ever since. Answers fast, never hedges, and is genuinely surprised when he is wrong.",
    soundRate: 0.45,
    confidence: "overconfident",
    slipRate: 0.05,
    stickiness: 0.75,
    refutationLift: 0.55,
  },
  {
    id: "priya",
    name: "Priya",
    blurb:
      "Knows most of this and says she is only fairly sure anyway. Checks her answer twice, then picks the one she first thought of.",
    soundRate: 0.8,
    confidence: "cautious",
    slipRate: 0.08,
    stickiness: 0.4,
    refutationLift: 0.35,
  },
  {
    id: "dan",
    name: "Dan",
    blurb:
      "Taught himself from videos, so what he has is a mix of the real account and a confident half-version of it. Certain about both.",
    soundRate: 0.5,
    confidence: "overconfident",
    slipRate: 0.07,
    stickiness: 0.8,
    refutationLift: 0.6,
  },
  {
    id: "aisha",
    name: "Aisha",
    blurb:
      "Well calibrated and slightly bored. Knows what she knows, marks the rest as a guess, and moves on.",
    soundRate: 0.75,
    confidence: "calibrated",
    slipRate: 0.06,
    stickiness: 0.35,
    refutationLift: 0.3,
  },
  {
    id: "tom",
    name: "Tom",
    blurb:
      "First time near the topic. Almost everything is a guess and he says so, which is the one thing the scoring rewards him for.",
    soundRate: 0.25,
    confidence: "cautious",
    slipRate: 0.12,
    stickiness: 0.25,
    refutationLift: 0.15,
  },
  {
    id: "leyla",
    name: "Leyla",
    blurb:
      "Strong student with two specific blind spots she has never had contradicted, and she is certain about exactly those two.",
    soundRate: 0.85,
    confidence: "overconfident",
    slipRate: 0.04,
    stickiness: 0.85,
    refutationLift: 0.65,
  },
  {
    id: "sam",
    name: "Sam",
    blurb:
      "Guesses a lot and marks it as certainty, because saying you are unsure feels like losing. The quadrant grid is going to be blunt with him.",
    soundRate: 0.4,
    confidence: "overconfident",
    slipRate: 0.15,
    stickiness: 0.5,
    refutationLift: 0.3,
  },
  {
    id: "nadia",
    name: "Nadia",
    blurb:
      "Retaking the course. Holds a small number of durable misconceptions from the first attempt and has already survived one correction of them.",
    soundRate: 0.6,
    confidence: "calibrated",
    slipRate: 0.06,
    stickiness: 0.9,
    refutationLift: 0.5,
  },
  {
    id: "george",
    name: "George",
    blurb:
      "Careful reader, slow, gets there. Underrates himself badly enough that the calibration curve will sit under the diagonal.",
    soundRate: 0.7,
    confidence: "cautious",
    slipRate: 0.05,
    stickiness: 0.3,
    refutationLift: 0.25,
  },
  {
    id: "yuki",
    name: "Yuki",
    blurb:
      "Answers well and rushes, so the misses are misreadings rather than beliefs. A refutation aimed at her is aimed at nothing.",
    soundRate: 0.85,
    confidence: "calibrated",
    slipRate: 0.18,
    stickiness: 0.2,
    refutationLift: 0.1,
  },
  {
    id: "ben",
    name: "Ben",
    blurb:
      "Average on every axis, deliberately. The cohort needs someone who is not making a point.",
    soundRate: 0.6,
    confidence: "calibrated",
    slipRate: 0.08,
    stickiness: 0.55,
    refutationLift: 0.4,
  },
  {
    id: "irina",
    name: "Irina",
    blurb:
      "Knows the material and knows she knows it. Here to show what the top of the quadrant grid looks like when there is nothing to repair.",
    soundRate: 0.95,
    confidence: "calibrated",
    slipRate: 0.03,
    stickiness: 0.3,
    refutationLift: 0.2,
  },
];
