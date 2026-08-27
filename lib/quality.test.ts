import { describe, expect, it } from "vitest";
import { CHECKS, checkItem, checkPack, leaksAnswer, overlap } from "./quality";
import { PACKS } from "./packs";
import type { Item } from "./types";

/**
 * A question that passes every check, mutated per test to trip one.
 *
 * The options are deliberately similar in length, so a test that means to trip one
 * check does not trip the length rule by accident.
 */
function good(overrides: Partial<Item> = {}): Item {
  return {
    id: "q-1",
    conceptId: "light-reactions",
    topic: "Light reactions",
    stem: "Where in a chloroplast is the first stage of photosynthesis carried out?",
    options: [
      {
        id: "a",
        text: "In the thylakoid membrane, where the pigments sit.",
        correct: true,
      },
      {
        id: "b",
        text: "In the stroma, where the sugars are assembled.",
        correct: false,
        misconception: "All of photosynthesis happens in the stroma.",
      },
      {
        id: "c",
        text: "In the mitochondria, alongside respiration.",
        correct: false,
        misconception: "Photosynthesis happens in the mitochondria.",
      },
    ],
    fallbackRefutation: {
      believe: "You believe the whole process happens in the stroma.",
      wrong: "The stroma has no pigment to absorb light.",
      actual: "Light is absorbed in the thylakoid membrane.",
    },
    ...overrides,
  };
}

const failedChecks = (item: Item) =>
  checkItem(item).failures.map((f) => f.check);

describe("a well-formed question", () => {
  it("passes with nothing to report", () => {
    const report = checkItem(good());
    expect(report.failures).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe("structural checks", () => {
  it("rejects two correct answers and stops there", () => {
    const item = good();
    item.options[1]!.correct = true;
    const report = checkItem(item);
    // Reported as one fault rather than a cascade: the later checks all assume a
    // single answer exists.
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.check).toBe("one-correct");
  });

  it("rejects a question with no correct answer", () => {
    const item = good();
    item.options[0]!.correct = false;
    expect(failedChecks(item)).toEqual(["one-correct"]);
  });

  it("wants at least three options and two distractors", () => {
    const item = good({
      options: [
        {
          id: "a",
          text: "In the thylakoid membrane, where the pigments sit.",
          correct: true,
        },
        {
          id: "b",
          text: "In the stroma, where the sugars are assembled.",
          correct: false,
          misconception: "All of photosynthesis happens in the stroma.",
        },
      ],
    });
    expect(failedChecks(item)).toEqual(["enough-options", "enough-distractors"]);
  });

  it("rejects a distractor that repeats the correct answer", () => {
    const item = good();
    item.options[1]!.text = "In the thylakoid membrane, where the pigments sit.";
    expect(failedChecks(item)).toContain("distinct-options");
  });
});

describe("misconception checks", () => {
  it("rejects a distractor with no misconception behind it", () => {
    const item = good();
    delete item.options[1]!.misconception;
    expect(failedChecks(item)).toEqual(["misconception-named"]);
  });

  it("rejects a misconception too short to refute", () => {
    const item = good();
    item.options[1]!.misconception = "wrong";
    expect(failedChecks(item)).toEqual(["misconception-named"]);
  });

  it("rejects a misconception that only echoes the option text", () => {
    const item = good();
    item.options[1]!.misconception = "In the stroma, where the sugars are assembled.  ";
    expect(failedChecks(item)).toEqual(["misconception-distinct"]);
  });
});

describe("stem checks", () => {
  it("rejects a stem that points at the option list", () => {
    const item = good({
      stem: "Which of the following describes the first stage of photosynthesis?",
    });
    expect(failedChecks(item)).toContain("self-contained-stem");
  });

  it("rejects a stem that sets the scene with the answer's own clause", () => {
    const item = good({
      stem: "Given light is absorbed in the thylakoid membrane, where does stage one happen?",
    });
    expect(failedChecks(item)).toContain("no-answer-leak");
  });

  it("rejects a stem containing the whole answer verbatim", () => {
    const item = good({
      stem: "Is it in the thylakoid membrane, where the pigments sit, that stage one runs?",
    });
    expect(failedChecks(item)).toContain("no-answer-leak");
  });

  it("rejects a stem that is the answer reworded", () => {
    const item = good({
      stem: "Is the first photosynthesis stage carried out in the thylakoid?",
      options: [
        {
          id: "a",
          text: "The first photosynthesis stage is carried out in the thylakoid.",
          correct: true,
        },
        {
          id: "b",
          text: "In the stroma, where the sugars are assembled.",
          correct: false,
          misconception: "All of photosynthesis happens in the stroma.",
        },
        {
          id: "c",
          text: "In the mitochondria, alongside respiration.",
          correct: false,
          misconception: "Photosynthesis happens in the mitochondria.",
        },
      ],
    });
    expect(failedChecks(item)).toContain("no-answer-leak");
  });

  it("leaves a genuinely different question alone", () => {
    expect(
      leaksAnswer(
        "Where does stage one happen?",
        "In the thylakoid membrane, where the pigments sit.",
      ),
    ).toBe(false);
  });
});

describe("option-writing tells", () => {
  it("rejects an answer conspicuously longer than its distractors", () => {
    const item = good();
    item.options[0]!.text =
      "In the thylakoid membrane, where the pigments sit and where light is absorbed to drive the transfer chain.";
    expect(failedChecks(item)).toContain("answer-length-tell");
  });

  it("allows a longer answer inside the ratio", () => {
    const item = good();
    item.options[0]!.text =
      "In the thylakoid membrane of the chloroplast, where pigments sit.";
    expect(failedChecks(item)).not.toContain("answer-length-tell");
  });

  it("rejects all-of-the-above style options", () => {
    const item = good();
    item.options[2]!.text = "All of the above";
    expect(failedChecks(item)).toContain("no-meta-option");
  });
});

describe("refutation checks", () => {
  it("rejects a refutation missing a part", () => {
    const item = good();
    item.fallbackRefutation.wrong = "   ";
    expect(failedChecks(item)).toEqual(["refutation-shape"]);
  });

  it("rejects a refutation whose contradiction is its own correction", () => {
    const item = good();
    item.fallbackRefutation.actual = item.fallbackRefutation.wrong;
    expect(failedChecks(item)).toEqual(["refutation-shape"]);
  });
});

describe("overlap", () => {
  it("is one for the same words and zero for none shared", () => {
    expect(overlap("thylakoid membrane light", "light thylakoid membrane")).toBe(1);
    expect(overlap("thylakoid membrane", "orbital eccentricity")).toBe(0);
  });

  it("ignores the words every question shares", () => {
    expect(overlap("what is the thylakoid", "which are those chloroplasts")).toBe(0);
  });
});

describe("checkPack", () => {
  it("counts an empty pack as passing", () => {
    expect(checkPack([])).toMatchObject({ passed: 0, total: 0, passRate: 1 });
  });

  it("reports the pass rate and which check did the rejecting", () => {
    const broken = good({ id: "q-2" });
    delete broken.options[1]!.misconception;
    delete broken.options[2]!.misconception;
    const report = checkPack([good(), broken]);
    expect(report).toMatchObject({ passed: 1, total: 2, passRate: 0.5 });
    // Two options failed on one item, so the histogram still reads one item.
    expect(report.failuresByCheck).toEqual([{ check: "misconception-named", count: 1 }]);
  });

  it("names every check it knows about", () => {
    // Guards against a check being added to the rubric and left out of the report.
    expect(new Set(CHECKS).size).toBe(CHECKS.length);
  });
});

describe("the built-in packs", () => {
  // The rubric is worth nothing if the hand-written packs cannot pass it. This is
  // also what makes the eval number comparable: the same bar, human or model.
  for (const pack of PACKS) {
    it(`holds ${pack.id} to the same rubric`, () => {
      const report = checkPack(pack.items);
      expect(
        report.reports.filter((r) => !r.ok).map((r) => [r.itemId, r.failures]),
      ).toEqual([]);
      expect(report.passRate).toBe(1);
    });
  }
});
