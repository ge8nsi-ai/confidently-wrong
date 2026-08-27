# Confidently Wrong

A study tool built on **certainty-based marking**. Answer on unstudied material, state your certainty, then learn which beliefs were *confidently wrong*. Those alone get refuted.

## The five phases

1. **Pick** a pack.
2. **Probe** — answer plus certainty. No feedback.
3. **Reveal** — quadrants, calibration, CBM score, belief bars.
4. **Repair** — refutations for the confidently-wrong quadrant.
5. **Recheck** — reworded misses, second curve overlaid.

## Why refutation is gated

Certainty 2 or 3 *and* wrong earns a refutation; a guessed wrong answer gets a plain correction — refuting an unheld belief only plants it. `lib/scoring.ts`, tested in `lib/store.test.ts`.

## What it thinks you believe

Certainty is evidence, not just a multiplier: each answer updates a Bayesian posterior over which misconception you hold. Wrong-and-certain moves it hard, a guess barely. It then picks the next question by expected information gain, and orders the recheck. `lib/belief.ts`.

## Your own material

`/packs/new` turns a PDF or notes into 4–8 questions, each distractor a stated misconception. Uploads are deleted.

`/explain` marks a spoken explanation: what was sound, what you left out, what was wrong — then quizzes you on those, your own wrong claims as distractors. Typing works too.

`/dashboard`: weakest topics, calibration, past runs.

## Stack

Next.js App Router, strict TypeScript, Tailwind, Zustand + `localStorage`, Recharts, Vitest. Mistral `ministral-3b-latest` writes refutations, critiques, packs; `mistral-ocr-latest` reads PDFs; Voxtral does speech. No accounts, no database, a fallback behind every AI path.

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
