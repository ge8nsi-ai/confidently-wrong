/**
 * Throwaway measurement: where do paraphrases stop and new questions start?
 *
 * Prints cosines for hand-labelled pairs of real generated stems so
 * lib/similarity.ts can carry a threshold read off data rather than guessed.
 * Not part of npm test — it spends money. The number it produced is documented
 * at the use site.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = join(import.meta.dirname, "..", file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

/** Every stem below came out of a real `npm run eval` run. */
const PAIRS = [
  // same: the pair a live pack shipped, which word overlap missed
  ["same", "Why does the Sun's gravity have a smaller tidal effect than the Moon's despite being much more massive?", "Why does the Sun's tidal force on Earth's oceans feel weaker than the Moon's even though the Sun is much bigger and closer to Earth's center?"],
  // same: the compound-interest question the generator kept re-asking
  ["same", "If you save 1000 at 5% annual return but inflation rises to 6%, how much does your savings buy in real terms after 10 years?", "If your savings grow at 4% annually but inflation rises to 5%, how much does your purchasing power shrink over 20 years?"],
  ["same", "If you save 1000 at 5% annual return but inflation rises to 6%, how much does your savings buy in real terms after 10 years?", "If you earn 4% annual salary growth but inflation rises to 5%, how much does your real income change after 5 years?"],
  ["same", "If you save 1000 at 5% annual return but inflation rises to 6%, how much does your savings buy in real terms after 10 years?", "If you earn 4% annual interest but inflation rises to 5%, how much does your money lose in purchasing power each year?"],
  ["same", "Why does Earth have two tidal bulges instead of just one?", "Why does the second tidal bulge form on the side of Earth opposite the Moon?"],
  ["same", "Why does a coastal location experience high tide every 12 hours and 25 minutes?", "Why do coastal areas experience two high tides daily rather than one?"],
  // distinct: the false positive the 0.87 threshold threw away
  ["distinct", "Why does the Sun's gravity cause weaker tides than the Moon's even though it's much more massive?", "Why does the far side of Earth's ocean bulge even though the Moon's gravity is weaker there?"],
  // distinct: same topic, different question
  ["distinct", "Why does the Sun's tidal force on Earth's oceans feel weaker than the Moon's even though the Sun is much bigger?", "Why does the second tidal bulge form on the side of Earth facing away from the Moon?"],
  ["distinct", "What causes spring tides to be larger than neap tides?", "Why does a coastal location experience high tide every 12 hours and 25 minutes?"],
  ["distinct", "If inflation is 3% yearly, how long does it take for a dollar's value to halve?", "Which compounding frequency yields the highest return after 10 years?"],
  ["distinct", "Why does a vaccinated person's adaptive immune response take hours instead of days upon re-exposure?", "Why does a vaccine produce immunity without causing the disease?"],
  ["distinct", "Why do memory B cells respond faster than naive B cells?", "Why does herd immunity protect people who were never vaccinated?"],
  // A second batch, from the run after the check went in: every pair it called a
  // reword, hand-labelled again so the threshold is swept against its own output.
  ["same", "After vaccination, memory cells respond faster than the first infection because they were produced by which phase of the immune system?", "Which immune wave produces memory cells that speed up a future response?"],
  ["same", "Why does the far side of Earth have a tidal bulge opposite the Moon's position?", "Why does the ocean on Earth's far side from the Moon bulge outward instead of inward?"],
  ["same", "Why does the far side of Earth have a tidal bulge opposite the Moon's position?", "Why does the ocean on Earth's near side bulge toward the Moon while the far side bulges away?"],
  ["same", "Why do some vaccines include adjuvants like aluminium salt?", "Why does a vaccine containing an aluminium adjuvant cause the body to react more strongly to the antigen than one without it?"],
  // These two it called rewords and they are not: one asks why a booster improves
  // antibody quality, the other why antibody quantity falls and is restored.
  ["distinct", "Why does a booster shot not just add more antibodies but also improve antibody fit?", "Which best explains why antibody levels drop after vaccination but a booster restores them?"],
  ["distinct", "After vaccination, can a person still spread the virus they're vaccinated against?", "Why would a vaccinated person's virus shedding be higher than an unvaccinated person's during a mild infection?"],
];

const texts = [...new Set(PAIRS.flatMap(([, a, b]) => [a, b]))];
const res = await fetch("https://api.mistral.ai/v1/embeddings", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
  },
  body: JSON.stringify({ model: "mistral-embed", input: texts }),
});
if (!res.ok) throw new Error(`embed ${res.status} ${await res.text()}`);
const { data } = await res.json();
const byText = new Map(texts.map((t, i) => [t, data[i].embedding]));

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
};

const scored = PAIRS.map(([label, a, b]) => ({
  label,
  sim: cosine(byText.get(a), byText.get(b)),
  a,
  b,
})).sort((x, y) => y.sim - x.sim);

for (const row of scored) {
  console.log(
    `${row.sim.toFixed(4)}  ${row.label.padEnd(8)}  ${row.a.slice(0, 48)} || ${row.b.slice(0, 48)}`,
  );
}

const same = scored.filter((r) => r.label === "same").map((r) => r.sim);
const distinct = scored.filter((r) => r.label === "distinct").map((r) => r.sim);
console.log(
  `\nsame:     min ${Math.min(...same).toFixed(4)}  max ${Math.max(...same).toFixed(4)}`,
);
console.log(
  `distinct: min ${Math.min(...distinct).toFixed(4)}  max ${Math.max(...distinct).toFixed(4)}`,
);

// The threshold that costs the fewest labelled mistakes, and what it costs.
let best = { t: 0, wrong: Infinity };
for (let t = 0.7; t <= 0.99; t += 0.005) {
  const wrong =
    same.filter((s) => s < t).length + distinct.filter((s) => s >= t).length;
  if (wrong < best.wrong) best = { t, wrong };
}
console.log(
  `best threshold ${best.t.toFixed(3)} — ${best.wrong} of ${PAIRS.length} labelled pairs wrong`,
);
