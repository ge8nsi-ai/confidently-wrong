/**
 * The citation gate is the only check that can see a question whose premise the
 * source never states, so the case that matters most here is the real one it was
 * built for: a generated item about tides asserting a 50-minute daily shift, run
 * against the actual evals/sources/tides.md the item was generated from.
 *
 * The rest guards the two ways a gate like this fails in production. It must not
 * accept a fabricated quote — that would make it theatre — and it must not throw
 * out a good question because a call failed, because a check that discards work
 * on its own malfunction is worse than no check. The second of those is why two
 * cases below assert that an item is *kept*: a reply too thin to show or long
 * enough to be a paste is the model failing to locate a span, and says nothing
 * about whether the source contains one.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_QUOTE_WORDS,
  isHypothetical,
  numberFailure,
  parseGrounding,
  sharedContentWords,
  sourceNoteFrom,
  spanCoverage,
  unitBearingNumbers,
  unsupportedNumbers,
  verifyGrounding,
  wordsOf,
} from "./grounding";
import type { Item } from "./types";

const TIDES = readFileSync(
  join(import.meta.dirname, "..", "evals", "sources", "tides.md"),
  "utf8",
);

/** An item asserting `stem`, with `answer` marked correct. */
function item(stem: string, answer: string): Item {
  return {
    id: "eval-tides-1",
    conceptId: "tidal-period",
    topic: "Why high tide drifts later",
    stem,
    options: [
      { id: "a", text: answer, correct: true },
      {
        id: "b",
        text: "The Moon's pull weakens over the day",
        correct: false,
        misconception: "Tides track the strength of the pull, not its difference.",
      },
    ],
    fallbackRefutation: {
      believe: "You believe the shift is caused by something else.",
      wrong: "That is not what the material says.",
      actual: "The Earth has to turn further to catch up with the Moon.",
    },
  };
}

/**
 * The item that motivated the file. Every earlier gate passed it: one correct
 * option, no answer leak, no length tell, and a second opinion that agreed with
 * the key — because the key reasons soundly from a premise nobody had checked.
 */
const FALSE_PREMISE = item(
  "Why does high tide arrive about 50 minutes later each day?",
  "The Moon moves along its orbit, so the Earth must turn further to catch up.",
);

/** The same question with the figure the source actually states. */
const TRUE_PREMISE = item(
  "Why does a coast pass a high tide every 12 hours and 25 minutes rather than every 12 hours?",
  "The Moon moves along its orbit, so the Earth must turn further to catch up.",
);

describe("wordsOf", () => {
  it("keeps a decimal whole rather than splitting it in two", () => {
    expect(wordsOf("12.5 metres")).toEqual(["12.5", "metres"]);
  });

  it("folds curly quotes, dashes and thousands separators", () => {
    expect(wordsOf("12,700 kilometres — the Moon’s pull")).toEqual([
      "12700",
      "kilometres",
      "the",
      "moon's",
      "pull",
    ]);
  });
});

describe("unitBearingNumbers", () => {
  it("finds a number whose unit follows it", () => {
    expect(unitBearingNumbers("about 50 minutes later")).toEqual([
      { value: "50", unit: "minutes" },
    ]);
  });

  it("finds both halves of a compound duration", () => {
    expect(unitBearingNumbers("every 12 hours and 25 minutes")).toEqual([
      { value: "12", unit: "hours" },
      { value: "25", unit: "minutes" },
    ]);
  });

  it("reaches past one adjective but not past another number", () => {
    expect(unitBearingNumbers("23 whole degrees")).toEqual([
      { value: "23", unit: "degrees" },
    ]);
    expect(unitBearingNumbers("chapter 4 covers 15 metres")).toEqual([
      { value: "15", unit: "metres" },
    ]);
  });

  it("ignores numbers with no physical unit at all", () => {
    expect(unitBearingNumbers("about 45 per cent of the Moon's")).toEqual([]);
    expect(unitBearingNumbers("10% a year for 30 years")).toEqual([]);
  });
});

describe("unsupportedNumbers", () => {
  it("catches the figure the tides source never states", () => {
    expect(unsupportedNumbers("high tide arrives 50 minutes later", TIDES)).toEqual([
      "50 minutes",
    ]);
  });

  it("accepts a figure the source states, in either notation", () => {
    expect(unsupportedNumbers("12 hours and 25 minutes apart", TIDES)).toEqual([]);
    expect(unsupportedNumbers("a range of over 15 metres", TIDES)).toEqual([]);
  });

  it("accepts a number the source spells out", () => {
    expect(unsupportedNumbers("two high tides", "There are two high tides a day.")).toEqual(
      [],
    );
    expect(unsupportedNumbers("2 hours", "It takes two hours.")).toEqual([]);
  });
});

describe("spanCoverage", () => {
  it("is 1 for a span copied out of the material", () => {
    expect(
      spanCoverage("a given coast passes a high tide roughly every 12 hours", TIDES),
    ).toBe(1);
  });

  it("survives a dropped article and a folded dash", () => {
    expect(
      spanCoverage("near side of Earth is about 12,700 kilometres closer", TIDES),
    ).toBeGreaterThan(0.85);
  });

  it("is low for a span that was invented", () => {
    expect(
      spanCoverage(
        "the tidal bulge sweeps westward at fifty minutes per rotation",
        TIDES,
      ),
    ).toBeLessThan(0.85);
  });

  it("does not credit words scattered across the whole document", () => {
    // Every one of these words is somewhere in the source; none of them are
    // together, so a check that ignored the window would pass this.
    expect(
      spanCoverage("Mediterranean spring neap Fundy bulges cube massive", TIDES),
    ).toBeLessThan(0.85);
  });
});

describe("sharedContentWords", () => {
  it("counts subjects, not connectives", () => {
    expect(
      sharedContentWords(
        "Because the Earth rotates through both bulges",
        "Which of these explains the two bulges, and what about the Earth?",
      ),
    ).toBe(2);
  });

  it("counts a plural and a possessive as the word they are", () => {
    expect(sharedContentWords("two high tides a day", "the tide arrives late")).toBe(1);
    expect(sharedContentWords("the Moon's orbit", "the Moon has moved")).toBe(1);
  });

  it("finds nothing in common with an unrelated span", () => {
    expect(
      sharedContentWords(
        "a funnel-shaped bay concentrates the incoming water",
        "How much of the Moon's tidal effect does the Sun manage?",
      ),
    ).toBe(0);
  });
});

describe("isHypothetical", () => {
  it("marks a question whose numbers are its own terms", () => {
    expect(isHypothetical("If a car travels 60 km/h for two hours, how far?")).toBe(true);
    expect(isHypothetical("Suppose the tide range were 30 metres.")).toBe(true);
  });

  it("does not mark a plain claim about the material", () => {
    expect(isHypothetical("Why does high tide arrive 50 minutes later each day?")).toBe(
      false,
    );
  });
});

describe("parseGrounding", () => {
  it("reads a quote and collapses its whitespace", () => {
    expect(parseGrounding({ quote: "two  tidal\nbulges" })).toEqual({
      quote: "two tidal bulges",
    });
  });

  it("keeps an empty quote, which is the model saying nothing settles it", () => {
    expect(parseGrounding({ quote: "" })).toEqual({ quote: "" });
  });

  it("returns null for a reply that is not a quote at all", () => {
    expect(parseGrounding({ answer: "b" })).toBeNull();
    expect(parseGrounding("the source says so")).toBeNull();
    expect(parseGrounding(null)).toBeNull();
  });
});

describe("verifyGrounding", () => {
  it("rejects the tides item before any reply is even needed", () => {
    const verdict = verifyGrounding(FALSE_PREMISE, TIDES, null);
    expect(verdict.failure).toContain("50 minutes");
    expect(verdict.quote).toBeNull();
  });

  it("keeps an item whose span really is in the material", () => {
    const verdict = verifyGrounding(TRUE_PREMISE, TIDES, {
      quote:
        "a given coast passes a high tide roughly every 12 hours and 25 minutes",
    });
    expect(verdict.failure).toBeNull();
    expect(verdict.quote).toContain("12 hours and 25 minutes");
  });

  it("rejects a fabricated quote, however plausible it reads", () => {
    const verdict = verifyGrounding(TRUE_PREMISE, TIDES, {
      quote:
        "the lunar day is fifty minutes longer than the solar day, which is why each tide runs late",
    });
    expect(verdict.failure).toContain("not in the source");
  });

  it("rejects the model's own report that nothing settles it", () => {
    const verdict = verifyGrounding(TRUE_PREMISE, TIDES, { quote: "" });
    expect(verdict.failure).toBe("no span of the source settles it");
  });

  it("keeps an item whose span was too short to show", () => {
    // Verbatim from the source, and it supports every possible answer equally, so
    // it cannot be the line the learner is shown. That is a fault of the reply,
    // not of the question: the item ships, without a citation.
    const verdict = verifyGrounding(TRUE_PREMISE, TIDES, { quote: "the Moon" });
    expect(verdict.failure).toBeNull();
    expect(verdict.quote).toBeNull();
    expect(verdict.unusable).toContain("too short");
  });

  it("keeps an item whose reply pasted the whole document", () => {
    // The case this split was built for. A real eval run threw out a tides
    // question about the Sun's 45 per cent — a figure the source states outright —
    // because the reply pasted 78 words instead of locating one sentence. A paste
    // is the model failing to find the span, not the source failing to contain it.
    const verdict = verifyGrounding(TRUE_PREMISE, TIDES, {
      quote: wordsOf(TIDES).slice(0, MAX_QUOTE_WORDS + 5).join(" "),
    });
    expect(verdict.failure).toBeNull();
    expect(verdict.unusable).toContain("paste");
  });

  it("rejects a real span from an unrelated paragraph", () => {
    // A floor, not a semantic judgement. This span is verbatim and would clear the
    // coverage check outright; it has nothing to do with why a tide runs late. A
    // span about a neighbouring subject in the same document would share a word
    // and pass, which is why this is the least of the five checks rather than the
    // one carrying the load.
    const verdict = verifyGrounding(TRUE_PREMISE, TIDES, {
      quote:
        "A funnel-shaped bay such as the Bay of Fundy concentrates the incoming water into a range of over 15 metres",
    });
    expect(verdict.failure).toContain("about something else");
  });

  it("does not call a real citation unrelated over a plural", () => {
    // The pairing that brought MIN_SHARED_CONTENT_WORDS down from two: the span
    // is exactly the sentence that settles the question, and the question is
    // worded to avoid giving the answer away, so they share almost nothing.
    const bulges = item(
      "Why are there two tidal bulges rather than one?",
      "The Moon's pull differs across the width of the Earth, so water at both ends is left behind.",
    );
    const verdict = verifyGrounding(bulges, TIDES, {
      quote:
        "That is why there are two bulges, and why most coastlines see two high tides a day rather than one",
    });
    expect(verdict.failure).toBeNull();
  });

  it("leaves a good item alone when the call itself failed", () => {
    // null is an unparseable reply, not a verdict. The gate discards work, so it
    // must not discard on its own malfunction.
    expect(verifyGrounding(TRUE_PREMISE, TIDES, null)).toEqual({
      failure: null,
      quote: null,
      unusable: null,
    });
  });

  it("does not hold a hypothetical's own terms against it", () => {
    const arithmetic = item(
      "If a bay's tidal range were 30 metres, how much higher than the open ocean would that be?",
      "About 29 metres higher, since the open-ocean bulge is under a metre.",
    );
    expect(numberFailure(arithmetic, TIDES)).toBeNull();
    // The span check still has to pass, so the item is not waved through.
    expect(verifyGrounding(arithmetic, TIDES, { quote: "" }).failure).not.toBeNull();
  });
});

describe("sourceNoteFrom", () => {
  it("attributes the span to the learner's own material", () => {
    expect(sourceNoteFrom("the open-ocean tidal bulge itself is under a metre high,")).toBe(
      "From your material: “the open-ocean tidal bulge itself is under a metre high”",
    );
  });
});
