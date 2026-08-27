import { describe, expect, it } from "vitest";
import {
  MAX_TRANSCRIPT_CHARS,
  parseCritique,
  quizMaterial,
  spokenCritique,
  trimTranscript,
  type Critique,
} from "./explain";

const good = {
  topic: "How vaccines work",
  verdict: "The broad shape is right, but the timing of immunity is wrong.",
  right: ["A vaccine shows the immune system a harmless version of a pathogen."],
  gaps: ["Memory B cells are what make the second response faster."],
  errors: [
    {
      claim: "the vaccine makes you immune the moment you get the shot",
      why: "The adaptive response takes one to two weeks to build.",
      correction:
        "Protection develops over about two weeks as B and T cells proliferate.",
    },
  ],
};

describe("parseCritique", () => {
  it("keeps a well-formed critique", () => {
    const critique = parseCritique(good);
    expect(critique?.topic).toBe("How vaccines work");
    expect(critique?.right).toHaveLength(1);
    expect(critique?.errors[0]?.correction).toContain("two weeks");
  });

  it("falls back to the learner's own topic when the model omits one", () => {
    const critique = parseCritique({ ...good, topic: 42 }, "Vaccines");
    expect(critique?.topic).toBe("Vaccines");
  });

  it("rejects a critique with nothing in any bucket", () => {
    expect(parseCritique({ ...good, right: [], gaps: [], errors: [] })).toBeNull();
  });

  it("rejects a critique with no verdict", () => {
    expect(parseCritique({ ...good, verdict: "" })).toBeNull();
  });

  it("drops errors missing a correction, and the critique with them if nothing is left", () => {
    const partial = parseCritique({
      ...good,
      right: [],
      gaps: [],
      errors: [{ claim: "something wrong", why: "because it is" }],
    });
    expect(partial).toBeNull();
  });

  it("drops a correction too short to be one", () => {
    const critique = parseCritique({
      ...good,
      errors: [{ claim: "a claim", why: "a reason", correction: "No." }],
    });
    expect(critique?.errors).toHaveLength(0);
  });

  it("strips markdown the model sprinkles in", () => {
    const critique = parseCritique({
      ...good,
      verdict: "**Mostly** sound, with one timing error.",
    });
    expect(critique?.verdict).toBe("Mostly sound, with one timing error.");
  });

  it("de-duplicates repeated statements and caps each list at four", () => {
    const critique = parseCritique({
      ...good,
      gaps: ["The same omission here.", "the same omission here.", "One more thing.", "And another.", "A fifth one.", "A sixth one."],
    });
    expect(critique?.gaps).toEqual([
      "The same omission here.",
      "One more thing.",
      "And another.",
      "A fifth one.",
    ]);
  });

  it("drops entries that comment on the learner instead of the subject", () => {
    const critique = parseCritique({
      ...good,
      gaps: [
        "The learner did not mention memory B cells.",
        "You never said anything about T cells.",
        "Memory B cells make the second response faster.",
      ],
    });
    expect(critique?.gaps).toEqual([
      "Memory B cells make the second response faster.",
    ]);
  });

  it("rejects anything that is not an object", () => {
    expect(parseCritique("nope")).toBeNull();
    expect(parseCritique(null)).toBeNull();
  });
});

describe("quizMaterial", () => {
  const critique = parseCritique(good) as Critique;
  const material = quizMaterial(critique);

  it("offers corrections and gaps as the only permitted correct answers", () => {
    const facts = material.slice(
      material.indexOf("ESTABLISHED FACTS"),
      material.indexOf("MISCONCEPTIONS"),
    );
    expect(facts).toContain("Protection develops over about two weeks");
    expect(facts).toContain("Memory B cells");
    expect(facts).not.toContain("immune the moment");
  });

  it("quarantines the learner's wrong claims in the misconceptions section", () => {
    const misconceptions = material.slice(material.indexOf("MISCONCEPTIONS"));
    expect(misconceptions).toContain("immune the moment you get the shot");
    expect(misconceptions).toContain("wrong because the adaptive response takes");
  });

  it("leaves proper nouns capitalised when splicing a reason into a sentence", () => {
    const spliced = quizMaterial({
      ...critique,
      errors: [
        {
          claim: "Earth is closest to the sun in July",
          why: "Earth reaches perihelion in early January.",
          correction: "Distance barely varies and does not drive the seasons.",
        },
      ],
    });
    expect(spliced).toContain("(wrong because Earth reaches perihelion");
  });

  it("omits the misconceptions section when the learner made no errors", () => {
    const clean = quizMaterial({ ...critique, errors: [] });
    expect(clean).not.toContain("MISCONCEPTIONS");
    expect(clean).toContain("Memory B cells");
  });

  it("never leaks the raw transcript wording", () => {
    expect(material).not.toContain("THEIR EXPLANATION");
  });
});

describe("spokenCritique", () => {
  it("reads as prose with no list markers", () => {
    const spoken = spokenCritique(parseCritique(good) as Critique);
    expect(spoken).toContain("The broad shape is right");
    expect(spoken).toContain("You had this right.");
    expect(spoken).toContain("Now the errors.");
    expect(spoken).not.toContain("- ");
  });

  it("mentions only the sections that have content", () => {
    const critique = parseCritique(good) as Critique;
    const spoken = spokenCritique({ ...critique, right: [], gaps: [] });
    expect(spoken).not.toContain("You had this right.");
    expect(spoken).not.toContain("You left this out.");
  });
});

describe("trimTranscript", () => {
  it("collapses whitespace and leaves short speech alone", () => {
    expect(trimTranscript("  so   the thing is\n\nit warms up. ")).toBe(
      "so the thing is it warms up.",
    );
  });

  it("cuts a long transcript on a sentence boundary", () => {
    const long = `${"Sentence about the topic. ".repeat(400)}tail`;
    const trimmed = trimTranscript(long);
    expect(trimmed.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS);
    expect(trimmed.endsWith(".")).toBe(true);
  });
});
