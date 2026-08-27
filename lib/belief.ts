/**
 * A model of what the learner believes, inferred from their certainty ratings.
 *
 * Certainty is normally just a scoring multiplier. Here it is evidence. Two people
 * who pick the same wrong answer are in different states — one holds the
 * misconception, the other flipped a mental coin — and the certainty they stated is
 * the only thing that separates them. So each answer is treated as an observation
 * of the pair (option chosen, certainty stated), and a posterior is kept over which
 * belief the learner holds for each concept. That posterior then decides what to ask
 * next: the question whose answer is least predictable is the one that teaches the
 * model most.
 *
 * Everything here is pure arithmetic. No model call, no API key, nothing that can
 * fail mid-demo, and the same inputs always give the same ordering.
 */

import { topicLabel } from "./topics";
import type { Conf, Item, Response } from "./types";

/** The hypothesis that the learner simply has the concept right. */
export const SOUND = "sound";

const CONFS: readonly Conf[] = [1, 2, 3];

/**
 * P(the learner picks the option their belief points at).
 *
 * Below 1 because a held belief still competes with careless reading and with a
 * distractor that happens to sound better; above 1/n so that acting on the belief
 * is still the single likeliest outcome.
 */
const ACT_ON_BELIEF = 0.75;

/** P(certainty | the pick followed from the belief under test). */
const CONF_WHEN_HELD: Record<Conf, number> = { 1: 0.15, 2: 0.35, 3: 0.5 };

/**
 * P(certainty | the pick followed from no belief at all — a guess).
 *
 * Skewed low, and that skew is the whole mechanism: it makes "wrong and certain"
 * strong evidence of a held misconception and "wrong while guessing" almost none.
 */
const CONF_WHEN_GUESSED: Record<Conf, number> = { 1: 0.55, 2: 0.3, 3: 0.15 };

export interface Hypothesis {
  /** The misconception statement itself, or SOUND for the correct understanding. */
  key: string;
  /** How it reads on screen. */
  label: string;
  probability: number;
}

export interface BeliefState {
  conceptId: string;
  topic: string;
  /** Most probable belief first. */
  hypotheses: Hypothesis[];
  /** Bits of uncertainty left. Zero means one belief accounts for everything. */
  entropy: number;
  /** How many answers fed this posterior. */
  observations: number;
}

/**
 * The candidate beliefs for one concept: every misconception its items name, plus
 * the possibility that the learner is simply right.
 *
 * Keyed on the misconception text rather than an option id, so two items about the
 * same concept that offer the same misconception in different positions count as
 * evidence about one belief instead of two.
 */
export function hypothesisKeys(items: Item[]): string[] {
  const keys = [SOUND];
  for (const item of items) {
    for (const option of item.options) {
      const key = option.misconception?.trim();
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/** The option a learner holding this belief would pick, if it is on offer here. */
function optionForHypothesis(item: Item, key: string): string | null {
  if (key === SOUND) {
    return item.options.find((o) => o.correct)?.id ?? null;
  }
  return item.options.find((o) => o.misconception?.trim() === key)?.id ?? null;
}

/**
 * P(this answer | the learner holds this belief).
 *
 * A belief that is not on offer in this item has nothing to act on, so the learner
 * is modelled as guessing — which is also why an item can only sharpen the beliefs
 * it actually asks about.
 */
export function likelihood(
  item: Item,
  key: string,
  chosenOptionId: string,
  conf: Conf,
): number {
  const n = item.options.length;
  if (n === 0) return 0;
  const target = optionForHypothesis(item, key);
  if (!target || n === 1) return (1 / n) * CONF_WHEN_GUESSED[conf];

  const matched = chosenOptionId === target;
  const pOption = matched ? ACT_ON_BELIEF : (1 - ACT_ON_BELIEF) / (n - 1);
  const pConf = matched ? CONF_WHEN_HELD[conf] : CONF_WHEN_GUESSED[conf];
  return pOption * pConf;
}

/** Shannon entropy in bits. Zero when one outcome is certain. */
export function entropyOf(probabilities: number[]): number {
  let total = 0;
  for (const p of probabilities) {
    if (p > 0) total -= p * Math.log2(p);
  }
  return total;
}

/**
 * Bayes over the candidate beliefs, one answer at a time.
 *
 * The prior is flat: before anything is asked, a learner who has not studied the
 * material is no more likely to be right than to hold any one misconception, and
 * inventing a prior here would only bake an assumption into the demo.
 */
export function posterior(
  keys: string[],
  items: Item[],
  responses: Response[],
): number[] {
  const flat = keys.map(() => 1 / keys.length);
  if (keys.length === 0) return [];
  const byId = new Map(items.map((i) => [i.id, i]));
  let weights = flat;

  for (const response of responses) {
    const item = byId.get(response.itemId);
    if (!item) continue;
    const updated = weights.map(
      (w, i) =>
        w * likelihood(item, keys[i]!, response.chosenOptionId, response.conf),
    );
    const total = updated.reduce((sum, w) => sum + w, 0);
    // Every hypothesis assigning zero to an observed answer would mean the model
    // and the data disagree completely; falling back to the prior is honest.
    if (total <= 0) return flat;
    weights = updated.map((w) => w / total);
  }

  return weights;
}

/** How many of these responses are about items belonging to this concept. */
function countObservations(items: Item[], responses: Response[]): number {
  const ids = new Set(items.map((i) => i.id));
  return responses.filter((r) => ids.has(r.itemId)).length;
}

/** Items grouped by concept, in the order the concepts first appear in the pack. */
export function byConcept(items: Item[]): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const group = groups.get(item.conceptId);
    if (group) group.push(item);
    else groups.set(item.conceptId, [item]);
  }
  return groups;
}

/** One posterior per concept in the pack, each ranked most-probable-belief first. */
export function beliefStates(
  items: Item[],
  responses: Response[],
): BeliefState[] {
  const states: BeliefState[] = [];

  for (const [conceptId, group] of byConcept(items)) {
    const keys = hypothesisKeys(group);
    const probabilities = posterior(keys, group, responses);
    const hypotheses: Hypothesis[] = keys
      .map((key, i) => ({
        key,
        label: key === SOUND ? "Has this right" : key,
        probability: probabilities[i] ?? 0,
      }))
      // Ties keep SOUND first, which is the order hypothesisKeys built.
      .sort((a, b) => b.probability - a.probability);

    states.push({
      conceptId,
      topic: topicLabel(conceptId, group[0]?.topic),
      hypotheses,
      entropy: entropyOf(probabilities),
      observations: countObservations(group, responses),
    });
  }

  return states;
}

export function topBelief(state: BeliefState): Hypothesis | null {
  return state.hypotheses[0] ?? null;
}

/** One line for the reveal screen. */
export function beliefSentence(state: BeliefState): string {
  const top = topBelief(state);
  if (!top || state.observations === 0) return "Nothing asked about this yet.";
  const pct = Math.round(top.probability * 100);
  if (top.key === SOUND) {
    return `Most likely you have this right (${pct}%).`;
  }
  return `Most likely belief: ${top.label} (${pct}%)`;
}

/**
 * Expected bits this item would remove from the posterior.
 *
 * Averaged over every answer the learner might give, weighted by how likely the
 * current posterior thinks that answer is. An item whose answer is already
 * predictable scores near zero — asking it again would confirm what is known
 * instead of resolving what is not.
 */
export function informationGain(
  item: Item,
  keys: string[],
  probabilities: number[],
): number {
  const before = entropyOf(probabilities);
  let expected = 0;

  for (const option of item.options) {
    for (const conf of CONFS) {
      const joint = keys.map(
        (key, i) =>
          (probabilities[i] ?? 0) * likelihood(item, key, option.id, conf),
      );
      const pOutcome = joint.reduce((sum, w) => sum + w, 0);
      if (pOutcome <= 0) continue;
      expected += pOutcome * entropyOf(joint.map((w) => w / pOutcome));
    }
  }

  // Clamped because floating-point noise can make a zero gain read as -1e-16.
  return Math.max(0, before - expected);
}

/** Ties break on pack order, so a flat posterior plays the pack as written. */
const GAIN_EPSILON = 1e-9;

/**
 * The unanswered item that would tell us most about the learner right now.
 *
 * Returns null once nothing is left. Callers that want the plain fixed order can
 * simply not call this — nothing else in the flow depends on it.
 */
export function selectNextItem(
  items: Item[],
  responses: Response[],
): Item | null {
  const answered = new Set(responses.map((r) => r.itemId));
  const remaining = items.filter((i) => !answered.has(i.id));
  if (remaining.length === 0) return null;

  const groups = byConcept(items);
  const cache = new Map<string, { keys: string[]; probabilities: number[] }>();
  for (const [conceptId, group] of groups) {
    const keys = hypothesisKeys(group);
    cache.set(conceptId, {
      keys,
      probabilities: posterior(keys, group, responses),
    });
  }

  let best = remaining[0]!;
  let bestGain = -1;
  for (const item of remaining) {
    const state = cache.get(item.conceptId);
    if (!state) continue;
    const gain = informationGain(item, state.keys, state.probabilities);
    if (gain > bestGain + GAIN_EPSILON) {
      best = item;
      bestGain = gain;
    }
  }
  return best;
}

/**
 * The pack reordered so each question is the most informative one left.
 *
 * Recomputed after every real answer in the live flow; this helper exists for the
 * tests and for anywhere a whole ordering is wanted at once.
 */
export function informativeOrder(items: Item[], responses: Response[]): Item[] {
  const order: Item[] = [];
  const seen = new Set(responses.map((r) => r.itemId));
  let remaining = items.filter((i) => !seen.has(i.id));

  while (remaining.length > 0) {
    const next = selectNextItem(remaining, responses);
    if (!next) break;
    order.push(next);
    remaining = remaining.filter((i) => i.id !== next.id);
  }
  return order;
}

/**
 * How confident the model is that the learner holds the belief they picked.
 *
 * Zero when they picked the correct answer, or when no answer for the item exists.
 */
export function heldBeliefStrength(
  item: Item,
  items: Item[],
  responses: Response[],
): number {
  const response = responses.find((r) => r.itemId === item.id);
  if (!response) return 0;
  const chosen = item.options.find((o) => o.id === response.chosenOptionId);
  const key = chosen?.misconception?.trim();
  if (!key) return 0;

  const group = items.filter((i) => i.conceptId === item.conceptId);
  const keys = hypothesisKeys(group);
  const at = keys.indexOf(key);
  if (at < 0) return 0;
  return posterior(keys, group, responses)[at] ?? 0;
}

/**
 * Misses ordered by how sure the model is the belief is really held.
 *
 * The recheck round is finite attention, so it is spent on the beliefs most likely
 * to be genuine rather than on whichever miss happened to come first in the pack.
 */
export function orderByHeldBelief(
  missed: Item[],
  items: Item[],
  responses: Response[],
): Item[] {
  const strength = new Map(
    missed.map((item) => [item.id, heldBeliefStrength(item, items, responses)]),
  );
  // Sorting a copy keeps the caller's array intact, and the pack-order tie-break
  // keeps the list stable while the round is being played.
  return [...missed].sort(
    (a, b) => (strength.get(b.id) ?? 0) - (strength.get(a.id) ?? 0),
  );
}
