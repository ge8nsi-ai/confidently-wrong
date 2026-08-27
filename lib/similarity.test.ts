import { describe, expect, it } from "vitest";
import { NEAR_DUPLICATE_COSINE, cosine, findNearDuplicate } from "./similarity";

describe("cosine", () => {
  it("is 1 for a vector against itself", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("ignores magnitude, so a scaled copy is still identical", () => {
    expect(cosine([1, 2, 3], [10, 20, 30])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is negative for opposed vectors", () => {
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  // 0 reads as "not a duplicate", which is the direction that keeps a malformed
  // embedding row from throwing away a good question.
  it("returns 0 rather than throwing on a length mismatch", () => {
    expect(cosine([1, 2, 3], [1, 2])).toBe(0);
  });

  it("returns 0 for an empty vector", () => {
    expect(cosine([], [])).toBe(0);
  });

  it("returns 0 for a zero vector instead of dividing by zero", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(Number.isNaN(cosine([0, 0], [1, 1]))).toBe(false);
  });
});

describe("findNearDuplicate", () => {
  const a = [1, 0, 0];

  it("finds nothing in an empty history", () => {
    expect(findNearDuplicate(a, [])).toBeNull();
  });

  it("finds an exact repeat", () => {
    expect(findNearDuplicate(a, [[0, 1, 0], [1, 0, 0]])).toBe(1);
  });

  it("leaves a distinct question alone", () => {
    expect(findNearDuplicate(a, [[0, 1, 0], [0, 0, 1]])).toBeNull();
  });

  it("returns the closest match, not merely the first over the line", () => {
    // 0.9 and 0.99 against the probe; the tighter one is the pair worth naming.
    const near = [0.9, Math.sqrt(1 - 0.81), 0];
    const nearer = [0.99, Math.sqrt(1 - 0.9801), 0];
    expect(findNearDuplicate(a, [near, nearer])).toBe(1);
  });

  it("respects a threshold passed in", () => {
    const near = [0.9, Math.sqrt(1 - 0.81), 0];
    expect(findNearDuplicate(a, [near], 0.95)).toBeNull();
    expect(findNearDuplicate(a, [near], 0.85)).toBe(0);
  });

  it("treats the threshold as inclusive", () => {
    const at = [NEAR_DUPLICATE_COSINE, Math.sqrt(1 - NEAR_DUPLICATE_COSINE ** 2), 0];
    expect(findNearDuplicate(a, [at])).toBe(0);
  });

  it("skips an unusable stored row instead of failing on it", () => {
    expect(findNearDuplicate(a, [[1, 0], [1, 0, 0]])).toBe(1);
  });

  // The measured classes overlap, so the threshold is the least-wrong line
  // rather than a gap: it must stay above the highest distinct pair scored so far
  // and below the tightest same pair it is meant to catch.
  // See scripts/measure-similarity.mjs.
  it("keeps the threshold where the sweep put it", () => {
    expect(NEAR_DUPLICATE_COSINE).toBeGreaterThan(0.877);
    expect(NEAR_DUPLICATE_COSINE).toBeLessThanOrEqual(0.887);
  });
});
