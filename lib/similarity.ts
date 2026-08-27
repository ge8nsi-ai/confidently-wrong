/**
 * Cosine similarity, and the one threshold the generator uses it for.
 *
 * Word overlap cannot tell a reworded question from a new one. A live pack kept
 * both of these, because they share almost no content words beyond "Sun",
 * "Moon" and "tidal":
 *
 *   "Why does the Sun's gravity have a smaller tidal effect than the Moon's
 *    despite being much more massive?"
 *   "Why does the Sun's tidal force on Earth's oceans feel weaker than the
 *    Moon's even though the Sun is much bigger and closer to Earth's center?"
 *
 * They are the same question, and a learner answering both learns one thing and
 * pays for two slots.
 */

/**
 * Cosine of two vectors, or 0 when either is unusable.
 *
 * Returning 0 rather than throwing on a length mismatch keeps a malformed
 * embedding row from rejecting a good question: 0 reads as "not a duplicate",
 * which is the safe direction for a check that discards work.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

/**
 * Where a paraphrase stops and a new question starts, measured rather than
 * guessed.
 *
 * `scripts/measure-similarity.mjs` embeds eighteen pairs of stems that real eval
 * runs produced, hand-labelled same or distinct — including every pair this
 * check itself called a reword, so it is swept against its own output — and
 * tries every threshold. The classes overlap: same-question pairs run 0.872 to
 * 0.919, distinct pairs 0.719 to 0.877. There is no clean gap, so the sweep
 * picks the least-wrong line instead of a perfect one.
 *
 * 0.88 misfiles one pair of the eighteen — "why is high tide every 12h 25min"
 * against "why two high tides a day", at 0.872, which slips through as distinct.
 * 0.87 would catch it and lose two good questions instead. That trade is the
 * reason for the higher number: a missed paraphrase costs one slot in a pack, a
 * false positive costs a good question and the call that produced it, and the
 * word-overlap check in lib/custom-pack.ts still catches the wordier repeats.
 *
 * Note the floor: `mistral-embed` puts unrelated questions around 0.72, not near
 * 0, so this number is not transferable to another embedding model without
 * repeating the measurement.
 */
export const NEAR_DUPLICATE_COSINE = 0.88;

/**
 * Index of the first stored vector this one is a paraphrase of, or null.
 *
 * The index rather than a boolean, so the caller can name which earlier question
 * the rejected one repeats — a rejection reason that does not say what was
 * repeated cannot be checked by whoever reads the eval report.
 */
export function findNearDuplicate(
  vector: number[],
  existing: number[][],
  threshold: number = NEAR_DUPLICATE_COSINE,
): number | null {
  let bestIndex: number | null = null;
  let best = threshold;
  existing.forEach((other, index) => {
    const score = cosine(vector, other);
    if (score >= best) {
      best = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}
