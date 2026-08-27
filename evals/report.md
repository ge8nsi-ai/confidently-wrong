# Generator eval

Run 2026-08-27T18:18:18.104Z against `ministral-3b-latest`.

- Sources: 3
- Model calls: 86 (36 question, 3 repair, 17 second opinion, 30 stem embedding)
- Questions kept: 16
- Questions passing the rubric: 16 of 16 (**100%**)
- Thrown out by the second opinion: 1 of 17 answered again
- Thrown out as a paraphrase word overlap missed: 9 of 30 embedded
- Rescued by a misconception repair call: 2 of 3 repair calls
- Kept despite a rubric failure, to reach the pack floor: 0
- Yield: 44% of calls produced a keepable question
- Packs cut short by the 50s time budget: 0 of 3
- Wall clock: 65.7s

## Where attempts were rejected

| stage | count |
| --- | --- |
| paraphrase | 9 |
| duplicate | 6 |
| rubric | 4 |
| disputed | 1 |

## Why attempts were rejected

| stage | reason | count |
| --- | --- | --- |
| rubric | answer-length-tell | 3 |
| paraphrase | rewords "Why do some vaccines include adjuvants like aluminium salt?" as "Why does a vacci | 2 |
| paraphrase | rewords "Why does the far side of Earth show a tidal bulge if the Moon’s pull is weaker th | 2 |
| disputed | answered b, not c — You’ll need to save $N.N because your N% return offsets inflation’s N% | 1 |
| duplicate | asks again about How compounding affects inflation | 1 |
| duplicate | asks again about Inflation and Compound Growth | 1 |
| duplicate | asks again about Inflation and compounding effects | 1 |
| duplicate | asks again about Tidal Bulges and Celestial Alignment | 1 |
| duplicate | asks again about Tidal bulges and relative distances | 1 |
| duplicate | asks again about Tidal effects of the Sun and Moon | 1 |
| paraphrase | rewords "After vaccination, why might a person still get sick but not as severely?" as "Wh | 1 |
| paraphrase | rewords "If prices rise N% each year, how long until a $N purchase costs $N?" as "If price | 1 |
| paraphrase | rewords "If you owe $N at N% annual interest and pay $N monthly, how much interest do you | 1 |
| paraphrase | rewords "Why does Earth experience two high tides daily instead of one?" as "Why does Eart | 1 |
| paraphrase | rewords "Why does Earth experience two high tides daily instead of one?" as "Why does the | 1 |
| rubric | no-answer-leak | 1 |

## Which rubric check rejected an attempt

| check | count |
| --- | --- |
| answer-length-tell | 3 |
| no-answer-leak | 1 |

## What the second opinion disputed

- answered b, not c — You’ll need to save $115.40 because your 5% return offsets inflation’s 3% loss, so you only need to grow your savings slightly more than inflation erodes. | asked: If inflation is 3% annually and you save $100 today, how much will you need to save in the future to match today’s purchasing power after 10 years if you earn 5% annual return on your savings?

## What the stem embedding called a reword

- rewords "If you owe $100 at 10% annual interest and pay $10 monthly, how much interest do you pay in the first year?" as "If you borrow $100 at 12% annual interest and pay $5 monthly, how many years will it take to fully repay the loan?"
- rewords "If prices rise 2% each year, how long until a $100 purchase costs $200?" as "If prices rise by 2% each month instead of annually, how many months until a $100 item costs $200?"
- rewords "Why do some vaccines include adjuvants like aluminium salt?" as "Why does a vaccine with just a protein antigen sometimes need an adjuvant like aluminium salt?"
- rewords "Why do some vaccines include adjuvants like aluminium salt?" as "Why does a vaccine’s adjuvant matter more than the antigen alone?"
- rewords "After vaccination, why might a person still get sick but not as severely?" as "Why might a vaccinated person still spread a pathogen like COVID-19 even if they don’t get sick?"
- rewords "Why does the far side of Earth show a tidal bulge if the Moon’s pull is weaker there?" as "Why does the ocean on Earth’s far side from the Moon form a bulge even though the Moon’s gravitational pull is weaker there?"
- rewords "Why does Earth experience two high tides daily instead of one?" as "Why does the same coastline experience two high tides daily even though the Moon’s bulges shift position?"
- rewords "Why does Earth experience two high tides daily instead of one?" as "Why does Earth have two tidal bulges instead of just one?"
- rewords "Why does the far side of Earth show a tidal bulge if the Moon’s pull is weaker there?" as "Why does the Sun’s tidal effect on Earth’s oceans feel weaker than its actual gravitational pull?"

## Per source

| source | kept | calls | passing |
| --- | --- | --- | --- |
| compound-interest.md | 4 | 14 | 4/4 |
| immunity.md | 6 | 9 | 6/6 |
| tides.md | 6 | 13 | 6/6 |
