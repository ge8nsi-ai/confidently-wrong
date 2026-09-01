import { describe, expect, it } from "vitest";
import { STYLES } from "./escalation";
import {
  MAX_BODY_BYTES,
  REFUTE_SYSTEM_PROMPT,
  parseRefutation,
  parseRefuteRequest,
  refuteBody,
  refuteSystemPrompt,
  refuteUserPrompt,
} from "./refutation";
import { MAX_CANDIDATES, MAX_PASSAGE_CHARS } from "./retrieval";

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

  it("says what to do with the learner's material only when there is some", () => {
    expect(refuteSystemPrompt("direct", false)).toBe(REFUTE_SYSTEM_PROMPT);
    const grounded = refuteSystemPrompt("direct", true);
    expect(grounded.startsWith(REFUTE_SYSTEM_PROMPT)).toBe(true);
    expect(grounded).toMatch(/MATERIAL/);
    // The app prints the quote itself, so a second paraphrase of it would read as a
    // second source sitting above the first.
    expect(grounded).toMatch(/Never quote it back/);
  });

  it("carries both the escalation directive and the grounding one", () => {
    const prompt = refuteSystemPrompt("contrast", true);
    expect(prompt).toMatch(/do not restate/);
    expect(prompt).toMatch(/MATERIAL/);
  });
});

describe("candidates on the wire", () => {
  it("treats a request with no candidates as a pack with no material", () => {
    expect(parseRefuteRequest(good)).toMatchObject({ candidates: [] });
    expect(parseRefuteRequest({ ...good, candidates: "notes" })).toMatchObject({
      candidates: [],
    });
  });

  it("keeps the passages it can use and drops the ones it cannot", () => {
    const parsed = parseRefuteRequest({
      ...good,
      candidates: ["Earth is closest to the Sun in early January.", 7, "  ", ""],
    });
    expect(parsed!.candidates).toEqual([
      "Earth is closest to the Sun in early January.",
    ]);
  });

  it("will not read more or longer passages than it promised to", () => {
    const parsed = parseRefuteRequest({
      ...good,
      candidates: ["x".repeat(MAX_PASSAGE_CHARS + 1), "one", "two", "three", "four"],
    });
    expect(parsed!.candidates).toHaveLength(MAX_CANDIDATES);
    expect(parsed!.candidates).not.toContain("x".repeat(MAX_PASSAGE_CHARS + 1));
  });
});

/** Notes that settle this question, with the answer split across two paragraphs. */
const NOTES = [
  "## Why the seasons happen",
  "Earth's orbit is very nearly circular, and Earth is actually closest to the Sun in early January, which is midwinter in the northern hemisphere. Distance to the Sun cannot be what drives the seasons, because the two hemispheres have opposite seasons at the same moment.",
  "The cause is the 23.4 degree tilt of Earth's axis. In the hemisphere tilted towards the Sun the light arrives closer to overhead, so the same energy falls on a smaller area, and the day is longer as well.",
].join("\n\n");

const bytesOf = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

describe("refuteUserPrompt", () => {
  const req = parseRefuteRequest(good)!;

  it("is unchanged when there is no material to work from", () => {
    expect(refuteUserPrompt(req)).toBe(refuteUserPrompt(req, null));
    expect(refuteUserPrompt(req).startsWith("Question:")).toBe(true);
  });

  it("puts the passage above the question it is there to answer", () => {
    const prompt = refuteUserPrompt(req, "Earth is closest to the Sun in January.");
    expect(prompt.startsWith("MATERIAL: Earth is closest")).toBe(true);
    expect(prompt).toContain(`Question: ${good.stem}`);
  });
});

describe("refuteBody", () => {
  const base = { ...good, style: "direct" as const };

  it("sends no passages for a pack with no material", () => {
    expect(refuteBody(base).candidates).toEqual([]);
  });

  it("finds the part of the notes that answers the belief", () => {
    const body = refuteBody({ ...base, material: NOTES });
    expect(body.candidates.join(" ")).toContain(
      "closest to the Sun in early January",
    );
  });

  it("never puts the material itself on the wire", () => {
    const body = refuteBody({ ...base, material: NOTES });
    expect(Object.keys(body)).not.toContain("material");
  });

  it("sends the passages that matter and leaves the document behind", () => {
    const filler = Array.from(
      { length: 40 },
      (_, i) =>
        `Paragraph ${i} is about the tides and the Moon, and it runs long enough to stand as a passage of its own without settling anything.`,
    ).join("\n\n");
    const body = refuteBody({ ...base, material: `${NOTES}\n\n${filler}` });
    expect(bytesOf(body)).toBeLessThanOrEqual(MAX_BODY_BYTES);
    expect(JSON.stringify(body)).not.toContain("Paragraph 7");
  });

  it("spends the shortlist rather than the cap on a maximal request", () => {
    const pad = (text: string, to: number) =>
      text.repeat(Math.ceil(to / text.length)).slice(0, to);
    const note = [
      "Earth's distance from the Sun varies by about three percent across a year, which is far too little to explain a summer.",
      "The tilt of the axis is what matters, so the angle of the light and the length of the day change along with it.",
      "The same reasoning applies in both hemispheres at once, in opposite directions.",
      "Distance would have to warm both hemispheres at the same time, and it does not.",
    ].join(" ");
    const body = refuteBody({
      ...base,
      stem: pad("Why is summer hot in the northern hemisphere? ", 600),
      chosenOptionText: pad("Earth is closer to the Sun in summer. ", 400),
      misconception: pad("Seasons are caused by distance to the Sun. ", 390),
      correctOptionText: pad("Earth's axis is tilted by 23.4 degrees. ", 390),
      fallbackRefutation: {
        believe: pad("You believe distance drives the seasons. ", 400),
        wrong: pad("Earth is closest to the Sun in January. ", 400),
        actual: pad("The tilt changes the angle of the light and the day length. ", 600),
      },
      material: [1, 2, 3].map((i) => `Point ${i}. ${note}`).join("\n\n"),
    });
    expect(bytesOf(body)).toBeLessThanOrEqual(MAX_BODY_BYTES);
    // A request this size cannot afford three passages, and the one it keeps is the
    // one the lexical pass ranked first, so the citation survives and the re-rank is
    // what gets spent.
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.candidates.length).toBeLessThan(MAX_CANDIDATES);
  });
});
