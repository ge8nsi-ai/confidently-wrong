import { describe, expect, it } from "vitest";
import {
  BATCH,
  DEFAULT_TARGET,
  FIRST_BATCH,
  LOW_WATER,
  MAX_BATCH_FAILURES,
  MAX_TARGET,
  TARGET_STEP,
  avoidList,
  canExtend,
  clampTarget,
  extendedTarget,
  indexOffsetFor,
  isRoundComplete,
  nextBatchSize,
  progressLabel,
  targetOf,
  unanswered,
} from "./endless";
import type { Item, Pack, Response } from "./types";

function item(n: number): Item {
  return {
    id: `p-${n}`,
    conceptId: `c-${n}`,
    topic: `topic ${n}`,
    stem: `stem ${n}?`,
    options: [
      { id: "a", text: "right", correct: true },
      { id: "b", text: "wrong", correct: false, misconception: `m-${n}` },
    ],
    fallbackRefutation: {
      believe: "x",
      wrong: "y",
      actual: "z",
    },
  };
}

function pack(items: number, extra: Partial<Pack> = {}): Pack {
  return {
    id: "p",
    title: "Pack",
    blurb: "b",
    items: Array.from({ length: items }, (_, i) => item(i)),
    ...extra,
  };
}

function answers(n: number): Response[] {
  return Array.from({ length: n }, (_, i) => ({
    itemId: `p-${i}`,
    chosenOptionId: "a",
    conf: 2 as const,
    correct: true,
    round: "probe" as const,
  }));
}

const idle = { inFlight: false, failures: 0 };

describe("clampTarget", () => {
  it("falls back to the default for anything unreadable", () => {
    expect(clampTarget(undefined)).toBe(DEFAULT_TARGET);
    expect(clampTarget("nonsense")).toBe(DEFAULT_TARGET);
    expect(clampTarget(NaN)).toBe(DEFAULT_TARGET);
  });

  it("holds the ceiling and the floor", () => {
    expect(clampTarget(9999)).toBe(MAX_TARGET);
    expect(clampTarget(-4)).toBe(FIRST_BATCH);
    expect(clampTarget("15")).toBe(15);
    expect(clampTarget(12.4)).toBe(12);
  });
});

describe("targetOf", () => {
  it("is the pack length when the pack is not endless", () => {
    expect(targetOf(pack(6))).toBe(6);
  });

  it("is the clamped target when it is", () => {
    expect(targetOf(pack(3, { endless: true, target: 15 }))).toBe(15);
    expect(targetOf(pack(3, { endless: true, target: 500 }))).toBe(MAX_TARGET);
    expect(targetOf(pack(3, { endless: true }))).toBe(DEFAULT_TARGET);
  });

  it("is zero with no pack", () => {
    expect(targetOf(null)).toBe(0);
  });
});

describe("isRoundComplete", () => {
  const endless = pack(3, { endless: true, target: 10, material: "m" });

  it("is false while the target is unmet, even with nothing left to answer", () => {
    expect(isRoundComplete(endless, 3)).toBe(false);
  });

  it("is true on the target", () => {
    expect(isRoundComplete(endless, 10)).toBe(true);
    expect(isRoundComplete(endless, 11)).toBe(true);
  });
});

describe("unanswered", () => {
  it("is what has arrived minus what has been answered", () => {
    expect(unanswered(pack(5), answers(2)).map((i) => i.id)).toEqual([
      "p-2",
      "p-3",
      "p-4",
    ]);
  });
});

describe("nextBatchSize", () => {
  const endless = (items: number, target = 10) =>
    pack(items, { endless: true, target, material: "some material" });

  it("asks for nothing on a fixed pack", () => {
    expect(nextBatchSize(pack(6), answers(1), idle)).toBe(0);
  });

  it("asks for nothing without material to write from", () => {
    expect(
      nextBatchSize(pack(3, { endless: true, target: 10 }), answers(1), idle),
    ).toBe(0);
  });

  it("asks for nothing while a batch is in flight", () => {
    expect(
      nextBatchSize(endless(3), answers(2), { inFlight: true, failures: 0 }),
    ).toBe(0);
  });

  it("gives up after enough consecutive failures", () => {
    expect(
      nextBatchSize(endless(3), answers(2), {
        inFlight: false,
        failures: MAX_BATCH_FAILURES,
      }),
    ).toBe(0);
  });

  it("waits while there are more than the low water mark in hand", () => {
    // 4 arrived, 1 answered, so 3 waiting, which is above LOW_WATER of 2.
    expect(nextBatchSize(endless(4), answers(1), idle)).toBe(0);
  });

  it("asks a full batch once the waiting queue is short", () => {
    // 3 arrived, 1 answered, so 2 waiting, which is at LOW_WATER.
    expect(unanswered(endless(3), answers(1))).toHaveLength(LOW_WATER);
    expect(nextBatchSize(endless(3), answers(1), idle)).toBe(BATCH);
  });

  it("never asks for more than the target still needs", () => {
    // Target 10, 8 answered, 1 waiting, so only 1 more is wanted.
    expect(nextBatchSize(endless(9), answers(8), idle)).toBe(1);
  });

  it("asks for nothing once the target is covered", () => {
    expect(nextBatchSize(endless(10), answers(9), idle)).toBe(0);
  });
});

describe("avoidList", () => {
  it("carries topic and stem, falling back to the concept id", () => {
    const items = [item(0), { ...item(1), topic: undefined }];
    expect(avoidList(items)).toEqual([
      { topic: "topic 0", stem: "stem 0?" },
      { topic: "c-1", stem: "stem 1?" },
    ]);
  });
});

describe("indexOffsetFor", () => {
  it("counts every item the pack has ever been given", () => {
    expect(indexOffsetFor(pack(7))).toBe(7);
    expect(indexOffsetFor(null)).toBe(0);
  });
});

describe("progressLabel", () => {
  it("counts towards the target and never past it", () => {
    const p = pack(3, { endless: true, target: 10 });
    expect(progressLabel(p, 0)).toBe("Question 1 of 10");
    expect(progressLabel(p, 9)).toBe("Question 10 of 10");
    expect(progressLabel(p, 12)).toBe("Question 10 of 10");
  });
});

describe("extending", () => {
  it("is offered until the ceiling", () => {
    expect(canExtend(pack(6))).toBe(false);
    expect(canExtend(pack(3, { endless: true, target: 10 }))).toBe(true);
    expect(canExtend(pack(3, { endless: true, target: MAX_TARGET }))).toBe(false);
  });

  it("adds a step, stopping at the ceiling", () => {
    expect(extendedTarget(pack(3, { endless: true, target: 10 }))).toBe(
      10 + TARGET_STEP,
    );
    expect(
      extendedTarget(pack(3, { endless: true, target: MAX_TARGET - 1 })),
    ).toBe(MAX_TARGET);
  });
});
