import { describe, expect, it } from "vitest";
import {
  brier,
  calibration,
  cbmScore,
  confToProb,
  needsRefutation,
  overconfidence,
  quadrant,
} from "./scoring";
import type { Conf, Response } from "./types";

function r(conf: Conf, correct: boolean, id = "i1"): Response {
  return {
    itemId: id,
    chosenOptionId: `${id}-o1`,
    conf,
    correct,
    round: "probe",
  };
}

describe("confToProb", () => {
  it("maps all three buckets", () => {
    expect(confToProb(1)).toBe(0.4);
    expect(confToProb(2)).toBe(0.7);
    expect(confToProb(3)).toBe(0.9);
  });
});

describe("quadrant", () => {
  it("classifies all four cells", () => {
    expect(quadrant(r(3, true))).toBe("SURE_RIGHT");
    expect(quadrant(r(2, true))).toBe("SURE_RIGHT");
    expect(quadrant(r(3, false))).toBe("SURE_WRONG");
    expect(quadrant(r(2, false))).toBe("SURE_WRONG");
    expect(quadrant(r(1, true))).toBe("UNSURE_RIGHT");
    expect(quadrant(r(1, false))).toBe("UNSURE_WRONG");
  });
});

describe("cbmScore", () => {
  it("penalises certain-and-wrong at -6, worse than guessing-and-wrong at 0", () => {
    expect(cbmScore([r(3, false)])).toBe(-6);
    expect(cbmScore([r(1, false)])).toBe(0);
    expect(cbmScore([r(3, false)])).toBeLessThan(cbmScore([r(1, false)]));
  });

  it("rewards the full table", () => {
    expect(cbmScore([r(1, true)])).toBe(1);
    expect(cbmScore([r(2, true)])).toBe(2);
    expect(cbmScore([r(2, false)])).toBe(-2);
    expect(cbmScore([r(3, true)])).toBe(3);
  });

  it("is 0 for an empty array and never NaN", () => {
    expect(cbmScore([])).toBe(0);
    expect(Number.isNaN(cbmScore([]))).toBe(false);
  });
});

describe("brier", () => {
  it("scores a well-calibrated pair lower than an overconfident-wrong pair", () => {
    const calibrated = [r(3, true, "a"), r(1, false, "b")];
    const overconfident = [r(3, false, "a"), r(3, false, "b")];
    expect(brier(calibrated)).toBeLessThan(brier(overconfident));
  });

  it("is 0 for an empty array", () => {
    expect(brier([])).toBe(0);
  });
});

describe("overconfidence", () => {
  it("is positive when all answers are certain and half are wrong", () => {
    const rs = [r(3, true, "a"), r(3, false, "b")];
    expect(overconfidence(rs)).toBeGreaterThan(0);
    expect(overconfidence(rs)).toBeCloseTo(0.9 - 0.5, 10);
  });

  it("is negative when all answers are guesses and all are correct", () => {
    const rs = [r(1, true, "a"), r(1, true, "b")];
    expect(overconfidence(rs)).toBeLessThan(0);
    expect(overconfidence(rs)).toBeCloseTo(0.4 - 1, 10);
  });

  it("is 0 for an empty array", () => {
    expect(overconfidence([])).toBe(0);
  });
});

describe("calibration", () => {
  it("returns one bucket per distinct confidence used, with correct n", () => {
    const rs = [
      r(1, true, "a"),
      r(1, false, "b"),
      r(3, false, "c"),
      r(3, false, "d"),
      r(3, true, "e"),
    ];
    const buckets = calibration(rs);
    expect(buckets.map((b) => b.conf)).toEqual([1, 3]);
    expect(buckets[0]).toMatchObject({ conf: 1, stated: 0.4, observed: 0.5, n: 2 });
    expect(buckets[1]).toMatchObject({ conf: 3, stated: 0.9, n: 3 });
    expect(buckets[1].observed).toBeCloseTo(1 / 3, 10);
  });

  it("returns no buckets for an empty array and never divides by zero", () => {
    const buckets = calibration([]);
    expect(buckets).toEqual([]);
    expect(buckets.some((b) => Number.isNaN(b.observed))).toBe(false);
  });
});

describe("needsRefutation", () => {
  it("is true only for sure-and-wrong", () => {
    expect(needsRefutation(r(3, false))).toBe(true);
    expect(needsRefutation(r(2, false))).toBe(true);
    expect(needsRefutation(r(1, false))).toBe(false);
    expect(needsRefutation(r(3, true))).toBe(false);
    expect(needsRefutation(r(2, true))).toBe(false);
    expect(needsRefutation(r(1, true))).toBe(false);
  });
});
