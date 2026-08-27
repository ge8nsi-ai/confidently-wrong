import { describe, expect, it } from "vitest";
import {
  SOUND,
  beliefSentence,
  beliefStates,
  entropyOf,
  hypothesisKeys,
  informationGain,
  informativeOrder,
  likelihood,
  posterior,
  selectNextItem,
  topBelief,
} from "./belief";
import { seasons } from "./packs";
import type { Conf, Item, Response } from "./types";

const STROMA = "All of photosynthesis happens in the stroma.";
const MITOCHONDRIA = "Photosynthesis happens in mitochondria.";

function item(id: string, conceptId: string): Item {
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
    ],
    fallbackRefutation: { believe: "b", wrong: "w", actual: "a" },
  };
}

function answer(
  itemId: string,
  chosenOptionId: string,
  conf: Conf,
  correct = false,
): Response {
  return { itemId, chosenOptionId, conf, correct, round: "probe" };
}

const light = item("p-1", "light-reactions");

/** Probability of one named hypothesis after a given set of answers. */
function beliefIn(key: string, responses: Response[], items = [light]): number {
  const state = beliefStates(items, responses)[0]!;
  return state.hypotheses.find((h) => h.key === key)!.probability;
}

describe("hypothesisKeys", () => {
  it("offers being right plus every misconception the items name", () => {
    expect(hypothesisKeys([light])).toEqual([SOUND, STROMA, MITOCHONDRIA]);
  });

  it("counts a misconception shared by two items as one belief", () => {
    expect(hypothesisKeys([light, item("p-2", "light-reactions")])).toHaveLength(3);
  });
});

describe("certainty as evidence", () => {
  it("treats the same wrong answer differently depending on certainty", () => {
    const sure = beliefIn(STROMA, [answer("p-1", "a", 3)]);
    const guessed = beliefIn(STROMA, [answer("p-1", "a", 1)]);
    expect(sure).toBeGreaterThan(guessed);
    // The whole mechanism: a confident wrong answer is strong evidence of a held
    // belief, a guessed one barely moves off the flat prior.
    expect(sure).toBeGreaterThan(0.7);
    expect(guessed).toBeLessThan(0.5);
  });

  it("leaves a guess close to knowing nothing", () => {
    const flat = 1 / 3;
    expect(beliefIn(STROMA, [answer("p-1", "a", 1)]) - flat).toBeLessThan(0.2);
  });

  it("pushes the untouched misconception down either way", () => {
    expect(beliefIn(MITOCHONDRIA, [answer("p-1", "a", 3)])).toBeLessThan(1 / 3);
  });

  it("reads a confident correct answer as understanding", () => {
    const sound = beliefIn(SOUND, [answer("p-1", "b", 3, true)]);
    expect(sound).toBeGreaterThan(0.7);
  });

  it("accumulates across two items about the same concept", () => {
    const items = [light, item("p-2", "light-reactions")];
    const once = beliefIn(STROMA, [answer("p-1", "a", 3)], items);
    const twice = beliefIn(
      STROMA,
      [answer("p-1", "a", 3), answer("p-2", "a", 3)],
      items,
    );
    expect(twice).toBeGreaterThan(once);
  });

  it("ignores answers to items outside the concept", () => {
    const flat = 1 / 3;
    expect(beliefIn(STROMA, [answer("other-9", "a", 3)])).toBeCloseTo(flat);
  });
});

describe("posterior", () => {
  it("is flat before anything is asked", () => {
    expect(posterior(hypothesisKeys([light]), [light], [])).toEqual([
      1 / 3,
      1 / 3,
      1 / 3,
    ]);
  });

  it("always sums to one", () => {
    const probabilities = posterior(
      hypothesisKeys([light]),
      [light],
      [answer("p-1", "c", 2)],
    );
    expect(probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("handles a pack with no hypotheses at all", () => {
    expect(posterior([], [], [])).toEqual([]);
  });
});

describe("likelihood", () => {
  it("is highest for the belief the chosen option points at", () => {
    const held = likelihood(light, STROMA, "a", 3);
    const other = likelihood(light, MITOCHONDRIA, "a", 3);
    expect(held).toBeGreaterThan(other);
  });

  it("models a belief that is not on offer as a guess", () => {
    const absent = likelihood(light, "A belief no option names.", "a", 3);
    expect(absent).toBeCloseTo((1 / 3) * 0.15);
  });
});

describe("entropyOf", () => {
  it("is zero when one belief is certain and maximal when flat", () => {
    expect(entropyOf([1, 0, 0])).toBe(0);
    expect(entropyOf([0.5, 0.5])).toBeCloseTo(1);
    expect(entropyOf([1 / 4, 1 / 4, 1 / 4, 1 / 4])).toBeCloseTo(2);
  });
});

describe("informationGain", () => {
  const keys = hypothesisKeys([light]);

  it("is worth more when nothing is known than once a belief is pinned", () => {
    const cold = informationGain(light, keys, posterior(keys, [light], []));
    const warm = informationGain(
      light,
      keys,
      posterior(keys, [light], [answer("p-1", "a", 3), answer("p-1", "a", 3)]),
    );
    expect(cold).toBeGreaterThan(warm);
  });

  it("never reports a negative gain", () => {
    expect(informationGain(light, keys, [1, 0, 0])).toBeGreaterThanOrEqual(0);
  });
});

describe("selectNextItem", () => {
  const wide = [
    item("p-1", "light-reactions"),
    item("p-2", "calvin-cycle"),
    item("p-3", "light-reactions"),
  ];

  it("plays the pack in order while nothing is known", () => {
    expect(selectNextItem(wide, [])!.id).toBe("p-1");
  });

  it("moves to an untouched concept once one is pinned down", () => {
    // p-1 answered with certainty leaves little left to learn about its concept,
    // so asking p-3 about the same concept is worth less than p-2 about a new one.
    const next = selectNextItem(wide, [answer("p-1", "a", 3)])!;
    expect(next.id).toBe("p-2");
  });

  it("never returns an item already answered", () => {
    const answered = [answer("p-1", "a", 3), answer("p-2", "b", 2, true)];
    expect(selectNextItem(wide, answered)!.id).toBe("p-3");
  });

  it("returns null when the pack is exhausted", () => {
    const all = wide.map((i) => answer(i.id, "a", 2));
    expect(selectNextItem(wide, all)).toBeNull();
  });
});

describe("informativeOrder", () => {
  it("covers every item exactly once", () => {
    const wide = [
      item("p-1", "light-reactions"),
      item("p-2", "calvin-cycle"),
      item("p-3", "light-reactions"),
    ];
    const order = informativeOrder(wide, []);
    expect(order.map((i) => i.id).sort()).toEqual(["p-1", "p-2", "p-3"]);
  });

  it("skips what has already been answered", () => {
    const order = informativeOrder([light], [answer("p-1", "a", 2)]);
    expect(order).toEqual([]);
  });
});

describe("beliefStates", () => {
  it("ranks the most probable belief first and names the topic", () => {
    const state = beliefStates([light], [answer("p-1", "a", 3)])[0]!;
    expect(state.topic).toBe("Light reactions");
    expect(topBelief(state)!.key).toBe(STROMA);
    expect(state.observations).toBe(1);
  });

  it("shrinks the entropy as evidence arrives", () => {
    const cold = beliefStates([light], [])[0]!;
    const warm = beliefStates([light], [answer("p-1", "a", 3)])[0]!;
    expect(warm.entropy).toBeLessThan(cold.entropy);
  });

  it("gives one state per concept, in pack order", () => {
    const states = beliefStates(
      [item("p-1", "light-reactions"), item("p-2", "calvin-cycle")],
      [],
    );
    expect(states.map((s) => s.conceptId)).toEqual([
      "light-reactions",
      "calvin-cycle",
    ]);
  });
});

describe("beliefSentence", () => {
  it("says nothing was asked before any evidence", () => {
    expect(beliefSentence(beliefStates([light], [])[0]!)).toBe(
      "Nothing asked about this yet.",
    );
  });

  it("names the misconception it thinks the learner holds", () => {
    const state = beliefStates([light], [answer("p-1", "a", 3)])[0]!;
    expect(beliefSentence(state)).toContain(STROMA);
    expect(beliefSentence(state)).toMatch(/\(\d+%\)/);
  });

  it("reads differently when the learner looks sound", () => {
    const state = beliefStates([light], [answer("p-1", "b", 3, true)])[0]!;
    expect(beliefSentence(state)).toContain("you have this right");
  });
});

describe("a whole adaptive round over a real pack", () => {
  /**
   * Plays the seasons pack as a learner who consistently holds one misconception
   * and answers everything else correctly, letting the model choose the order.
   * This is the end-to-end claim: the belief it converges on is the planted one.
   */
  function play(held: string, conf: Conf) {
    const responses: Response[] = [];
    for (let asked = 0; asked < seasons.items.length; asked += 1) {
      const next = selectNextItem(seasons.items, responses);
      if (!next) break;
      const trap = next.options.find((o) => o.misconception?.trim() === held);
      const correct = next.options.find((o) => o.correct)!;
      responses.push(
        trap
          ? answer(next.id, trap.id, conf)
          : answer(next.id, correct.id, 3, true),
      );
    }
    return responses;
  }

  const DISTANCE = "Seasons are caused by Earth's changing distance from the Sun.";

  it("asks every question exactly once", () => {
    const responses = play(DISTANCE, 3);
    expect(responses).toHaveLength(seasons.items.length);
    expect(new Set(responses.map((r) => r.itemId)).size).toBe(responses.length);
  });

  it("converges on the misconception the learner actually holds", () => {
    const responses = play(DISTANCE, 3);
    const held = beliefStates(seasons.items, responses)
      .filter((s) => s.observations > 0)
      .map((s) => topBelief(s)!);
    expect(held.some((h) => h.key === DISTANCE && h.probability > 0.8)).toBe(true);
  });

  it("stays undecided when the same answers were only guesses", () => {
    const strengthOf = (responses: Response[]) =>
      Math.max(
        ...beliefStates(seasons.items, responses).map(
          (s) => s.hypotheses.find((h) => h.key === DISTANCE)?.probability ?? 0,
        ),
      );
    // The same options chosen, only the certainty differs: the model commits to
    // the belief just when the learner did. This is what the whole app rests on.
    expect(strengthOf(play(DISTANCE, 1))).toBeLessThan(
      strengthOf(play(DISTANCE, 3)),
    );
    expect(strengthOf(play(DISTANCE, 1))).toBeLessThan(0.6);
  });
});
