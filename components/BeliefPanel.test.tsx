/**
 * The belief panel is the only place the Bayesian model becomes visible, and it is
 * the one component that had never been rendered anywhere — the posterior was
 * proved correct in lib/belief.test.ts, but nothing checked that the numbers reach
 * the screen.
 *
 * It holds no state and calls no hooks, so `renderToStaticMarkup` exercises the real
 * render path without a DOM: what this asserts is what a learner would read.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BeliefPanel from "./BeliefPanel";
import { beliefStates } from "@/lib/belief";
import { PACKS } from "@/lib/packs";
import type { Item, Response } from "@/lib/types";

const pack = PACKS[0]!;

/**
 * The label the panel will actually print. Built-in items carry no `topic`, so it
 * is derived from the conceptId — asking the model layer for it keeps this test
 * from asserting a label the panel never shows.
 */
function topicOf(item: Item): string {
  return beliefStates([item], [])[0]!.topic;
}

/** React escapes quotes in static markup, so expected text has to match that. */
function escaped(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
}

/** Answers the given items, taking a wrong option at the stated certainty. */
function wrongAt(items: Item[], conf: 1 | 2 | 3): Response[] {
  return items.map((item) => ({
    itemId: item.id,
    chosenOptionId: item.options.find((o) => !o.correct)!.id,
    conf,
    correct: false,
    round: "probe" as const,
  }));
}

function rightAt(items: Item[], conf: 1 | 2 | 3): Response[] {
  return items.map((item) => ({
    itemId: item.id,
    chosenOptionId: item.options.find((o) => o.correct)!.id,
    conf,
    correct: true,
    round: "probe" as const,
  }));
}

describe("BeliefPanel", () => {
  it("renders nothing before any question has been answered", () => {
    expect(renderToStaticMarkup(<BeliefPanel items={pack.items} responses={[]} />)).toBe("");
  });

  it("names the belief behind a confidently wrong answer", () => {
    const item = pack.items[0]!;
    const wrong = item.options.find((o) => !o.correct)!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={[item]} responses={wrongAt([item], 3)} />,
    );
    expect(html).toContain(topicOf(item));
    expect(html).toContain(escaped(wrong.misconception!));
    expect(html).toContain("from 1 answer");
    expect(html).toContain("You seem to believe:");
    // The point of the panel: one certain wrong answer should leave the app
    // confident the learner does *not* have this right. Either the sound bar is
    // drawn low, or it fell under the 5% floor and is counted in the line below.
    const sound = /aria-label="You understand it: (\d+) percent"/.exec(html);
    if (sound) expect(Number(sound[1])).toBeLessThan(20);
    else expect(html).toContain("below 5%");
  });

  it("says the learner has it right when they answered correctly", () => {
    const item = pack.items[0]!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={[item]} responses={rightAt([item], 3)} />,
    );
    expect(html).toContain("This one looks sound.");
  });

  it("shows only the concepts that were actually asked about", () => {
    const asked = pack.items[0]!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={pack.items} responses={wrongAt([asked], 2)} />,
    );
    expect(html).toContain(topicOf(asked));
    for (const other of pack.items) {
      if (other.conceptId === asked.conceptId) continue;
      expect(html).not.toContain(`>${topicOf(other)}<`);
    }
  });

  it("leads with a named misconception, not with the concept it knows least about", () => {
    // Two concepts: one where a certain wrong answer named a belief, one left open
    // by a guess. Ordering by entropy put the guess first, which is the card with
    // the least in it.
    const a = pack.items[0]!;
    const b = pack.items.find((i) => i.conceptId !== a.conceptId)!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={[a, b]} responses={[...wrongAt([a], 3), ...wrongAt([b], 1)]} />,
    );
    expect(html.indexOf(topicOf(a))).toBeLessThan(html.indexOf(topicOf(b)));
  });

  it("says so rather than asserting a belief when one guess is all it has", () => {
    const item = pack.items[0]!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={[item]} responses={wrongAt([item], 1)} />,
    );
    expect(html).toContain("Not enough answers here to say yet.");
  });

  it("gives every probability bar a label a screen reader can read", () => {
    const item = pack.items[0]!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={[item]} responses={wrongAt([item], 2)} />,
    );
    const labels = [...html.matchAll(/aria-label="[^"]*: \d+ percent"/g)];
    const bars = [...html.matchAll(/role="img"/g)];
    expect(labels.length).toBe(bars.length);
    expect(labels.length).toBeGreaterThan(0);
    // Anything under 5% is summarised in a line instead of drawn as an empty bar.
    expect(labels.length).toBeLessThanOrEqual(item.options.length);
  });
});
