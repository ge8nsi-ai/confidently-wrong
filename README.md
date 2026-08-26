# Confidently Wrong

A study tool built on **certainty-based marking**. You answer questions on material you have not studied, say how sure you are, and only then find out which beliefs were *confidently wrong*. Those alone get a personalised refutation.

## The five phases

1. **Pick** a pack.
2. **Probe** — an answer, then your certainty: guessing, fairly sure, certain. No feedback here.
3. **Reveal** — certainty-against-correctness grid, calibration curve against the perfect diagonal, CBM score, overconfidence gap.
4. **Repair** — refutation cards for the confidently-wrong quadrant only.
5. **Recheck** — reworded variants of the misses, second curve over the first.

## Why refutation is gated

A refutation appears only where certainty was 2 or 3 *and* the answer was wrong. A guessed wrong answer gets a plain correction. Explaining why a belief someone never held is wrong hands them a misconception to remember. The gate lives in `lib/scoring.ts`, proven by `lib/store.test.ts`.

## Your own material

`/packs/new` turns a PDF, text file, or pasted notes into 4–8 questions, each distractor built from a stated misconception. Uploads are deleted after text extraction.

`/dashboard` keeps sessions in this browser: topics you miss most, weighted by certainty; calibration across all answers; past runs to repeat.

## Stack

Next.js App Router, strict TypeScript, Tailwind, Zustand over `localStorage`, Recharts, Vitest. Mistral `ministral-3b-latest` writes refutations and packs, `mistral-ocr-latest` reads PDFs, Voxtral does speech. No accounts, no database; every AI path falls back to hand-written text.

```bash
npm install
cp .env.example .env.local   # add MISTRAL_API_KEY, or leave it blank
npm run dev
npm test
```

## Sources

- Gardner-Medwin, A. R. — certainty-based marking, UCL; in summative medical exams since 1994.
- Butterfield, B., & Metcalfe, J. (2001) — hypercorrection.
- Richland, Kornell & Kao — the pretesting effect.
- *Educational Psychology Review* (2026), DOI 10.1007/s10648-026-10116-9 — personalised refutation can backfire.
