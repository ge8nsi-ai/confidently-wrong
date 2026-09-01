import { describe, expect, it } from "vitest";
import {
  EXHAUSTED_AFTER,
  STYLES,
  STYLE_DIRECTIVE,
  STYLE_LABEL,
  isExhausted,
  styleFor,
  survivalSentence,
  survivingBeliefs,
  switchReason,
} from "./escalation";
import { toVariant } from "./variants";
import type { Conf, Item, Response } from "./types";

const STROMA = "All of photosynthesis happens in the stroma.";
const MITOCHONDRIA = "Photosynthesis happens in mitochondria.";

function item(id: string, conceptId = "light-reactions"): Item {
  return {
    id,
    conceptId,
    topic: "Light reactions",
    stem: `Where do the light reactions happen? (${id})`,
    options: [
      { id: "a", text: "In the stroma", correct: false, misconception: STROMA },
      { id: "b", text: "In the thylakoid membrane", correct: true },
      {
        id: "c",
        text: "In the mitochondria",
        correct: false,
        misconception: MITOCHONDRIA,
      },
      // A wrong option the pack never named a belief for.
      { id: "d", text: "In the cell wall", correct: false },
    ],
    fallbackRefutation: { believe: "b", wrong: "w", actual: "a" },
  };
}

function probeAnswer(
  itemId: string,
  chosenOptionId: string,
  conf: Conf,
  correct = false,
): Response {
  return { itemId, chosenOptionId, conf, correct, round: "probe" };
}

function recheckAnswer(
  itemId: string,
  chosenOptionId: string,
  conf: Conf,
  correct = false,
): Response {
  return { itemId, chosenOptionId, conf, correct, round: "recheck" };
}

describe("the ladder", () => {
  it("starts with the plainest explanation", () => {
    expect(styleFor(0)).toBe("direct");
    expect(STYLES[0]).toBe("direct");
  });

  it("switches style on the second attempt rather than repeating", () => {
    expect(styleFor(1)).toBe("contrast");
    expect(styleFor(1)).not.toBe(styleFor(0));
  });

  it("stops instead of rewording a third time", () => {
    expect(styleFor(2)).toBeNull();
    expect(styleFor(9)).toBeNull();
    expect(isExhausted(2)).toBe(true);
    expect(isExhausted(1)).toBe(false);
  });

  it("gives up exactly when the styles run out", () => {
    expect(EXHAUSTED_AFTER).toBe(STYLES.length);
    expect(styleFor(EXHAUSTED_AFTER)).toBeNull();
    expect(styleFor(EXHAUSTED_AFTER - 1)).not.toBeNull();
  });

  it("treats a nonsense attempt count as the first attempt", () => {
    expect(styleFor(-3)).toBe("direct");
    expect(styleFor(Number.NaN)).toBe("direct");
    expect(styleFor(1.7)).toBe("contrast");
  });

  it("names every style and only changes the prompt after the first", () => {
    for (const style of STYLES) {
      expect(STYLE_LABEL[style].length).toBeGreaterThan(0);
    }
    expect(STYLE_DIRECTIVE.direct).toBe("");
    expect(STYLE_DIRECTIVE.contrast.length).toBeGreaterThan(40);
  });

  it("says out loud why the explanation changed", () => {
    expect(switchReason("contrast")).toMatch(/did not land/);
    expect(switchReason("contrast")).toMatch(/comparison/);
  });
});

describe("survivingBeliefs", () => {
  const light = item("p-1");

  it("finds a belief that was explained and came back", () => {
    const survivors = survivingBeliefs(
      [light],
      [probeAnswer("p-1", "a", 3)],
      [recheckAnswer("p-1-v", "a", 3)],
    );
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.item.id).toBe("p-1");
    expect(survivors[0]!.key).toBe(STROMA);
    expect(survivors[0]!.sameBelief).toBe(true);
  });

  it("resolves the reworded question back to the original item", () => {
    const variant = toVariant(light, 0);
    expect(variant.id).toBe("p-1-v");
    const survivors = survivingBeliefs(
      [light],
      [probeAnswer("p-1", "c", 2)],
      [recheckAnswer(variant.id, "c", 2)],
    );
    expect(survivors[0]!.item.stem).toBe(light.stem);
    expect(survivors[0]!.key).toBe(MITOCHONDRIA);
  });

  it("says nothing about a belief the recheck corrected", () => {
    expect(
      survivingBeliefs(
        [light],
        [probeAnswer("p-1", "a", 3)],
        [recheckAnswer("p-1-v", "b", 3, true)],
      ),
    ).toEqual([]);
  });

  it("ignores a recheck answer with no wrong probe answer behind it", () => {
    expect(
      survivingBeliefs(
        [light],
        [probeAnswer("p-1", "b", 3, true)],
        [recheckAnswer("p-1-v", "a", 3)],
      ),
    ).toEqual([]);
    expect(
      survivingBeliefs([light], [], [recheckAnswer("p-1-v", "a", 3)]),
    ).toEqual([]);
  });

  it("drops a guess that came back as a different guess", () => {
    expect(
      survivingBeliefs(
        [light],
        [probeAnswer("p-1", "a", 1)],
        [recheckAnswer("p-1-v", "c", 1)],
      ),
    ).toEqual([]);
  });

  it("keeps a guess that came back as the same wrong option twice", () => {
    const survivors = survivingBeliefs(
      [light],
      [probeAnswer("p-1", "a", 1)],
      [recheckAnswer("p-1-v", "a", 1)],
    );
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.sameBelief).toBe(true);
  });

  it("flags a switch to a second wrong option as a different belief", () => {
    const survivors = survivingBeliefs(
      [light],
      [probeAnswer("p-1", "a", 3)],
      [recheckAnswer("p-1-v", "c", 2)],
    );
    expect(survivors[0]!.sameBelief).toBe(false);
    expect(survivors[0]!.key).toBe(MITOCHONDRIA);
  });

  it("leaves the belief unnamed when the pack never named one", () => {
    const survivors = survivingBeliefs(
      [light],
      [probeAnswer("p-1", "d", 3)],
      [recheckAnswer("p-1-v", "d", 3)],
    );
    expect(survivors[0]!.key).toBeNull();
  });

  it("puts the certain survivors first, then the exactly repeated ones", () => {
    const second = item("p-2", "calvin-cycle");
    const third = item("p-3", "pigments");
    const survivors = survivingBeliefs(
      [light, second, third],
      [
        probeAnswer("p-1", "a", 2),
        probeAnswer("p-2", "a", 3),
        probeAnswer("p-3", "c", 2),
      ],
      [
        recheckAnswer("p-1-v", "c", 2),
        recheckAnswer("p-2-v", "a", 3),
        recheckAnswer("p-3-v", "c", 2),
      ],
    );
    expect(survivors.map((s) => s.item.id)).toEqual(["p-2", "p-3", "p-1"]);
  });

  it("returns nothing when the recheck round has not happened", () => {
    expect(survivingBeliefs([light], [probeAnswer("p-1", "a", 3)], [])).toEqual(
      [],
    );
  });
});

describe("survivalSentence", () => {
  it("says the good outcome without a number", () => {
    expect(survivalSentence(0)).toMatch(/came back corrected/);
  });

  it("counts one and many differently", () => {
    expect(survivalSentence(1)).toMatch(/^One belief survived/);
    expect(survivalSentence(3)).toMatch(/^3 beliefs survived/);
  });
});
