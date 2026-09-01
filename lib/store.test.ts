import { describe, expect, it } from "vitest";
import {
  missedItems,
  probeResponses,
  recheckItems,
  refutationKey,
  sureWrongResponses,
} from "./store";
import { seasons } from "./packs";
import type { Conf, Response } from "./types";

function res(itemId: string, conf: Conf, correct: boolean): Response {
  return { itemId, chosenOptionId: "a", conf, correct, round: "probe" };
}

const responses: Response[] = [
  res("seasons-1", 3, false), // certain and wrong -> refutation
  res("seasons-2", 2, false), // fairly sure and wrong -> refutation
  res("seasons-3", 1, false), // guessed and wrong -> plain explanation only
  res("seasons-4", 3, true),
  res("seasons-5", 1, true),
  res("seasons-6", 2, true),
  res("seasons-7", 1, false), // guessed and wrong -> plain explanation only
];

describe("repair set gating", () => {
  it("includes every wrong answer in the missed list", () => {
    expect(missedItems(seasons, responses).map((i) => i.id)).toEqual([
      "seasons-1",
      "seasons-2",
      "seasons-3",
      "seasons-7",
    ]);
  });

  it("builds refutations only for wrong answers held with certainty", () => {
    expect(sureWrongResponses(responses).map((r) => r.itemId)).toEqual([
      "seasons-1",
      "seasons-2",
    ]);
  });

  it("never builds a refutation for a conf-1 wrong answer", () => {
    const ids = sureWrongResponses(responses).map((r) => r.itemId);
    expect(ids).not.toContain("seasons-3");
    expect(ids).not.toContain("seasons-7");
  });

  it("never builds a refutation for a correct answer", () => {
    const ids = sureWrongResponses(responses).map((r) => r.itemId);
    for (const id of ["seasons-4", "seasons-5", "seasons-6"]) {
      expect(ids).not.toContain(id);
    }
  });
});

describe("recheck items", () => {
  it("rechecks every missed item, reworded, keeping one correct option", () => {
    const items = recheckItems(seasons, responses);
    expect([...items.map((i) => i.variantOf)].sort()).toEqual([
      "seasons-1",
      "seasons-2",
      "seasons-3",
      "seasons-7",
    ]);
    for (const item of items) {
      expect(item.options.filter((o) => o.correct)).toHaveLength(1);
      const original = seasons.items.find((i) => i.id === item.variantOf)!;
      expect(item.stem).not.toBe(original.stem);
    }
  });

  it("puts the beliefs most likely to be genuinely held first", () => {
    const wrongOption = (id: string) =>
      seasons.items.find((i) => i.id === id)!.options.find((o) => !o.correct)!.id;
    const picked: Response[] = [
      {
        itemId: "seasons-1",
        chosenOptionId: wrongOption("seasons-1"),
        conf: 1,
        correct: false,
        round: "probe",
      },
      {
        itemId: "seasons-2",
        chosenOptionId: wrongOption("seasons-2"),
        conf: 3,
        correct: false,
        round: "probe",
      },
    ];
    // seasons-2 was missed while certain and seasons-1 only guessed, so the
    // confident miss is rechecked first despite coming later in the pack.
    expect(recheckItems(seasons, picked).map((i) => i.variantOf)).toEqual([
      "seasons-2",
      "seasons-1",
    ]);
  });

  it("lets history break the tie between two equally weak misses", () => {
    const wrongOption = (id: string) =>
      seasons.items.find((i) => i.id === id)!.options.find((o) => !o.correct)!.id;
    const first = seasons.items.find((i) => i.id === "seasons-1")!;
    const second = seasons.items.find((i) => i.id === "seasons-2")!;
    const guessedWrong = (id: string): Response => ({
      itemId: id,
      chosenOptionId: wrongOption(id),
      conf: 1,
      correct: false,
      round: "probe",
    });
    const picked = [guessedWrong("seasons-1"), guessedWrong("seasons-2")];

    // Both were guesses, so on this session alone the pack order stands.
    expect(recheckItems(seasons, picked).map((i) => i.variantOf)).toEqual([
      "seasons-1",
      "seasons-2",
    ]);

    // Remembering that the second belief was held before promotes it: the recheck
    // round is finite attention, and a belief that keeps coming back has earned it.
    const remembered = second.options.find((o) => o.id === wrongOption("seasons-2"))!
      .misconception!;
    const prior = (conceptId: string, keys: string[]) =>
      conceptId === second.conceptId && conceptId !== first.conceptId
        ? keys.map((k) => (k === remembered ? 0.6 : 0.4 / (keys.length - 1)))
        : null;
    expect(recheckItems(seasons, picked, prior).map((i) => i.variantOf)).toEqual([
      "seasons-2",
      "seasons-1",
    ]);
  });

  it("returns nothing when there is no pack", () => {
    expect(recheckItems(null, responses)).toEqual([]);
    expect(missedItems(null, responses)).toEqual([]);
  });
});

describe("helpers", () => {
  it("separates probe from recheck responses", () => {
    const mixed: Response[] = [
      ...responses,
      { ...res("seasons-1", 3, true), round: "recheck" },
    ];
    expect(probeResponses(mixed)).toHaveLength(responses.length);
  });

  it("keys refutations by item and chosen option", () => {
    expect(refutationKey("seasons-1", "a")).toBe("seasons-1:a");
  });
});
