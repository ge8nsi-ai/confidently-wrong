import { describe, expect, it } from "vitest";
import { STYLES } from "./escalation";
import {
  REFUTE_SYSTEM_PROMPT,
  parseRefutation,
  parseRefuteRequest,
  refuteSystemPrompt,
} from "./refutation";

const good = {
  itemId: "seasons-1",
  chosenOptionId: "a",
  stem: "Why is summer hot?",
  chosenOptionText: "Earth is closer to the Sun.",
  misconception: "Seasons are caused by distance to the Sun.",
  correctOptionText: "Earth's axis is tilted.",
  fallbackRefutation: {
    believe: "You believe distance drives the seasons.",
    wrong: "Earth is closest to the Sun in January.",
    actual: "The tilt changes the angle of sunlight and the length of the day.",
  },
};

describe("parseRefutation", () => {
  it("accepts a well-formed three-field object", () => {
    expect(parseRefutation(good.fallbackRefutation)).toEqual(
      good.fallbackRefutation,
    );
  });

  it("rejects missing, empty, or non-string fields", () => {
    expect(parseRefutation(null)).toBeNull();
    expect(parseRefutation("nope")).toBeNull();
    expect(parseRefutation({ believe: "a", wrong: "b" })).toBeNull();
    expect(parseRefutation({ believe: "a", wrong: "b", actual: "   " })).toBeNull();
    expect(parseRefutation({ believe: 1, wrong: "b", actual: "c" })).toBeNull();
  });

  it("rejects absurdly long fields", () => {
    expect(
      parseRefutation({ believe: "x".repeat(5000), wrong: "b", actual: "c" }),
    ).toBeNull();
  });

  it("trims whitespace", () => {
    expect(parseRefutation({ believe: " a ", wrong: "b", actual: "c" })).toEqual({
      believe: "a",
      wrong: "b",
      actual: "c",
    });
  });
});

describe("parseRefuteRequest", () => {
  it("accepts a complete request", () => {
    expect(parseRefuteRequest(good)).toMatchObject({ itemId: "seasons-1" });
  });

  it("rejects a request missing the fallback", () => {
    const rest: Record<string, unknown> = { ...good };
    delete rest.fallbackRefutation;
    expect(parseRefuteRequest(rest)).toBeNull();
  });

  it("rejects a request missing the misconception", () => {
    expect(parseRefuteRequest({ ...good, misconception: "" })).toBeNull();
  });

  it("treats a request with no style as the first attempt", () => {
    expect(parseRefuteRequest(good)).toMatchObject({ style: "direct" });
  });

  it("keeps a style it recognises", () => {
    expect(parseRefuteRequest({ ...good, style: "contrast" })).toMatchObject({
      style: "contrast",
    });
  });

  it("falls back to the first style rather than failing on a bad one", () => {
    // A style nobody sends deliberately, so refusing the whole call would cost the
    // learner an explanation over a field that only picks the framing.
    expect(parseRefuteRequest({ ...good, style: "socratic" })).toMatchObject({
      style: "direct",
    });
    expect(parseRefuteRequest({ ...good, style: 7 })).toMatchObject({
      style: "direct",
    });
  });
});

describe("refuteSystemPrompt", () => {
  it("leaves the first attempt's prompt exactly as it was", () => {
    expect(refuteSystemPrompt("direct")).toBe(REFUTE_SYSTEM_PROMPT);
  });

  it("adds an instruction not to restate the failed correction", () => {
    const prompt = refuteSystemPrompt("contrast");
    expect(prompt.startsWith(REFUTE_SYSTEM_PROMPT)).toBe(true);
    expect(prompt).toMatch(/do not restate/);
    expect(prompt.length).toBeGreaterThan(REFUTE_SYSTEM_PROMPT.length);
  });

  it("keeps the three-field contract on every style", () => {
    for (const style of STYLES) {
      const prompt = refuteSystemPrompt(style);
      expect(prompt).toMatch(/believe:/);
      expect(prompt).toMatch(/wrong:/);
      expect(prompt).toMatch(/actual:/);
    }
  });
});
