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
    expect(html).toContain("bits left");
    // The point of the panel: one certain wrong answer should leave the app
    // confident the learner does *not* have this right.
    const sound = /aria-label="Has this right: (\d+) percent"/.exec(html);
    expect(Number(sound![1])).toBeLessThan(20);
  });

  it("says the learner has it right when they answered correctly", () => {
    const item = pack.items[0]!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={[item]} responses={rightAt([item], 3)} />,
    );
    expect(html).toContain("You appear to have this right.");
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

  it("puts the most uncertain concept first, since that is the one worth reading", () => {
    // Two concepts: one settled by a certain wrong answer, one left open by a guess.
    const a = pack.items[0]!;
    const b = pack.items.find((i) => i.conceptId !== a.conceptId)!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={[a, b]} responses={[...wrongAt([a], 3), ...wrongAt([b], 1)]} />,
    );
    expect(html.indexOf(topicOf(b))).toBeLessThan(html.indexOf(topicOf(a)));
  });

  it("gives every probability bar a label a screen reader can read", () => {
    const item = pack.items[0]!;
    const html = renderToStaticMarkup(
      <BeliefPanel items={[item]} responses={wrongAt([item], 2)} />,
    );
    const labels = [...html.matchAll(/aria-label="[^"]*: \d+ percent"/g)];
    expect(labels.length).toBe(item.options.length);
    expect(html).toContain('role="img"');
  });
});
