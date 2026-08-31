# The simulated cohort

```bash
npm run sim
```

Twelve personas, three built-in packs, eight draws each: 288 complete runs through the
real engine. Free and offline, no model calls and no people. Writes `report.md` and
`sessions.json` (the shape `localStorage` holds, so `/dashboard` can be seen with a
populated history).

## What it exercises

Everything the app decides, the app decides here. Question order comes from
`selectNextItem` in `lib/belief.ts`, the repair set is gated by `needsRefutation` in
`lib/scoring.ts`, the recheck round is built by `recheckItems` in `lib/store.ts`, and the
scores are `lib/scoring.ts`. The persona supplies only what a person supplies: which
belief they hold, which option that makes them pick, how certain they say they are, and
whether a correction lands.

## What it can be used to say

1. **The belief model names the right belief.** Ground truth is drawn from
   `hypothesisKeys`, the same hypothesis space `lib/belief.ts` searches, so the model can
   be scored on whether its leading candidate matched what the learner actually held.
   That is arithmetic, checkable and not assumed. The row that matters is the wrong and
   certain one, because that is the case a refutation gets written for.
2. **What the gating rule costs and saves.** Given a stated assumption about how much a
   personalised refutation is worth over a plain explanation, how many corrections does
   targeting give up against refuting every miss, and how many paid calls does it save.
   The assumption is swept from 0 to 1 rather than fixed, so the claim is a curve.

## What it cannot be used to say

Nothing here is evidence that refutation works on people. `stickiness` and
`refutationLift` in `personas.ts` are numbers I chose. At `lift = 0` a refutation is worth
exactly what a plain explanation is worth and every column of the sweep is identical,
which is the null this app is betting against. The before-and-after recheck figure at the
end of the report is downstream of that assumption and is there to show the pipeline runs
end to end, not to stand as a finding.

Two guards against grading the model on its own homework. The simulation's
`ACT_ON_BELIEF` is 0.8 while the model's is 0.75, so the world is not built from the
model's premise. And the sweep holds one cohort fixed and varies only the assumption, so a
row moving means the assumption moved and not the learners.

## Files

| File | What it holds |
| --- | --- |
| `rng.ts` | Seeded mulberry32, so the cohort is the same cohort every run |
| `personas.ts` | The twelve learners. Every field is a number the simulation reads |
| `learner.ts` | One persona through one pack, driving the app's engine |
| `policy.ts` | Belief recovery scoring, and the three policies compared |
| `cohort.sim.ts` | The runner. Writes `report.md` and `sessions.json` |
