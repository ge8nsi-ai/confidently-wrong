# Generator eval

Run 2026-08-28T07:39:02.889Z against `ministral-3b-latest`.

- Sources: 3
- Model calls: 93 (28 question, 2 repair, 19 second opinion, 19 citation, 25 stem embedding)
- Questions kept: 15
- Questions passing the rubric: 15 of 15 (**100%**)
- Thrown out by the second opinion: 4 of 19 answered again
- Thrown out as ungrounded in the source: 0
- Kept with a verified span of the source attached: 15 of 15
- Kept without one because the reply was too thin or a paste, not because the question was ungrounded: 0
- Thrown out as a paraphrase word overlap missed: 4 of 25 embedded
- Rescued by a misconception repair call: 1 of 2 repair calls
- Kept despite a rubric failure, to reach the pack floor: 0
- Yield: 54% of calls produced a keepable question
- Packs cut short by the 50s time budget: 0 of 3
- Wall clock: 73.4s

## Where attempts were rejected

| stage | count |
| --- | --- |
| disputed | 4 |
| paraphrase | 4 |
| duplicate | 3 |
| rubric | 2 |

## Why attempts were rejected

| stage | reason | count |
| --- | --- | --- |
| paraphrase | rewords "If your salary grows by N% annually but inflation rises by N% each year, how much | 2 |
| rubric | answer-length-tell | 2 |
| disputed | answered a, not c — Starting with $N yields the largest amount | asked: Which scenario res | 1 |
| disputed | answered b, not a — Payments reduce the balance first, then interest is calculated on that | 1 |
| disputed | answered c, not d — About N years | asked: If prices rise at N% annually, how long does it | 1 |
| disputed | answered d, not c — After-tax earnings grow slower because the tax reduces the amount you | 1 |
| duplicate | asks again about How compounding affects inflation vs. investment | 1 |
| duplicate | asks again about Inflation vs. Investment Compounding | 1 |
| duplicate | asks again about Tidal Mechanics | 1 |
| paraphrase | rewords "If you owe $N at N% annual interest and pay $N monthly, how much interest do you | 1 |
| paraphrase | rewords "Why do some vaccines include adjuvants like aluminium salt?" as "Why does a vacci | 1 |

## Which rubric check rejected an attempt

| check | count |
| --- | --- |
| answer-length-tell | 2 |

## What the second opinion disputed

- answered b, not a — Payments reduce the balance first, then interest is calculated on that smaller amount. | asked: Which happens first when you carry a credit card balance: the interest charges or the payments?
- answered a, not c — Starting with $500 yields the largest amount | asked: Which scenario results in the highest final amount after 10 years at 5% annual compounding?
- answered d, not c — After-tax earnings grow slower because the tax reduces the amount you invest, so less money compounds each year. | asked: If you earn $5000 annually and pay a 25% tax rate, how much of your after-tax earnings grows at the 6% annual rate compared to pre-tax earnings?
- answered c, not d — About 7 years | asked: If prices rise at 4% annually, how long does it take for your money to lose half its purchasing power?

## What the stem embedding called a reword

- rewords "If you owe $100 at 12% annual interest and pay $10 monthly, how much interest do you pay in the first year?" as "If you borrow $100 at 10% annual interest and pay $5 monthly, which statement best describes how the interest is recalculated each month?"
- rewords "If your salary grows by 3% annually but inflation rises by 5% each year, how much does your real purchasing power change over 5 years?" as "If prices rise by 4% each year and your savings grow by 3% annually, how much does your purchasing power change after 10 years?"
- rewords "If your salary grows by 3% annually but inflation rises by 5% each year, how much does your real purchasing power change over 5 years?" as "Why does a 3% annual salary raise leave your real spending power unchanged after 10 years?"
- rewords "Why do some vaccines include adjuvants like aluminium salt?" as "Why does a vaccine with just a protein antigen sometimes need an adjuvant like aluminium salt to work?"

## Per source

| source | kept | calls | passing | seconds |
| --- | --- | --- | --- | --- |
| compound-interest.md | 3 | 14 | 3/3 | 36.7 |
| immunity.md | 6 | 7 | 6/6 | 17.2 |
| tides.md | 6 | 7 | 6/6 | 19.5 |
