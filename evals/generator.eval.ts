/**
 * Measures the question generator instead of trusting it.
 *
 * `npm run eval` generates a pack from each source text in evals/sources, applies
 * the rubric in lib/quality.ts to every question that survives, and prints a pass
 * rate with a breakdown of what did the rejecting. It calls a paid API, so it is
 * kept out of `npm test` — see vitest.eval.config.ts.
 *
 * The number this prints is the honest one: it is computed from the same code path
 * the app runs, with the same four gates, and the rubric is the one the hand-written
 * packs are held to in lib/quality.test.ts.
 *
 * The rubric pass rate is now the weaker of the two numbers it reports. What the
 * second opinion disputed, and what the stem embedding called a reword, are both
 * listed in full: each is a claim about two pieces of text, and only reading them
 * says whether the gate caught something or invented it.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateItems, DEFAULT_TIME_BUDGET_MS, type Rejection } from "../lib/generate";
import { checkPack } from "../lib/quality";
import { trimMaterial } from "../lib/custom-pack";
import type { Item } from "../lib/types";

const SOURCE_DIR = join(import.meta.dirname, "sources");
const REPORT = join(import.meta.dirname, "report.md");
const ITEMS_PER_SOURCE = 6;

/**
 * A regression floor, not a target.
 *
 * Set low on purpose: a small model at temperature 0.4 varies run to run, and an
 * eval that fails on ordinary variance gets ignored. This catches a broken prompt
 * or a rubric change that rejects everything.
 */
const MIN_PASS_RATE = 0.6;
const MIN_ITEMS_PER_SOURCE = 3;

/** vitest does not read .env.local, and the key must stay server-side. */
function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = join(import.meta.dirname, "..", file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, name, rawValue] = match;
      if (process.env[name!]) continue;
      process.env[name!] = rawValue!.trim().replace(/^["']|["']$/g, "");
    }
  }
}

interface SourceResult {
  name: string;
  items: Item[];
  attempts: number;
  rejections: Rejection[];
  keptDespiteRubric: number;
  repairCalls: number;
  repaired: number;
  challengeCalls: number;
  disputed: number;
  embedCalls: number;
  paraphrased: number;
  stoppedEarly: boolean;
  elapsedMs: number;
}

function histogram(values: string[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * Collapses the varying part of a reason so it histograms.
 *
 * "only 1 usable distractor" and "only 2 usable distractors" are the same fault
 * and should be counted together; a raw string histogram would split them.
 */
function shorten(reason: string): string {
  return reason
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .slice(0, 90)
    .trim();
}

/** The report is written to disk so the number can be quoted without a rerun. */
function writeReport(results: SourceResult[]): string {
  const all = results.flatMap((r) => r.items);
  const quality = checkPack(all);
  const rejections = results.flatMap((r) => r.rejections);
  const attempts = results.reduce((sum, r) => sum + r.attempts, 0);
  const repairCalls = results.reduce((sum, r) => sum + r.repairCalls, 0);
  const challengeCalls = results.reduce((sum, r) => sum + r.challengeCalls, 0);
  const disputed = results.reduce((sum, r) => sum + r.disputed, 0);
  const embedCalls = results.reduce((sum, r) => sum + r.embedCalls, 0);
  const paraphrased = results.reduce((sum, r) => sum + r.paraphrased, 0);
  const elapsed = results.reduce((sum, r) => sum + r.elapsedMs, 0);

  const lines: string[] = [
    "# Generator eval",
    "",
    `Run ${new Date().toISOString()} against \`ministral-3b-latest\`.`,
    "",
    `- Sources: ${results.length}`,
    `- Model calls: ${attempts + repairCalls + challengeCalls + embedCalls} (${attempts} question, ${repairCalls} repair, ${challengeCalls} second opinion, ${embedCalls} stem embedding)`,
    `- Questions kept: ${all.length}`,
    `- Questions passing the rubric: ${quality.passed} of ${quality.total} (**${pct(quality.passRate)}**)`,
    `- Thrown out by the second opinion: ${disputed} of ${challengeCalls} answered again`,
    `- Thrown out as a paraphrase word overlap missed: ${paraphrased} of ${embedCalls} embedded`,
    `- Rescued by a misconception repair call: ${results.reduce((s, r) => s + r.repaired, 0)} of ${repairCalls} repair calls`,
    `- Kept despite a rubric failure, to reach the pack floor: ${results.reduce((s, r) => s + r.keptDespiteRubric, 0)}`,
    `- Yield: ${pct(all.length / Math.max(1, attempts))} of calls produced a keepable question`,
    `- Packs cut short by the ${(DEFAULT_TIME_BUDGET_MS / 1000).toFixed(0)}s time budget: ${results.filter((r) => r.stoppedEarly).length} of ${results.length}`,
    `- Wall clock: ${(elapsed / 1000).toFixed(1)}s`,
    "",
    "## Where attempts were rejected",
    "",
    "| stage | count |",
    "| --- | --- |",
  ];

  for (const row of histogram(rejections.map((r) => r.stage))) {
    lines.push(`| ${row.key} | ${row.count} |`);
  }

  // Broken down by reason as well as stage: "shape, 17" says the generator is
  // leaking attempts, and only the reason says which prompt line to change.
  lines.push("", "## Why attempts were rejected", "", "| stage | reason | count |", "| --- | --- | --- |");
  const reasons = histogram(
    rejections.map((r) => `${r.stage}::${r.stage === "rubric" ? r.reason : shorten(r.reason)}`),
  );
  for (const row of reasons) {
    const [stage, reason] = row.key.split("::");
    lines.push(`| ${stage} | ${reason} | ${row.count} |`);
  }

  lines.push("", "## Which rubric check rejected an attempt", "", "| check | count |", "| --- | --- |");
  const rubricReasons = rejections
    .filter((r) => r.stage === "rubric")
    .flatMap((r) => r.reason.split(", "));
  if (rubricReasons.length === 0) {
    lines.push("| (none) | 0 |");
  } else {
    for (const row of histogram(rubricReasons)) {
      lines.push(`| ${row.key} | ${row.count} |`);
    }
  }

  // Listed in full rather than histogrammed: each dispute is its own claim about
  // the world, and reading them is the only way to tell a caught error from a
  // second opinion that was simply wrong.
  const disputes = rejections.filter((r) => r.stage === "disputed");
  if (disputes.length > 0) {
    lines.push("", "## What the second opinion disputed", "");
    for (const dispute of disputes) {
      lines.push(`- ${dispute.reason}`);
    }
  }

  // Same reasoning: a paraphrase claim names two questions, and only reading
  // both says whether they really ask the same thing.
  const paraphrases = rejections.filter((r) => r.stage === "paraphrase");
  if (paraphrases.length > 0) {
    lines.push("", "## What the stem embedding called a reword", "");
    for (const paraphrase of paraphrases) {
      lines.push(`- ${paraphrase.reason}`);
    }
  }

  lines.push("", "## Per source", "", "| source | kept | calls | passing |", "| --- | --- | --- | --- |");
  for (const result of results) {
    const own = checkPack(result.items);
    lines.push(
      `| ${result.name} | ${result.items.length} | ${result.attempts} | ${own.passed}/${own.total} |`,
    );
  }

  // Failures are listed in full: a pass rate alone does not say what to fix.
  const failing = quality.reports.filter((r) => !r.ok);
  if (failing.length > 0) {
    lines.push("", "## Questions that shipped with a rubric failure", "");
    for (const report of failing) {
      const item = all.find((i) => i.id === report.itemId)!;
      lines.push(`- \`${report.itemId}\` — ${report.failures.map((f) => f.detail).join("; ")}`);
      lines.push(`  - ${item.stem}`);
    }
  }

  const text = `${lines.join("\n")}\n`;
  writeFileSync(REPORT, text);
  return text;
}

loadEnv();

const sources = existsSync(SOURCE_DIR)
  ? readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".md"))
  : [];

describe.skipIf(!process.env.MISTRAL_API_KEY)("generator eval", () => {
  const results: SourceResult[] = [];

  for (const file of sources) {
    it(`generates a usable pack from ${file}`, async () => {
      const material = trimMaterial(
        readFileSync(join(SOURCE_DIR, file), "utf8"),
      );
      const started = Date.now();
      const outcome = await generateItems({
        material,
        count: ITEMS_PER_SOURCE,
        packId: `eval-${file.replace(/\.md$/, "")}`,
      });
      results.push({
        name: file,
        ...outcome,
        elapsedMs: Date.now() - started,
      });

      expect(outcome.items.length).toBeGreaterThanOrEqual(MIN_ITEMS_PER_SOURCE);
    });
  }

  it("reports a rubric pass rate above the regression floor", () => {
    const report = writeReport(results);
    // Printed as well as written, so the number is visible in the terminal that
    // ran it rather than only in a file.
    console.log(`\n${report}`);
    const quality = checkPack(results.flatMap((r) => r.items));
    expect(quality.total).toBeGreaterThan(0);
    expect(quality.passRate).toBeGreaterThanOrEqual(MIN_PASS_RATE);
  });
});
