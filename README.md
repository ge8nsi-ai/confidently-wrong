# Confidently Wrong

**Live:** <https://confidently-wrong-fawn.vercel.app>

A study tool built on **certainty-based marking**: answer unstudied material, state your certainty, and only what you were *confidently wrong* about gets refuted.

## The five phases

**Pick** → **Probe** (answer plus certainty, no feedback) → **Reveal** (quadrants, calibration, CBM score, belief bars) → **Repair** (the confidently-wrong quadrant) → **Recheck** (reworded misses).

## Why refutation is gated

Certainty 2 or 3 *and* wrong earns a refutation; a wrong guess gets a plain correction — refuting an unheld belief only plants it. `lib/scoring.ts`.

## What it thinks you believe

Certainty is evidence, not a multiplier: each answer updates a Bayesian posterior over which misconception you hold — certain-and-wrong moves it hard, a guess barely. The next question maximises information gain. `lib/belief.ts`.

## Your own material

`/packs/new` turns a PDF or notes into 4–8 questions, each distractor a named misconception. Uploads are deleted.

`/explain` marks a spoken explanation, then quizzes the misses. `/dashboard`: weak topics, calibration, past runs.

## Question quality

`lib/quality.ts` fails a stem that leaks its answer, or a correct option that is visibly the longest. Form checks cannot see a false key, so `lib/challenge.ts` answers each question again, blind to the key; disagreement drops it. `npm run eval`: 17 kept, 46 calls, 2 disputed.

## Stack

Next.js App Router, strict TypeScript, Tailwind, Zustand + `localStorage`, Recharts, Vitest. `ministral-3b-latest` writes refutations and packs, `mistral-ocr-latest` reads PDFs, Voxtral does speech. No database; a fallback behind every AI path.

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
