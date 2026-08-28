/**
 * The per-band breakdown under the calibration chart is the only place the
 * numbers behind the curve are written out in words, and on the recheck view it
 * used to print the *probe* counts twice — the chart showed two rounds while the
 * text below described one. Rendering the component is the only way to catch
 * that; lib/scoring.test.ts proves the arithmetic, not what reaches the screen.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CalibrationChart from "./CalibrationChart";
import type { Response } from "@/lib/types";

/** `n` answers at one certainty, the first `right` of them correct. */
function answers(conf: 1 | 2 | 3, n: number, right: number, round: "probe" | "recheck"): Response[] {
  return Array.from({ length: n }, (_, i) => ({
    itemId: `${round}-${conf}-${i}`,
    chosenOptionId: "a",
    conf,
    correct: i < right,
    round,
  }));
}

/** The text a learner reads, with markup and entities out of the way. */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

describe("CalibrationChart", () => {
  const probe = [
    ...answers(1, 2, 1, "probe"), // guessing: 2 answers, 50%
    ...answers(3, 3, 1, "probe"), // certain: 3 answers, 33%
  ];

  it("writes out each certainty band of a single round", () => {
    const body = text(renderToStaticMarkup(<CalibrationChart responses={probe} />));
    expect(body).toContain("Guessing: 2 answers, 50% right");
    expect(body).toContain("Certain: 3 answers, 33% right");
    expect(body).not.toContain("→");
  });

  it("describes the recheck round too, not the first pass twice", () => {
    const recheck = [
      ...answers(1, 1, 1, "recheck"), // guessing: 1 answer, 100%
      ...answers(3, 2, 2, "recheck"), // certain: 2 answers, 100%
    ];
    const body = text(
      renderToStaticMarkup(<CalibrationChart responses={probe} after={recheck} />),
    );
    expect(body).toContain("Guessing: 2 answers, 50% right → 1 answer, 100% right");
    expect(body).toContain("Certain: 3 answers, 33% right → 2 answers, 100% right");
  });

  it("reports a band the recheck never reached as no answers, not as the probe's", () => {
    // Nothing at "fairly sure" in either round, and the certain band exists only
    // in the probe, so the recheck side of it has to read as empty.
    const recheck = answers(1, 1, 0, "recheck");
    const body = text(
      renderToStaticMarkup(<CalibrationChart responses={probe} after={recheck} />),
    );
    expect(body).toContain("Certain: 3 answers, 33% right → 0 answers");
    expect(body).not.toContain("Certain: 3 answers, 33% right → 3 answers");
  });

  it("only shows the overconfidence sentence when asked to", () => {
    const withSentence = text(renderToStaticMarkup(<CalibrationChart responses={probe} />));
    const without = text(
      renderToStaticMarkup(<CalibrationChart responses={probe} showSentence={false} />),
    );
    expect(withSentence).toMatch(/more sure than you were right|about right/i);
    expect(without).not.toMatch(/more sure than you were right/i);
  });
});
