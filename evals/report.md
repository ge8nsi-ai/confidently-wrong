# Generator eval

Run 2026-08-27T11:25:09.837Z against `ministral-3b-latest`.

- Sources: 3
- Model calls: 24 (24 question, 0 repair)
- Questions kept: 17
- Questions passing the rubric: 17 of 17 (**100%**)
- Rescued by a misconception repair call: 0 of 0 repair calls
- Kept despite a rubric failure, to reach the pack floor: 0
- Yield: 71% of calls produced a keepable question
- Wall clock: 48.6s

## Where attempts were rejected

| stage | count |
| --- | --- |
| rubric | 4 |
| duplicate | 3 |

## Why attempts were rejected

| stage | reason | count |
| --- | --- | --- |
| rubric | answer-length-tell | 4 |
| duplicate | asks again about Tidal Mechanics | 2 |
| duplicate | asks again about How often interest compounds affects investment growth | 1 |

## Which rubric check rejected an attempt

| check | count |
| --- | --- |
| answer-length-tell | 4 |

## Per source

| source | kept | calls | passing |
| --- | --- | --- | --- |
| compound-interest.md | 6 | 7 | 6/6 |
| immunity.md | 6 | 8 | 6/6 |
| tides.md | 5 | 9 | 5/5 |
