# Confidently Wrong

A study tool built on **certainty-based marking**. Answer questions on unstudied material, say how sure you are, then learn which beliefs were *confidently wrong*. Those alone get a refutation.

## The five phases

1. **Pick** a pack.
2. **Probe** — answer plus certainty: guessing, fairly sure, certain. No feedback.
3. **Reveal** — quadrant grid, calibration curve, CBM score.
4. **Repair** — refutation cards for the confidently-wrong quadrant.
5. **Recheck** — reworded misses, second curve over the first.

## Why refutation is gated

Certainty 2 or 3 *and* wrong earns a refutation; a guessed wrong answer gets a plain correction — explaining an unheld belief hands someone a misconception to remember. Gated in `lib/scoring.ts`, tested in `lib/store.test.ts`.

## Your own material

`/packs/new` turns a PDF or pasted notes into 4–8 questions, each distractor a stated misconception. Uploads are deleted afterwards.

`/explain` does it out loud. Say what you think you know; you are told what was sound, what you left out, and what was wrong, then quizzed on those — your own wrong claims become the distractors, and correct answers may only come from the corrections. Typing works where the microphone cannot.

`/dashboard`: weakest topics, lifetime calibration, past runs.

## Stack

Next.js App Router, strict TypeScript, Tailwind, Zustand over `localStorage`, Recharts, Vitest. Mistral `ministral-3b-latest` writes refutations, critiques, and packs; `mistral-ocr-latest` reads PDFs; Voxtral does speech. No accounts, no database, and a hand-written fallback behind every AI path.

```bash
npm install
cp .env.example .env.local   # MISTRAL_API_KEY
npm run dev
npm test
```

## Sources

- Gardner-Medwin, A. R. — certainty-based marking, UCL; in summative medical exams since 1994.
- Butterfield, B., & Metcalfe, J. (2001) — hypercorrection.
- Richland, Kornell & Kao — the pretesting effect.
- *Educational Psychology Review* (2026), DOI 10.1007/s10648-026-10116-9 — personalised refutation can backfire.
