# Confidently Wrong

A study tool built on **certainty-based marking**. You answer questions on material you have not studied, say how sure you are, and only afterwards find out which beliefs were *confidently wrong*. Those are the only ones that get a personalised refutation.

## The five phases

1. **Pick** — a pack: seasons, natural selection, or chance and evidence.
2. **Probe** — one question at a time: an answer, then your certainty — guessing, fairly sure, or certain. No feedback at all during this round.
3. **Reveal** — everything at once: a certainty-against-correctness grid, a calibration curve against the perfectly-calibrated diagonal, your certainty-based-marking score, and how many points more sure than right you were.
4. **Repair** — refutation cards, one at a time, for the confidently-wrong quadrant only.
5. **Recheck** — reworded variants of what you missed, second curve over the first.

## Why refutation is gated

A refutation card appears only where certainty was 2 or 3 *and* the answer was wrong. A wrong answer flagged as a guess gets a plain statement of the correct answer instead. This is a hard rule, not a preference: explaining why a belief someone never held is wrong hands them a misconception to remember, and personalised refutation can backfire on learners who were not committed to the error. The gate lives in `lib/scoring.ts`, proven by `lib/store.test.ts`.

## Stack

Next.js (App Router), strict TypeScript, Tailwind, Zustand over `localStorage`, Recharts, Vitest. Mistral `ministral-3b-latest` writes refutations; Voxtral handles read-aloud and spoken answers. No database, no accounts. Every AI path degrades to hand-written fallback text.

## Run it

```bash
npm install
cp .env.example .env.local   # add MISTRAL_API_KEY, or leave it blank
npm run dev
npm test
```

## Sources

- Gardner-Medwin, A. R. — certainty-based marking, UCL; in use in summative medical exams since 1994.
- Butterfield, B., & Metcalfe, J. (2001) — the hypercorrection effect.
- Richland, Kornell & Kao — the pretesting effect.
- *Educational Psychology Review* (2026), DOI 10.1007/s10648-026-10116-9 — personalised refutation can backfire.
