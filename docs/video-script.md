# Confidently Wrong — 120-second video

Hard cap 2:00. Narration below is 260 words ≈ 104s at a normal pace, leaving room to
breathe. Every claim in it is checkable in the repo; nothing is aspirational.

## Pre-flight (do this before you hit record)

1. Open <https://confidently-wrong-fawn.vercel.app> in a clean window, 1440×900, no
   bookmarks bar, no extensions visible.
2. Go to `/dashboard` and clear history if it has old runs — the calibration curve
   reads better from a clean slate. (State is `localStorage` only.)
3. Have a second tab on `/packs/new` with a PDF or ~1500 characters of notes already
   in the box, unsubmitted. Generation takes ~24s; you do not want that on the clock.
4. Have a third tab on `/explain`, mic permission already granted.
5. Do a silent dry run of the Chance pack once so you know the option order, then
   clear history again.

## The scripted run (Chance pack, `/study/chance`)

Seven questions, all asked in the probe round. This run fills all four quadrants and
puts three items in the confidently-wrong one. It is real behaviour, not staged output
— you are choosing answers a real learner plausibly gives.

| # | Question | Option to pick | Certainty | Lands in |
| --- | --- | --- | --- | --- |
| 1 | Ice-cream sales and drownings | "Something else, such as hot weather, plausibly drives both." | 3 | Sure and right |
| 2 | Coin has landed heads six times | "Higher than half — tails is overdue." | 3 | **Sure and wrong** |
| 3 | 99%-accurate test, disease in 1 in 1,000 | "About 99%." | 3 | **Sure and wrong** |
| 4 | Two surveys, 40 people and 4,000 | "The 40-person survey will bounce around far more." | 1 | Unsure and right |
| 5 | Which hospitals report the most unusual outcomes | "The smallest ones, because few cases make rates swing wildly." | 2 | Sure and right |
| 6 | Worst branches get coaching and improve | "The coaching worked, since performance rose right after it." | 2 | **Sure and wrong** |
| 7 | Cycles to work *and* owns a road bike | "(ii) — the detail makes it a more convincing description." | 1 | Unsure and wrong |

Rows 3 and 7 are the two shots that matter. Row 3 is the refutation. Row 7 is the same
kind of wrong answer with no refutation, because you never held the belief — that
contrast is the point of the whole project.

## Shot list

**0:00–0:10 — Hook.** Landing page, then cut straight to a probe card.

> Most study tools tell you what you got wrong. The damage isn't being wrong. It's
> being *sure* and wrong, and never finding out.

**0:10–0:32 — Probe.** Answer rows 1–3 at a readable pace, letting the certainty picker
land visibly each time, then click through 4–7 quickly. No feedback appears; make that
obvious by moving straight to the next card.

> You answer material you haven't studied, and say how sure you are. Guessing, fairly
> sure, certain. No feedback yet — that would just teach you to hedge. Certainty is
> scored: a confident right answer earns three, a confident wrong one costs six.

**0:32–0:52 — Reveal.** Scroll slowly: quadrant grid, then CBM score / Brier score /
Overconfidence, then the calibration curve, then the belief bars.

> Only now does it mark you — your certainty as well as your answers. Four quadrants. A
> calibration curve against the diagonal. And an overconfidence number: how far
> certainty ran above accuracy.

**0:52–1:14 — Repair, and the gate.** Open the refutation on row 3 (the 99%-accurate
test). Then scroll to row 7 and show that it got a plain correction instead.

> Repair only touches the confidently-wrong quadrant. This one gets a refutation
> written against the belief it thinks you hold — named, stated, then dismantled. And
> this one, wrong but a guess, gets a plain explanation. Personalised refutation
> backfires on a belief you never held: it plants it. That gate is one line of code,
> and it's the whole thesis.

**1:14–1:28 — Recheck.** Show the reworded variant, then the second curve overlaid.

> Then it asks the misses again, reworded, so you can't pattern-match phrasing. Second
> curve over the first. That gap closing is the only evidence that counts.

**1:28–1:46 — Your own material.** Cut to the pre-filled `/packs/new` tab, submit,
timelapse the ~24s to the generated pack. Then two seconds each on `/explain`
recording and `/dashboard`.

> It works on your own material — a PDF or your notes become questions, every wrong
> option a named misconception. Uploads are deleted. Or explain a topic out loud and
> get quizzed on what you missed.

**1:46–2:00 — Quality and close.** Split screen: `evals/report.md` beside the app.

> A small model writes those questions, so nothing ships unchecked: a form rubric, a
> second pass that answers each question blind to the key, and stem embeddings that
> catch a reworded repeat. Every call is in the report. Mistral end to end.

## Recording notes

- Screen-record at 60fps if you can; the certainty picker and the curve animate.
- Speed the generation wait to 4× rather than cutting it — the honesty of "this really
  takes 24 seconds" reads better than a jump cut.
- Do not narrate over the refutation text. Let it sit silent for a beat so it can be
  read. That is the one shot a judge will pause on.
- Show the `evals/report.md` disputes section, not just the headline numbers. The
  false positives being visible is the credibility.
- Burn the live URL into the last frame.
