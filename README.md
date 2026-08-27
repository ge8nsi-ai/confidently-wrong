# Confidently Wrong

**Live:** <https://confidently-wrong-fawn.vercel.app>

Answer unstudied material, state your certainty; only what you were *confidently wrong* about gets refuted. **Certainty-based marking**.

## The five phases

**Pick** → **Probe** (certainty, no feedback) → **Reveal** (quadrants, calibration, CBM score) → **Repair** (the confidently-wrong quadrant) → **Recheck** (reworded misses).

## Why refutation is gated

Certainty 2 or 3 *and* wrong earns a refutation; a guess gets a plain correction — refuting an unheld belief plants it. `lib/scoring.ts`.

## What it thinks you believe

Certainty is evidence, not a multiplier: each answer updates a posterior over which misconception you hold — certain-and-wrong moves it hard, a guess barely. The next question maximises information gain. `lib/belief.ts`.

## Your own material

`/packs/new` turns a PDF or notes into 4–8 questions, every distractor a named misconception; uploads deleted.

`/explain` marks a spoken explanation, then quizzes the misses. `/dashboard`: weak topics, calibration, runs.

## Question quality

`lib/quality.ts` fails a stem that leaks its answer, or a visibly longest correct option. Form checks cannot see a false key, so `lib/challenge.ts` answers each question again, blind to it. Word overlap cannot see a reworded question, so `lib/similarity.ts` compares stem embeddings, at a threshold swept over 18 labelled pairs. `npm run eval`: 16 kept of 36, 10 dropped as repeats.

## Stack

Next.js App Router, strict TypeScript, Tailwind, Zustand + `localStorage`, Recharts, Vitest. `ministral-3b-latest` writes refutations and packs, `mistral-ocr-latest` reads PDFs, Voxtral does speech. No database; every AI path has a fallback.

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
