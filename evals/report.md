# Generator eval

Run 2026-08-27T15:53:42.184Z against `ministral-3b-latest`.

- Sources: 3
- Model calls: 46 (25 question, 2 repair, 19 second opinion)
- Questions kept: 17
- Questions passing the rubric: 17 of 17 (**100%**)
- Thrown out by the second opinion: 2 of 19 answered again
- Rescued by a misconception repair call: 2 of 2 repair calls
- Kept despite a rubric failure, to reach the pack floor: 0
- Yield: 68% of calls produced a keepable question
- Packs cut short by the 50s time budget: 1 of 3
- Wall clock: 106.4s

## Where attempts were rejected

| stage | count |
| --- | --- |
| rubric | 3 |
| disputed | 2 |
| error | 2 |
| duplicate | 1 |

## Why attempts were rejected

| stage | reason | count |
| --- | --- | --- |
| rubric | answer-length-tell | 3 |
| error | mistral chat N | 2 |
| disputed | answered b, not c — About N years | asked: If inflation is N% yearly, how long does it tak | 1 |
| disputed | answered b, not d — The Moon’s gravity is stronger because it’s closer, so the difference | 1 |
| duplicate | asks again about Compound Interest in Debt | 1 |

## Which rubric check rejected an attempt

| check | count |
| --- | --- |
| answer-length-tell | 3 |

## What the second opinion disputed

- answered b, not c — About 6 years | asked: If inflation is 3% yearly, how long does it take for a dollar’s value to halve?
- answered b, not d — The Moon’s gravity is stronger because it’s closer, so the difference in pull is bigger. | asked: Why does the Sun’s tidal effect on Earth’s oceans feel weaker than the Moon’s even though it’s much farther away?

## Per source

| source | kept | calls | passing |
| --- | --- | --- | --- |
| compound-interest.md | 5 | 7 | 5/5 |
| immunity.md | 6 | 7 | 6/6 |
| tides.md | 6 | 11 | 6/6 |
