import { describe, expect, it } from "vitest";
import {
  applyMisconceptions,
  assembleItem,
  clampItemCount,
  clean,
  clipLabel,
  condense,
  generateUserPrompt,
  isNearDuplicateStem,
  parseFocusList,
  parseGeneratedItem,
  parseMisconceptionList,
  repairTarget,
  repairUserPrompt,
  slugify,
  trimMaterial,
  validateGeneratedItem,
  MAX_MATERIAL_CHARS,
} from "./custom-pack";

const good = {
  conceptId: "light-reactions",
  topic: "Light reactions",
  stem: "Where do the light reactions of photosynthesis happen?",
  correct: "In the thylakoid membrane",
  distractors: [
    { text: "In the stroma", misconception: "All of photosynthesis happens in the stroma." },
    { text: "In the mitochondria", misconception: "Photosynthesis happens in mitochondria." },
    { text: "In the cell wall", misconception: "The cell wall carries out photosynthesis." },
  ],
  fallbackRefutation: {
    believe: "You believe the light reactions happen in the stroma.",
    wrong: "The stroma is where the Calvin cycle runs, not the light reactions.",
    actual: "The light reactions run in the thylakoid membrane and make ATP and NADPH.",
  },
};

describe("clean", () => {
  it("strips markdown, collapses whitespace, and trims", () => {
    expect(clean("  **bold**  and\n\ntext ", 100)).toBe("bold and text");
  });

  it("rejects non-strings, empties, and overlong values", () => {
    expect(clean(7, 100)).toBeNull();
    expect(clean("   ", 100)).toBeNull();
    expect(clean("x".repeat(101), 100)).toBeNull();
  });
});

describe("parseGeneratedItem", () => {
  it("accepts a well-formed item", () => {
    const parsed = parseGeneratedItem(good)!;
    expect(parsed.topic).toBe("Light reactions");
    expect(parsed.distractors).toHaveLength(3);
  });

  it("derives a slug when conceptId is missing or junk", () => {
    expect(parseGeneratedItem({ ...good, conceptId: "" })!.conceptId).toBe(
      "light-reactions",
    );
    expect(parseGeneratedItem({ ...good, conceptId: "Light Reactions!!" })!.conceptId).toBe(
      "light-reactions",
    );
  });

  it("drops a distractor that repeats the correct answer", () => {
    const parsed = parseGeneratedItem({
      ...good,
      distractors: [
        { text: "In the thylakoid membrane", misconception: "Same as the answer." },
        ...good.distractors.slice(0, 2),
      ],
    })!;
    expect(parsed.distractors).toHaveLength(2);
    expect(parsed.distractors.map((d) => d.text)).not.toContain(
      "In the thylakoid membrane",
    );
  });

  it("rejects an item with fewer than two usable distractors", () => {
    expect(
      parseGeneratedItem({ ...good, distractors: [good.distractors[0]] }),
    ).toBeNull();
  });

  it("rejects a distractor with no named misconception", () => {
    const parsed = parseGeneratedItem({
      ...good,
      distractors: [
        { text: "In the stroma" },
        ...good.distractors.slice(1),
      ],
    })!;
    expect(parsed.distractors).toHaveLength(2);
  });

  it("derives the fallback refutation when the model omits it", () => {
    // The refutation is a standby the repair round rarely reaches, so it is
    // derived from the first distractor rather than costing a paid question.
    const parsed = parseGeneratedItem({ ...good, fallbackRefutation: {} })!;
    expect(parsed.fallbackRefutation.believe).toContain(
      "All of photosynthesis happens in the stroma.",
    );
    expect(parsed.fallbackRefutation.actual).toBe("In the thylakoid membrane");
    expect(parseGeneratedItem({ ...good, fallbackRefutation: undefined })).not.toBeNull();
  });

  it("names the reason an item was thrown away", () => {
    const reasonFor = (patch: Record<string, unknown>) => {
      const result = validateGeneratedItem({ ...good, ...patch });
      return result.ok ? "accepted" : result.reason;
    };
    expect(reasonFor({ stem: "" })).toBe("unusable stem");
    expect(reasonFor({ correct: 42 })).toBe("unusable correct answer");
    expect(reasonFor({ distractors: "three of them" })).toBe("distractors missing");
    expect(reasonFor({ distractors: [good.distractors[0]] })).toBe(
      "only 1 usable distractor",
    );
    expect(reasonFor({})).toBe("accepted");
  });

  it("keeps a verbose item by cutting the answer back to a whole sentence", () => {
    const correct =
      "The light reactions run in the thylakoid membrane. They split water and build the ATP and NADPH that the Calvin cycle later spends, which is why a chloroplast needs both compartments to do the job at all and cannot manage with only one of them.";
    const parsed = parseGeneratedItem({ ...good, correct })!;
    expect(parsed.correct).toBe(
      "The light reactions run in the thylakoid membrane.",
    );
  });

  it("shortens an overlong topic label instead of dropping the item", () => {
    const parsed = parseGeneratedItem({
      ...good,
      topic:
        "How the axial tilt of the Earth influences seasonal temperatures across both hemispheres",
    })!;
    expect(parsed.topic.length).toBeLessThanOrEqual(72);
    expect(parsed.topic.startsWith("How the axial tilt")).toBe(true);
  });

  it("rejects junk", () => {
    expect(parseGeneratedItem(null)).toBeNull();
    expect(parseGeneratedItem("nope")).toBeNull();
    expect(parseGeneratedItem({ ...good, stem: "" })).toBeNull();
  });
});

describe("assembleItem", () => {
  it("produces exactly one correct option with misconceptions only on the wrong ones", () => {
    const item = assembleItem(parseGeneratedItem(good)!, "custom-x", 0);
    expect(item.options.filter((o) => o.correct)).toHaveLength(1);
    for (const option of item.options) {
      if (option.correct) expect(option.misconception).toBeUndefined();
      else expect(option.misconception!.length).toBeGreaterThan(10);
    }
  });

  it("gives every option a distinct id and the item a pack-scoped id", () => {
    const item = assembleItem(parseGeneratedItem(good)!, "custom-x", 2);
    expect(item.id).toBe("custom-x-3");
    expect(new Set(item.options.map((o) => o.id)).size).toBe(item.options.length);
    expect(item.options.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("moves the correct answer around instead of always placing it first", () => {
    const generated = parseGeneratedItem(good)!;
    const positions = [0, 1, 2, 3].map(
      (i) => assembleItem(generated, "custom-x", i).options.findIndex((o) => o.correct),
    );
    expect(new Set(positions).size).toBeGreaterThan(1);
  });

  it("carries the topic through for the dashboard", () => {
    const item = assembleItem(parseGeneratedItem(good)!, "custom-x", 0);
    expect(item.topic).toBe("Light reactions");
    expect(item.conceptId).toBe("light-reactions");
  });
});

describe("condense", () => {
  it("leaves a value inside the budget alone", () => {
    expect(condense("Short enough.", 100)).toBe("Short enough.");
  });

  it("cuts an overlong value back to its last whole sentence", () => {
    const text =
      "The axial tilt is 23.5 degrees. It decides how sunlight lands on each hemisphere. This third sentence is surplus.";
    expect(condense(text, 70)).toBe("The axial tilt is 23.5 degrees.");
  });

  it("refuses a run-on with no sentence break to cut on", () => {
    expect(condense("word ".repeat(60), 100)).toBeNull();
  });

  it("rejects non-strings and empties like clean does", () => {
    expect(condense(7, 100)).toBeNull();
    expect(condense("  ", 100)).toBeNull();
  });
});

describe("clipLabel", () => {
  it("trims a long label on a word boundary without trailing punctuation", () => {
    expect(
      clipLabel("How Earth's axial tilt influences seasonal temperatures", 30),
    ).toBe("How Earth's axial tilt");
  });

  it("leaves a short label alone", () => {
    expect(clipLabel("Light reactions", 30)).toBe("Light reactions");
  });
});

describe("input guards", () => {
  it("clamps the question count into range", () => {
    expect(clampItemCount(1)).toBe(4);
    expect(clampItemCount(6)).toBe(6);
    expect(clampItemCount(99)).toBe(8);
    expect(clampItemCount("nonsense")).toBe(6);
  });

  it("truncates material to the model budget", () => {
    const long = "para\n\n".repeat(6_000);
    expect(trimMaterial(long).length).toBeLessThanOrEqual(MAX_MATERIAL_CHARS);
    expect(trimMaterial("  spaced\r\n\n\n\nout  ")).toBe("spaced\n\nout");
  });

  it("slugifies titles and falls back when nothing survives", () => {
    expect(slugify("How Summers Work!", "pack")).toBe("how-summers-work");
    expect(slugify("!!!", "pack")).toBe("pack");
  });
});

describe("isNearDuplicateStem", () => {
  const asked = [
    "Why is the Northern Hemisphere warmer in July than in January?",
  ];


  it("catches the same question asked in different words", () => {
    expect(
      isNearDuplicateStem(
        "Why does the Northern Hemisphere have warmer weather in July than January?",
        asked,
      ),
    ).toBe(true);
  });

  it("lets a genuinely different question through", () => {
    expect(
      isNearDuplicateStem(
        "Where does the oxygen released by photosynthesis come from?",
        asked,
      ),
    ).toBe(false);
  });

  it("shared question words alone are not a duplicate", () => {
    expect(
      isNearDuplicateStem("What is the role of RuBisCO in the Calvin cycle?", [
        "What is the function of chlorophyll in a leaf?",
      ]),
    ).toBe(false);
  });

  it("finds nothing to duplicate in an empty history", () => {
    expect(isNearDuplicateStem("Any question at all?", [])).toBe(false);
  });
});

describe("focus points", () => {
  it("names the point to build the question around when one is given", () => {
    const prompt = generateUserPrompt("MATERIAL BODY", 2, 5, ["Tilt"], "Perihelion is in January.");
    expect(prompt).toContain("Write question 2 of 5");
    expect(prompt).toContain("Base this question on this specific point: Perihelion is in January.");
  });

  it("leaves the prompt as it was when no point is given", () => {
    expect(generateUserPrompt("MATERIAL BODY", 1, 4, [])).not.toContain(
      "Base this question",
    );
  });

  it("cleans the focus list and caps it at the maximum pack size", () => {
    const focus = parseFocusList([
      "  A **point** worth asking about  ",
      "short",
      42,
      ...Array.from({ length: 12 }, (_, i) => `Another point number ${i}`),
    ]);
    expect(focus[0]).toBe("A point worth asking about");
    expect(focus).not.toContain("short");
    expect(focus).toHaveLength(8);
  });

  it("ignores a focus field that is not a list", () => {
    expect(parseFocusList("not a list")).toEqual([]);
  });
});

/**
 * The repair round exists because of one measured failure, not a hypothetical one:
 * `ministral-3b-latest` returns three good wrong answers with no `misconception`
 * key on any of them in roughly two replies out of three.
 */
describe("misconception repair", () => {
  const stripped = {
    ...good,
    distractors: good.distractors.map((d) => ({ text: d.text })),
  };

  it("targets the distractors that came back without a misconception", () => {
    const target = repairTarget(stripped);
    expect(target).not.toBeNull();
    expect(target!.stem).toBe(good.stem);
    expect(target!.correct).toBe(good.correct);
    expect(target!.texts).toEqual(["In the stroma", "In the mitochondria", "In the cell wall"]);
  });

  it("leaves out the distractors that already named one", () => {
    const target = repairTarget({
      ...good,
      distractors: [good.distractors[0], { text: "In the cell wall" }],
    });
    expect(target!.texts).toEqual(["In the cell wall"]);
  });

  it("declines to spend a call when nothing is missing", () => {
    expect(repairTarget(good)).toBeNull();
  });

  it("declines to spend a call on a reply with no usable question", () => {
    expect(repairTarget({ ...stripped, stem: "" })).toBeNull();
    expect(repairTarget({ ...stripped, distractors: "three of them" })).toBeNull();
    expect(repairTarget(null)).toBeNull();
  });

  it("numbers the wrong answers in the prompt so the reply can be matched by order", () => {
    const prompt = repairUserPrompt(repairTarget(stripped)!);
    expect(prompt).toContain("1. In the stroma");
    expect(prompt).toContain("3. In the cell wall");
    expect(prompt).toContain("Write 3 misconceptions");
  });

  it("accepts a reply with one usable belief per wrong answer", () => {
    const filled = parseMisconceptionList(
      { misconceptions: ["  All of it happens in the **stroma**.  ", "Plants respire, not photosynthesise."] },
      2,
    );
    expect(filled).toEqual([
      "All of it happens in the stroma.",
      "Plants respire, not photosynthesise.",
    ]);
  });

  it("rejects a short reply rather than filling some slots and not others", () => {
    expect(parseMisconceptionList({ misconceptions: ["Only one belief here."] }, 3)).toBeNull();
    expect(parseMisconceptionList({ misconceptions: ["A belief.", "short"] }, 2)).toBeNull();
    expect(parseMisconceptionList({ misconceptions: "not a list" }, 1)).toBeNull();
    expect(parseMisconceptionList(null, 1)).toBeNull();
  });

  it("fills the repaired beliefs in by option text, not by position", () => {
    const patched = applyMisconceptions(
      stripped,
      new Map([
        ["in the cell wall", "The cell wall carries out photosynthesis."],
        ["in the stroma", "All of photosynthesis happens in the stroma."],
        ["in the mitochondria", "Photosynthesis happens in mitochondria."],
      ]),
    );
    const result = validateGeneratedItem(patched);
    expect(result.ok).toBe(true);
    expect(result.ok && result.item.distractors).toEqual([
      { text: "In the stroma", misconception: "All of photosynthesis happens in the stroma." },
      { text: "In the mitochondria", misconception: "Photosynthesis happens in mitochondria." },
      { text: "In the cell wall", misconception: "The cell wall carries out photosynthesis." },
    ]);
  });

  it("never overwrites a misconception the model did supply", () => {
    const patched = applyMisconceptions(
      good,
      new Map([["in the stroma", "A belief the repair round invented."]]),
    ) as typeof good;
    expect(patched.distractors[0]!.misconception).toBe(good.distractors[0]!.misconception);
  });

  it("is the difference between a kept item and a thrown-away one", () => {
    expect(validateGeneratedItem(stripped)).toEqual({
      ok: false,
      reason: "only 0 usable distractors (unusable misconception)",
    });
  });
});
