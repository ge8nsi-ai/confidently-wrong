/**
 * A seeded generator, so a cohort run is the same cohort every time.
 *
 * Simulated results that move between runs cannot be cited, argued with, or
 * regression-tested. mulberry32 is used because it is four lines, has no
 * dependency, and its quality is far beyond what deciding "does this learner
 * misread this question" asks of it.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True with probability p. */
export function chance(random: () => number, p: number): boolean {
  return random() < p;
}

/** One element, uniformly. */
export function pick<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length)] ?? list[0]!;
}

/**
 * One key from a weighted table.
 *
 * Used for certainty, where the whole point is that the distribution differs by
 * persona: an overconfident learner is not a calibrated one with noise added, they
 * are a learner whose 3 means something else.
 */
export function weighted<K extends string | number>(
  random: () => number,
  weights: Record<K, number>,
): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}
