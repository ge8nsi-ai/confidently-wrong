/**
 * The dispute gate decides whether a paid, well-formed question reaches a learner,
 * so what matters here is that it is hard to trip by accident: a malformed second
 * opinion must never throw out a good item, and a real disagreement must always
 * throw out a bad one.
 *
 * The fixture is the item that motivated the gate — a real generated question
 * whose marked answer is false, and which passes every check in lib/quality.ts.
 */

import { describe, expect, it } from "vitest";
import {
  CHALLENGE_SYSTEM_PROMPT,
  challengeUserPrompt,
  disputeReason,
  parseChallenge,
} from "./challenge";
import { checkItem } from "./quality";
import type { Item } from "./types";

/** Marked answer: "Annual compounding". It is not true; daily beats annual. */
const item: Item = {
  id: "pack-1",
  conceptId: "compounding-frequency-vs-rate",
  topic: "How often interest compounds affects growth",
  stem: "If you invest $100 at 10% annual interest, which compounding frequency yields the most after 10 years?",
  options: [
    {
      id: "a",
      text: "Monthly compounding, once a month",
      correct: false,
      misconception: "Compounding frequency has a fixed effect on growth.",
    },
    { id: "b", text: "Annual compounding, once a year", correct: true },
    {
      id: "c",
      text: "Daily compounding, once a day",
      correct: false,
      misconception: "The more often interest is added, the faster money grows.",
    },
    {
      id: "d",
      text: "Every frequency ends at the same total",
      correct: false,
      misconception: "How often interest is added makes no difference at all.",
    },
  ],
  fallbackRefutation: {
    believe: "You believe the compounding period does not change the total.",
    wrong: "At 10% for ten years, daily compounding ends about $12 above annual.",
    actual: "Interest added sooner starts earning interest itself. More periods means more of that, up to a ceiling.",
  },
};

const agreed = { answer: "b", why: "Annual compounding is the standard convention." };

describe("challengeUserPrompt", () => {
  it("shows the options exactly as the learner sees them", () => {
    const prompt = challengeUserPrompt(item);
    expect(prompt).toContain(item.stem);
    for (const option of item.options) {
      expect(prompt).toContain(`${option.id}) ${option.text}`);
    }
  });

  it("hides which option is marked correct, and the misconceptions with it", () => {
    const prompt = challengeUserPrompt(item);
    expect(prompt).not.toMatch(/correct/i);
    for (const option of item.options) {
      if (option.misconception) expect(prompt).not.toContain(option.misconception);
    }
    // The refutation would name the right answer outright.
    expect(prompt).not.toContain(item.fallbackRefutation.wrong);
  });

  it("asks for a letter and a reason, and nothing else", () => {
    expect(CHALLENGE_SYSTEM_PROMPT).toContain('{"answer":"b","why":');
    expect(CHALLENGE_SYSTEM_PROMPT).toContain('answer "none"');
  });
});

describe("parseChallenge", () => {
  it("reads a plain answer", () => {
    expect(parseChallenge(agreed, item)).toEqual({
      answer: "b",
      why: "Annual compounding is the standard convention.",
    });
  });

  it("accepts the ways a model dresses up a letter", () => {
    for (const answer of ["c", "C", " c ", "c)", "c.", "Option C", "option c"]) {
      expect(parseChallenge({ answer, why: "Daily compounding wins here." }, item)).toEqual(
        { answer: "c", why: "Daily compounding wins here." },
      );
    }
  });

  it("reads the explicit no-defensible-answer verdict", () => {
    const parsed = parseChallenge(
      { answer: "none", why: "Both b and c can be argued as written." },
      item,
    );
    expect(parsed).toEqual({ answer: null, why: "Both b and c can be argued as written." });
  });

  it("refuses a letter that is not on the paper", () => {
    expect(parseChallenge({ answer: "e", why: "None of these are right." }, item)).toBeNull();
    expect(parseChallenge({ answer: "", why: "Not sure about this one." }, item)).toBeNull();
  });

  // A bare letter is a coin toss, and the reason is what the eval report prints.
  it("refuses a vote with no reason behind it", () => {
    expect(parseChallenge({ answer: "c", why: "wrong" }, item)).toBeNull();
    expect(parseChallenge({ answer: "c", why: "   " }, item)).toBeNull();
    expect(parseChallenge({ answer: "c" }, item)).toBeNull();
  });

  it("refuses anything that is not a reply at all", () => {
    expect(parseChallenge(null, item)).toBeNull();
    expect(parseChallenge("c", item)).toBeNull();
    expect(parseChallenge({ answer: 3, why: "The third one is right." }, item)).toBeNull();
  });
});

describe("disputeReason", () => {
  it("keeps the item when the second answer matches the key", () => {
    expect(disputeReason(item, { answer: "b", why: "Annual is what the source says." })).toBeNull();
  });

  it("drops the item when the second answer is a different option", () => {
    const reason = disputeReason(item, {
      answer: "c",
      why: "More compounding periods means interest earns interest sooner.",
    });
    expect(reason).toContain("answered c, not b");
    // The reason has to name the option, or the eval report is unreadable.
    expect(reason).toContain("Daily compounding");
  });

  it("drops the item when no single answer is defensible", () => {
    const reason = disputeReason(item, {
      answer: null,
      why: "Both b and c can be argued as written.",
    });
    expect(reason).toContain("no single answer is defensible");
    expect(reason).toContain("Both b and c");
  });

  it("drops an item with no marked answer instead of trusting it", () => {
    const keyless = { ...item, options: item.options.map((o) => ({ ...o, correct: false })) };
    expect(disputeReason(keyless, agreed)).toBe("no option is marked correct");
  });

  it("catches what the form rubric cannot: this question is well-formed and false", () => {
    // If the rubric caught it, the whole gate would be unnecessary.
    expect(checkItem(item).ok).toBe(true);
    expect(
      disputeReason(item, { answer: "c", why: "Daily compounding compounds more often." }),
    ).not.toBeNull();
  });
});
