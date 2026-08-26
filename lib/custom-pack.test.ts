import { describe, expect, it } from "vitest";
import {
  assembleItem,
  clampItemCount,
  clean,
  parseGeneratedItem,
  slugify,
  trimMaterial,
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

  it("rejects an item with no usable fallback refutation", () => {
    expect(parseGeneratedItem({ ...good, fallbackRefutation: {} })).toBeNull();
    expect(parseGeneratedItem({ ...good, fallbackRefutation: undefined })).toBeNull();
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
