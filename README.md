<div align="center">

# Confidently Wrong

**Study the things you're _sure_ about.**

[**Live app**](https://confidently-wrong-fawn.vercel.app) · [Accessibility](docs/accessibility.md) · [Performance](docs/performance.md) · [Failure modes](docs/failure-modes.md)

![Next.js](https://img.shields.io/badge/Next.js-App_Router-000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Mistral](https://img.shields.io/badge/Mistral-Ministral_3B_·_Voxtral-fa520f)
![Tests](https://img.shields.io/badge/tests-408_passing-2e7d5b)
![axe](https://img.shields.io/badge/axe-0_violations_in_22_scans-2e7d5b)
![Lighthouse](https://img.shields.io/badge/Lighthouse_a11y-100-2e7d5b)
![License](https://img.shields.io/badge/license-MIT-777)

<img src="docs/shots/home.jpg" alt="Home screen" width="820">

</div>

Answer unstudied material, state your certainty; only what you were _confidently wrong_ about gets refuted. **Certainty-based marking.**

## The five phases

| Probe | Reveal | Repair | Recheck |
| :--: | :--: | :--: | :--: |
| <img src="docs/shots/probe.jpg" width="210" alt="Probe"> | <img src="docs/shots/reveal.jpg" width="210" alt="Reveal"> | <img src="docs/shots/repair.jpg" width="210" alt="Repair"> | <img src="docs/shots/recheck.jpg" width="210" alt="Recheck"> |
| certainty, no feedback | quadrants, calibration, CBM | the confidently-wrong quadrant | reworded misses |

## Why refutation is gated

Certainty 2 or 3 _and_ wrong earns a refutation; a guess gets a plain correction, because refuting an unheld belief plants it. `lib/scoring.ts`

## What it thinks you believe

Certainty is evidence, not a multiplier: each answer updates a posterior over which misconception you hold. Certain-and-wrong moves it hard, a guess barely. The next question maximises information gain. `lib/belief.ts`

## Your own material

`/packs/new` turns a PDF or notes into questions, every distractor a named misconception; uploads deleted. Endless mode starts you after three and writes the rest in the background while you answer, so you stop on a number you choose. `/explain` marks a spoken explanation, then quizzes the misses. `/dashboard`: weak topics, calibration, runs.

## Question quality

`lib/quality.ts` fails a stem that leaks its answer, or a visibly longest correct option. Form checks cannot see a false key, so `lib/challenge.ts` answers each question blind to it. Word overlap cannot see a reworded question, so `lib/similarity.ts` compares stem embeddings, at a threshold swept over 18 labelled pairs. `npm run eval` on the committed run: 15 questions kept, 15 of 15 with a verified source span, 4 thrown out by the blind second opinion, 4 more as paraphrases the embeddings caught. [Report](evals/report.md)

## Stack

Next.js App Router, strict TypeScript, Tailwind, Zustand + `localStorage`, Recharts, Vitest. `ministral-3b-latest` writes refutations and packs, `mistral-ocr-latest` reads PDFs, Voxtral does speech. No database; every AI path has a fallback.

```bash
npm install
cp .env.example .env.local
npm run dev
npm test
```

`npm run a11y` · `failures` · `perf` · `eval` · `shots` regenerate `docs/` and `evals/` against a running build; nothing there is hand-written.

## Sources

- Gardner-Medwin, A. R. — certainty-based marking, UCL; in summative medical exams since 1994.
- Butterfield, B., & Metcalfe, J. (2001) — hypercorrection.
- Richland, Kornell & Kao — the pretesting effect.
- _Educational Psychology Review_ (2026), DOI 10.1007/s10648-026-10116-9 — personalised refutation can backfire.
