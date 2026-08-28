# Accessibility audit

Run 2026-08-28T15:43:45.237Z against the production build (`next build` then `next start`) with axe-core 4.13.0 in headless Chromium, tags wcag2a, wcag2aa, wcag21a, wcag21aa. Every scan waits for the entrance animations to finish first, because a colour sampled mid-fade is the blend of two elements and not what anyone sees.

Reproduce with, in two terminals:

```bash
PORT=3100 npm start
```

```bash
npm run a11y
```

**0 violations across 18 scans.** 496 elements axe could not decide were measured from the rendered pixels instead; the worst is 4.77:1 and none falls short of its threshold. Heaviest screen: 413 KB transferred.

| Screen | Viewport | Violations | Checks passed | Undecided | Worst measured | Transferred | Requests |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Home | phone | 0 | 22 | 47 | 5.15:1 | 403 KB | 33 |
| New pack | phone | 0 | 24 | 20 | 4.95:1 | 389 KB | 32 |
| Explain out loud | phone | 0 | 23 | 16 | 4.94:1 | 389 KB | 32 |
| Dashboard | phone | 0 | 21 | 25 | 4.94:1 | 388 KB | 32 |
| Navigation drawer, open | phone | 0 | 22 | 55 | 6.07:1 | 403 KB | 34 |
| Study, probe | phone | 0 | 21 | 20 | 5.96:1 | 391 KB | 32 |
| Study, reveal | phone | 0 | 24 | 124 | 4.77:1 | 391 KB | 32 |
| Study, repair | phone | 0 | 21 | 18 | 4.94:1 | 393 KB | 36 |
| Study, recheck summary | phone | 0 | 23 | 38 | 4.95:1 | 393 KB | 36 |
| Home | laptop | 0 | 22 | 44 | 5.34:1 | 413 KB | 33 |
| New pack | laptop | 0 | 23 | 17 | 5.12:1 | 389 KB | 32 |
| Explain out loud | laptop | 0 | 22 | 13 | 5.15:1 | 389 KB | 32 |
| Dashboard | laptop | 0 | 20 | 22 | 5.15:1 | 388 KB | 32 |
| Navigation drawer, open | laptop | 0 | 22 | 54 | 6.07:1 | 413 KB | 34 |
| Study, probe | laptop | 0 | 21 | 16 | 6.05:1 | 391 KB | 32 |
| Study, reveal | laptop | 0 | 24 | 120 | 5.15:1 | 391 KB | 32 |
| Study, repair | laptop | 0 | 21 | 14 | 5.14:1 | 393 KB | 36 |
| Study, recheck summary | laptop | 0 | 23 | 34 | 4.90:1 | 393 KB | 36 |

## Violations

No violations at either viewport, on any screen or phase listed above.

## Undecided by axe, measured from pixels

axe returns an element as incomplete when it cannot work the background out
from the CSS — a gradient, a pseudo-element, an image, an overlap. The painted
pixels are not ambiguous, so this audit reads those: it makes the element's own
glyphs transparent, captures the box, and takes the worst contrast against every
colour covering 2% or more of it. A gradient is therefore judged at its least
legible end rather than its average.

| Why axe could not decide | Elements | Worst measured | Needs | Worst element |
| --- | --- | --- | --- | --- |
| Element's background color could not be determined due to a pseudo element | 330 | 4.77:1 | 4.5:1 | “0.58 bits left · 1 answer” on Study, reveal, phone, rgb(95, 95, 102) on rgb(225, 223, 223) |
| Element's background color could not be determined due to a background gradient | 147 | 4.90:1 | 4.5:1 | “Certain: 7 answers, 43% right → 0 answers” on Study, recheck summary, laptop, rgb(95, 95, 102) on rgb(225, 228, 213) |
| Element's background color could not be determined because it's partially obscured by another element | 6 | 5.91:1 | 4.5:1 | “Progress” on Explain out loud, phone, rgb(95, 95, 102) on rgb(247, 247, 246) |
| Element's background color could not be determined because it partially overlaps other elements | 7 | 6.07:1 | 4.5:1 | “Progress is saved in this browser. Switching pac” on Navigation drawer, open, laptop, rgb(95, 95, 102) on rgb(251, 250, 247) |
| Element content contains only non-text characters | 2 | 6.07:1 | 4.5:1 | “→” on Navigation drawer, open, phone, rgb(95, 95, 102) on rgb(251, 250, 247) |
| Element's background color could not be determined because element contains an image node | 4 | 9.54:1 | 4.5:1 | “4 ideas worth a second look” on Home, phone, rgb(202, 213, 230) on rgb(31, 44, 61) |

496 text elements measured, 48 decorative marks measured, 153 not measurable (107 covered by another element on this screen; 30 never wholly on screen; 12 no text node of its own to locate; 4 no background pixels to read).

### Shortfalls

Every element axe left undecided meets its threshold when measured.

## Console

No console errors or uncaught exceptions during any scan.
