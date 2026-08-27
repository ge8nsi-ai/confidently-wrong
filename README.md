# Confidently Wrong

**Live:** <https://confidently-wrong-fawn.vercel.app>

A study tool built on **certainty-based marking**. Answer unstudied material, state your certainty, then see which beliefs were *confidently wrong*. Those alone get refuted.

## The five phases

**Pick** a pack → **Probe** (answer plus certainty, no feedback) → **Reveal** (quadrants, calibration, CBM score, belief bars) → **Repair** (the confidently-wrong quadrant) → **Recheck** (reworded misses, second curve overlaid).

## Why refutation is gated

Certainty 2 or 3 *and* wrong earns a refutation; a guessed wrong answer gets a plain correction — refuting an unheld belief only plants it. `lib/scoring.ts`.

## What it thinks you believe

Certainty is evidence, not a multiplier: each answer updates a Bayesian posterior over which misconception you hold. Wrong-and-certain moves it hard, a guess barely; the next question is chosen by expected information gain. `lib/belief.ts`.

## Your own material

`/packs/new` turns a PDF or notes into 4–8 questions, each distractor a stated misconception. Uploads are deleted.

`/explain` marks a spoken explanation, then quizzes you on what you got wrong.

`/dashboard`: weakest topics, calibration, past runs.

## Question quality

`lib/quality.ts` fails a question whose stem leaks its answer or whose correct option is conspicuously the longest — generated or hand-written alike. `npm run eval`: 17 of 17 kept, 24 calls.

## Stack

Next.js App Router, strict TypeScript, Tailwind, Zustand + `localStorage`, Recharts, Vitest. `ministral-3b-latest` writes refutations, critiques and packs; `mistral-ocr-latest` reads PDFs; Voxtral does speech. No database; a fallback behind every AI path.

```bash
npm install
cp .env.example .env.local
npm run dev
npm test
```

## Sources

- Gardner-Medwin, A. R. — certainty-based marking, UCL; in summative medical exams since 1994.
- Butterfield, B., & Metcalfe, J. (2001) — hypercorrection.
- Richland, Kornell & Kao — the pretesting effect.
- *Educational Psychology Review* (2026), DOI 10.1007/s10648-026-10116-9 — personalised refutation can backfire.
