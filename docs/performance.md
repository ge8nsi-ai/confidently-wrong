# Lighthouse

Run 2026-08-28T16:57:13.417Z against the production build (`next build` then `next start`) with Lighthouse 12.8.2 in headless Chromium, mobile preset: 4x CPU throttle, 1.6 Mbps, 390x844 at 2.6x. 5 runs per screen; each cell is the median, and the range in brackets is every run of that screen.

Reproduce with, in two terminals:

```bash
PORT=3100 npm start
```

```bash
npm run perf
```

**Performance 74–92, accessibility 100** across the five screens. Best practices and SEO are in the table.

| Screen | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | SI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 86 (75–92) | 100 | 100 | 100 | 780 ms | 2.8 s | 386 ms (243 ms–888 ms) | 0.00 | 1.6 s |
| New pack | 92 (83–94) | 100 | 100 | 100 | 996 ms | 2.5 s | 289 ms (193 ms–564 ms) | 0.00 | 1.2 s |
| Study, pick a pack | 74 (71–82) | 100 | 100 | 100 | 777 ms | 3.0 s | 888 ms (486 ms–1.1 s) | 0.00 | 1.7 s |
| Explain out loud | 89 (72–92) | 100 | 100 | 100 | 780 ms | 2.6 s | 346 ms (250 ms–1.2 s) | 0.00 | 1.3 s |
| Dashboard | 82 (71–84) | 100 | 100 | 100 | 780 ms | 3.0 s | 500 ms (430 ms–1.1 s) | 0.00 | 1.2 s |

## What these numbers are, and are not

Lighthouse throttles the CPU 4x on top of the host's own speed, and this host benchmarked at 1358.5 — its `benchmarkIndex`, measured on every run, ranging 859–1599 across the 25 runs — while also serving the build being measured. That spread is the story of this table.

First contentful paint, largest contentful paint and layout shift repeat closely:
the same screen measured minutes apart lands within a tenth of a second, and no
screen shifts its layout at all. Total blocking time does not, and the performance
score is mostly total blocking time, so the score moves with it. A pass at three
runs per screen and a pass at five, against the same build, disagreed by up to 15
points and put the screens in a different order.

So read the bracketed ranges, not the medians, and treat a difference smaller than
one of them as nothing. A phone on a real network is a different machine and a CI
runner is a third.

Requests are served from localhost, so the transfer numbers in the accessibility
report are the ones to read for weight. Time to first byte here is a local Node
process, not a deployment.

## The one thing this measured that is worth knowing

Every screen carries a link to the dashboard, and the App Router prefetches it,
so every screen fetches and registers the chart library — 104 KB and around 70 ms
of parse — for a chart only the dashboard and the reveal step draw. It is left in
place on purpose: the chart is server-rendered, its markup is what the
accessibility pass measures and what CalibrationChart's tests assert, and moving
it behind a dynamic import to save bytes on four screens would trade that away for
a chart that arrives a beat after the numbers it belongs to.
