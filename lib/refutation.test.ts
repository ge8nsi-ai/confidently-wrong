import { describe, expect, it } from "vitest";
import { parseRefutation, parseRefuteRequest } from "./refutation";

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
});
