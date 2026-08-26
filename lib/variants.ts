import type { Item } from "./types";

/**
 * Hand-written rewordings used to build recheck items. The underlying concept and
 * the correct option are unchanged; only the surface form of the question moves,
 * so a learner cannot pass by remembering the shape of the first question.
 */
const REWORDED_STEMS: Record<string, string> = {
  "seasons-1":
    "A friend says summer is warm because we swing nearer the Sun. What is the actual driver of the seasons?",
  "seasons-2":
    "On which date does Earth reach the nearest point of its orbit to the Sun?",
  "seasons-3":
    "A family in Buenos Aires is sunbathing while Berlin is under snow. What explains this?",
  "seasons-4":
    "Singapore sits on the equator and its monthly average temperature barely moves all year. Why?",
  "seasons-5":
    "You stand in Berlin at noon on the longest day of the year. Describe the Sun's position.",
  "seasons-6":
    "Two identical patches of ground receive the same beam of sunlight, one head-on and one at a shallow slant. Why is the slanted patch cooler?",
  "seasons-7":
    "Peak sunlight in the north arrives at the June solstice, but the hottest spell tends to come weeks later. What accounts for the delay?",

  "selection-1":
    "Over decades, a beetle population living on pale bark becomes mostly pale, having started mixed. What produced this shift?",
  "selection-2":
    "Which statement best captures whether evolution has a direction?",
  "selection-3":
    "A fungus population survives repeated treatment with a fungicide that once killed it. Where did the survival ability come from?",
  "selection-4":
    "Two males of the same species differ in reproductive success. In evolutionary terms, what makes one 'fitter' than the other?",
  "selection-5":
    "How should the usefulness of new mutations be characterised across a genome?",
  "selection-6":
    "A parent spends twenty years training as a gymnast and becomes extremely flexible. What is passed to their child?",
  "selection-7":
    "Cave-dwelling fish lineages have lost functioning eyes. Which account of how that happened is correct?",

  "chance-1":
    "Regions that sell more sunscreen also record more heatstroke admissions. What can you conclude?",
  "chance-2":
    "A roulette wheel has come up red eight spins in a row. What is the probability the next spin is black?",
  "chance-3":
    "A screening test with 99% accuracy is applied to a condition present in 1 person in 1,000. Given a positive result, what is the approximate chance the condition is present?",
  "chance-4":
    "One study measures an effect in 30 participants, another in 3,000. What difference should you expect between them?",
  "chance-5":
    "Which schools tend to show up at both the top and the bottom of exam-improvement league tables?",
  "chance-6":
    "The lowest-scoring students are given a revision workshop and score higher on the retest. What is the safest interpretation?",
  "chance-7":
    "Which is more probable for a randomly chosen adult: that they play a musical instrument, or that they play a musical instrument and read sheet music?",
};

/** Rotate the option order so position memory does not carry over. */
function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr;
  const shift = ((by % arr.length) + arr.length) % arr.length;
  return [...arr.slice(shift), ...arr.slice(0, shift)];
}

/** Build the recheck variant of a probe item. */
export function toVariant(item: Item, seed = 1): Item {
  return {
    ...item,
    id: `${item.id}-v`,
    stem: REWORDED_STEMS[item.id] ?? item.stem,
    options: rotate(item.options, seed + 1).map((o) => ({ ...o })),
    variantOf: item.id,
  };
}

export function hasRewording(itemId: string): boolean {
  return itemId in REWORDED_STEMS;
}
