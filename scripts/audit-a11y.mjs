/**
 * Runs axe-core over the production build and writes docs/accessibility.md.
 *
 * Three things make this more than `axe --url`. It drives the study flow, so the
 * REVEAL, REPAIR and RECHECK phases are audited too — they are the screens the
 * whole app exists for and they never appear at a URL of their own. It runs
 * every target at both a phone and a laptop viewport, because the navigation is
 * a bottom tab bar at one and a drawer at the other, so a single width leaves
 * half the chrome unchecked. And it settles axe's "incomplete" results from the
 * rendered pixels rather than leaving them for a reader to take on trust.
 *
 * Usage: PORT=3100 npm start, then `npm run a11y`. Audit the production build,
 * not `next dev`: the dev overlay adds nodes of its own to every page.
 */
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadChromium } from "./lib/chromium.mjs";

const require = createRequire(import.meta.url);
const BASE = process.env.AUDIT_BASE ?? "http://localhost:3100";
const OUT = path.join(process.cwd(), "docs", "accessibility.md");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 900 },
];

/** Answer every question in the current round: option, certainty, next. */
async function answerRound(page, conf) {
  for (let guard = 0; guard < 40; guard += 1) {
    const options = page.locator(
      '[role="radiogroup"][aria-label="Answer options"] [role="radio"]',
    );
    if ((await options.count()) === 0) return;
    await options.first().click();
    await page
      .locator('[role="radiogroup"][aria-label="How sure are you?"] [role="radio"]')
      .nth(conf - 1)
      .click();
    await page.getByRole("button", { name: /Next question|Finish round/ }).click();
    await page.waitForTimeout(150);
  }
}

/** Bytes over the wire for the document and everything it pulled in. */
async function weigh(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const sum = (n, entry) => n + (entry.encodedBodySize || entry.transferSize || 0);
    return {
      bytes: (nav?.encodedBodySize ?? 0) + resources.reduce(sum, 0),
      requests: 1 + resources.length,
    };
  });
}

/** WCAG relative luminance of an 8-bit sRGB triple. */
function luminance([r, g, b]) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Text below full alpha is painted as a blend with whatever is behind it. */
function over(fg, alpha, bg) {
  return fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
}

function parseRgb(value) {
  const nums = value?.match(/[\d.]+/g)?.map(Number) ?? [];
  if (nums.length < 3) return null;
  return { rgb: nums.slice(0, 3), alpha: nums.length > 3 ? nums[3] : 1 };
}

/** 1.4.3: 4.5:1, or 3:1 for large text — 24px, or 18.66px at weight 700+. */
function required(fontSize, fontWeight) {
  const large = fontSize >= 24 || (fontWeight >= 700 && fontSize >= 18.66);
  return large ? 3 : 4.5;
}

/** A colour covering less of the text's box than this is an edge artefact. */
const MIN_SHARE = 0.02;

/**
 * Settles the results axe returns as "incomplete".
 *
 * axe gives up on a background it cannot compute from the CSS: a gradient, a
 * pseudo-element, an image, an overlap. The painted pixels are not ambiguous, so
 * read those instead. The element's own glyphs are made transparent first, which
 * leaves its box showing exactly what is behind the text, and the ratio is then
 * computed against every colour covering at least 2% of that box — the worst one
 * wins, so a gradient is judged at its least legible end.
 */
async function settle(page, nodes) {
  const targets = nodes.filter((n) => n.id === "color-contrast");
  const others = nodes.filter((n) => n.id !== "color-contrast");
  if (targets.length === 0) return others.map((n) => ({ ...n, measured: null }));

  const meta = await page.evaluate(
    readText,
    targets.map((t) => t.target),
  );
  const out = targets.map((t, i) => ({ ...t, ...meta[i], measured: null }));
  // An element with no text node of its own has no glyph box to sample. Its box
  // is whatever its children and pseudo-elements paint — the file input's box is
  // mostly its dark "Choose file" button — so measuring it would compare this
  // element's colour against another element's background. Where the text is
  // real, axe listed the element that actually holds it too, and that one is
  // measured.
  for (const node of out) {
    if (node.found && !node.ownGlyphs) {
      node.measured = { skipped: "no text node of its own to locate" };
    }
  }
  await page.evaluate(hideGlyphs);
  await sample(page, out);
  await page.evaluate(() => {
    document.getElementById("__audit-hide")?.remove();
    delete window.__audit;
  });
  return [...out, ...others.map((n) => ({ ...n, measured: null }))];
}

/** Runs in the page: the text's own colour and size, read before anything moves. */
function readText(selectors) {
  window.__audit = { els: [] };
  return selectors.map((selector) => {
    const el = document.querySelector(selector);
    window.__audit.els.push(el ?? null);
    if (!el) return { found: false };
    const style = getComputedStyle(el);
    const svg = el.namespaceURI === "http://www.w3.org/2000/svg";
    let opacity = 1;
    for (let node = el; node instanceof Element; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity || 1);
    }
    return {
      found: true,
      // SVG text takes its colour from fill, and the chart's tick labels are SVG.
      color: svg ? style.fill : style.color,
      alpha: svg ? Number(style.fillOpacity || 1) : 1,
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight) || 400,
      opacity,
      ownGlyphs: [...el.childNodes].some(
        (child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim(),
      ),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48),
      decorative: Boolean(el.closest('[aria-hidden="true"]')),
    };
  });
}

/**
 * Hides every glyph in the document without touching `color`, so a border or a
 * background drawn from currentColor still paints exactly as it did. Hiding only
 * the target's own text is not enough: a heading and its own parent are both on
 * axe's list, and text inside a paragraph would otherwise be measured as part of
 * that paragraph's background.
 */
function hideGlyphs() {
  const style = document.createElement("style");
  style.id = "__audit-hide";
  style.textContent = [
    "*, *::before, *::after {",
    "  -webkit-text-fill-color: transparent !important;",
    "  text-decoration-color: transparent !important;",
    "  text-shadow: none !important;",
    "  caret-color: transparent !important;",
    // A smooth scroll is still moving when the rectangles are read, and the
    // capture then shows a different strip of the page than was measured.
    "  scroll-behavior: auto !important;",
    "}",
    "text, tspan { fill: transparent !important; }",
  ].join("\n");
  document.head.append(style);
}

/**
 * One screenshot serves every element visible at that scroll position, so a
 * screen of eighty undecided elements costs a handful of captures rather than
 * eighty. Anything still not wholly on screen after its own scrollIntoView is
 * left unmeasured and says so in the report.
 */
async function sample(page, nodes) {
  const pending = nodes
    .map((_, i) => i)
    .filter((i) => nodes[i].found && !nodes[i].measured);
  for (let guard = 0; pending.length > 0 && guard < 120; guard += 1) {
    await page.evaluate((i) => {
      window.__audit.els[i]?.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant",
      });
    }, pending[0]);
    await page.waitForTimeout(60);

    const { scroll, seen, covered } = await page.evaluate(measureBoxes, pending);

    for (const i of covered) {
      nodes[i].measured = { skipped: "covered by another element on this screen" };
      pending.splice(pending.indexOf(i), 1);
    }

    if (seen.length === 0) {
      if (pending.length > 0 && covered.length === 0) {
        nodes[pending.shift()].measured = { skipped: "never wholly on screen" };
      }
      continue;
    }

    const shot = (
      await page.screenshot({ type: "png", animations: "disabled", caret: "hide" })
    ).toString("base64");

    // A capture taken at a different scroll offset than the rectangles shows a
    // different strip of the page, so the sample would be of the wrong pixels.
    const after = await page.evaluate(() => [window.scrollX, window.scrollY]);
    if (after[0] !== scroll[0] || after[1] !== scroll[1]) continue;

    const histograms = await page.evaluate(readPixels, {
      shot,
      found: seen,
      minShare: MIN_SHARE,
    });

    for (const { i, colors } of histograms) {
      const node = nodes[i];
      const text = parseRgb(node.color);
      if (!text) {
        node.measured = { skipped: "no text colour to compare" };
      } else if (colors.length === 0) {
        node.measured = { skipped: "no background pixels to read" };
      } else {
        const alpha = text.alpha * (node.alpha ?? 1) * node.opacity;
        let worst = null;
        for (const { rgb: bg, share } of colors) {
          const ratio = contrast(over(text.rgb, alpha, bg), bg);
          if (!worst || ratio < worst.ratio) worst = { ratio, bg, share };
        }
        node.measured = { ...worst, need: required(node.fontSize, node.fontWeight) };
      }
      pending.splice(pending.indexOf(i), 1);
    }
  }
}

/**
 * Runs in the page: the rectangles the glyphs occupy, not the element's box. A
 * paragraph's box includes its leading and anything else nested inside it; the
 * line boxes of its own text are where the contrast question actually lives.
 *
 * A box is only worth sampling if the element is what is painted there. With the
 * navigation drawer open, axe still evaluates the page behind it, and reading
 * those pixels measures the text against the scrim that hides it — a number
 * about nothing. The hit test at each box's centre is what separates the two.
 */
function measureBoxes(indices) {
  const tight = (el) => {
    const boxes = [];
    for (const child of el.childNodes) {
      if (child.nodeType !== Node.TEXT_NODE) continue;
      if (!child.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(child);
      boxes.push(...range.getClientRects());
    }
    return boxes;
  };

  /** An ancestor counts: pointer-events:none text hit-tests as its wrapper. */
  const painted = (el, r) => {
    const hit = document.elementFromPoint(
      Math.min(window.innerWidth - 1, r.left + r.width / 2),
      Math.min(window.innerHeight - 1, r.top + r.height / 2),
    );
    return Boolean(hit) && (hit === el || el.contains(hit) || hit.contains(el));
  };

  const seen = [];
  const covered = [];
  for (const i of indices) {
    const el = window.__audit.els[i];
    if (!el) continue;
    const onScreen = tight(el).filter(
      (r) =>
        r.width >= 1 &&
        r.height >= 1 &&
        r.left >= 0 &&
        r.top >= 0 &&
        r.right <= window.innerWidth &&
        r.bottom <= window.innerHeight,
    );
    if (onScreen.length === 0) continue;
    const visible = onScreen.filter((r) => painted(el, r));
    if (visible.length === 0) {
      covered.push(i);
      continue;
    }
    seen.push({
      i,
      boxes: visible.map((r) => ({
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.max(1, Math.round(r.width)),
        h: Math.max(1, Math.round(r.height)),
      })),
    });
  }
  return { scroll: [window.scrollX, window.scrollY], seen, covered };
}

/** Runs in the page: decodes the capture once, then counts colours per box. */
async function readPixels({ shot, found, minShare }) {
  const image = new Image();
  image.src = `data:image/png;base64,${shot}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const scale = image.width / window.innerWidth;
  return found.map(({ i, boxes }) => {
    const counts = new Map();
    let total = 0;
    for (const { x, y, w, h } of boxes) {
      const { data } = ctx.getImageData(
        Math.round(x * scale),
        Math.round(y * scale),
        Math.max(1, Math.round(w * scale)),
        Math.max(1, Math.round(h * scale)),
      );
      for (let p = 0; p < data.length; p += 4) {
        const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      total += data.length / 4;
    }
    return {
      i,
      colors: [...counts.entries()]
        .map(([key, n]) => ({
          rgb: [(key >> 16) & 255, (key >> 8) & 255, key & 255],
          share: n / total,
        }))
        .filter((c) => c.share >= minShare)
        .sort((a, b) => b.share - a.share)
        .slice(0, 24),
    };
  });
}

async function scan(page, axeSource, label, viewport, results) {
  // axe samples the colour it finds, and an element halfway through the entrance
  // fade reports the blend of itself and the page behind it: white-on-navy came
  // back as white-on-grey and failed. Let the animations end first.
  await page.evaluate(async () => {
    const running = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming?.();
      return timing && timing.iterations !== Infinity;
    });
    await Promise.race([
      Promise.all(running.map((animation) => animation.finished.catch(() => {}))),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  });
  await page.waitForTimeout(120);
  await page.evaluate(axeSource);
  const run = await page.evaluate(
    async (tags) =>
      await window.axe.run(document, {
        runOnly: { type: "tag", values: tags },
      }),
    TAGS,
  );
  const weight = await weigh(page);
  const nodesOf = (checks) =>
    checks.flatMap((check) =>
      check.nodes.map((node) => ({
        id: check.id,
        target: node.target.join(" "),
        summary: (node.failureSummary ?? node.any?.[0]?.message ?? "")
          .replace(/\s+/g, " ")
          .replace(/^Fix any of the following:\s*/, "")
          .trim(),
      })),
    );
  const undecided = await settle(page, nodesOf(run.incomplete));
  results.push({
    label,
    viewport: viewport.name,
    passes: run.passes.length,
    undecided,
    weight,
    violations: run.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({
        target: n.target.join(" "),
        summary: (n.failureSummary ?? "").replace(/\s+/g, " ").trim(),
      })),
    })),
  });
  const short = undecided.filter(
    (n) => n.measured?.ratio < n.measured?.need && !exempt(n),
  );
  process.stdout.write(
    `${viewport.name.padEnd(7)} ${label.padEnd(28)} ` +
      `${results.at(-1).violations.length} violations, ` +
      `${undecided.length} undecided (${short.length} short), ` +
      `${(weight.bytes / 1024).toFixed(0)}KB\n`,
  );
  // axe scrolls the window to reach what is below the fold and does not always
  // put it back, and the next click then lands on whatever moved under it — the
  // hero image, in the case of the navigation toggle.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(80);
}

async function runViewport(browser, viewport, axeSource, results, noise) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") noise.push(`${viewport.name}: ${m.text()}`);
  });
  page.on("pageerror", (e) => noise.push(`${viewport.name}: ${e.message}`));

  // A server left running across a rebuild serves HTML that points at a
  // stylesheet the build has since replaced. The page then renders unstyled, and
  // an unstyled page passes almost every contrast check for the wrong reason.
  const broken = [];
  page.on("response", (r) => {
    if (r.status() >= 400 && /\.css(\?|$)/.test(r.url())) broken.push(r.url());
  });

  const visit = async (url) => {
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    if (broken.length > 0) {
      throw new Error(
        `${broken[0]} did not load — restart the server, it is serving a build that is no longer on disk`,
      );
    }
  };

  for (const [label, url] of [
    ["Home", "/"],
    ["New pack", "/packs/new"],
    ["Explain out loud", "/explain"],
    ["Dashboard", "/dashboard"],
  ]) {
    await visit(url);
    await scan(page, axeSource, label, viewport, results);
  }

  await visit("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.waitForTimeout(450);
  await scan(page, axeSource, "Navigation drawer, open", viewport, results);

  // The error message is a colour no happy path renders, so it was going
  // unmeasured. Rejecting a file is the cheapest way to render it: the size check
  // is client-side, so nothing is sent and no model is called.
  await visit("/packs/new");
  await page.setInputFiles("#material-file", {
    name: "lecture-notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(9 * 1024 * 1024, 0x20),
  });
  await page.getByText(/is over 8MB/).waitFor();
  await scan(page, axeSource, "New pack, file rejected", viewport, results);

  // The phases only exist as store state, so they are reached by playing the
  // pack: first option every time, certainty 3, which is what a confidently
  // wrong learner does and what fills the repair round.
  await visit("/study/seasons");
  await page.waitForSelector('[role="radiogroup"][aria-label="Answer options"]');
  await scan(page, axeSource, "Study, probe", viewport, results);

  await answerRound(page, 3);
  await page.getByRole("button", { name: /Repair|Nothing to repair/ }).waitFor();
  await scan(page, axeSource, "Study, reveal", viewport, results);

  await page.getByRole("button", { name: /Repair|Nothing to repair/ }).click();
  await page.waitForTimeout(3500);
  await scan(page, axeSource, "Study, repair", viewport, results);

  for (let guard = 0; guard < 12; guard += 1) {
    const next = page.getByRole("button", { name: "Next", exact: true });
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: /Recheck \d|^Finish$|^Continue$/ }).click();
  await page.waitForTimeout(400);
  await answerRound(page, 2);
  await page.waitForTimeout(600);
  await scan(page, axeSource, "Study, recheck summary", viewport, results);

  // The first Dashboard scan is of an empty one. A round has been played by now,
  // so this pass renders the parts that only exist once there is history: the
  // weak-topic rows, their "! sure" pills, and the alarm colouring on the counts.
  await visit("/dashboard");
  await scan(page, axeSource, "Dashboard, after a round", viewport, results);

  await context.close();
}

function table(results) {
  const rows = results.map((r) => {
    const measured = r.undecided.filter((n) => n.measured?.ratio && !exempt(n));
    const worst = measured.reduce(
      (low, n) => (low === null || n.measured.ratio < low ? n.measured.ratio : low),
      null,
    );
    return (
      `| ${r.label} | ${r.viewport} | ${r.violations.length} | ${r.passes} | ` +
      `${r.undecided.length} | ${worst === null ? "—" : `${worst.toFixed(2)}:1`} | ` +
      `${(r.weight.bytes / 1024).toFixed(0)} KB | ${r.weight.requests} |`
    );
  });
  return [
    "| Screen | Viewport | Violations | Checks passed | Undecided | Worst measured | Transferred | Requests |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function detail(results) {
  const failing = results.filter((r) => r.violations.length > 0);
  if (failing.length === 0) {
    return "No violations at either viewport, on any screen or phase listed above.";
  }
  return failing
    .map((r) =>
      [
        `### ${r.label} — ${r.viewport}`,
        ...r.violations.map((v) =>
          [
            `- **${v.id}** (${v.impact}): ${v.help}`,
            ...v.nodes.slice(0, 4).map((n) => `  - \`${n.target}\` — ${n.summary}`),
          ].join("\n"),
        ),
      ].join("\n"),
    )
    .join("\n\n");
}

const rgb = (c) => `rgb(${c.join(", ")})`;

/** Every undecided element, flattened across screens, with its screen attached. */
function flatten(results) {
  return results.flatMap((r) =>
    r.undecided.map((n) => ({ ...n, screen: `${r.label}, ${r.viewport}` })),
  );
}

/**
 * The interesting number per reason is not the count but the worst case, so the
 * table gives the count and then the single element that came closest to the
 * threshold, by name, with the background it was measured against.
 */
function undecidedSection(results) {
  const all = flatten(results);
  if (all.length === 0) return "axe returned nothing as incomplete.";
  const measured = all.filter((n) => n.measured?.ratio && !exempt(n));
  const marks = all.filter((n) => n.measured?.ratio && exempt(n));
  const skipped = all.filter((n) => n.measured?.skipped);
  const groups = new Map();
  for (const node of measured) {
    const key = node.summary || "no reason given";
    const worst = groups.get(key);
    if (!worst || node.measured.ratio < worst.node.measured.ratio) {
      groups.set(key, { node, count: (worst?.count ?? 0) + 1 });
    } else {
      groups.set(key, { ...worst, count: worst.count + 1 });
    }
  }
  const rows = [...groups.entries()]
    .sort((a, b) => a[1].node.measured.ratio - b[1].node.measured.ratio)
    .map(([reason, { node, count }]) => {
      const m = node.measured;
      return (
        `| ${reason} | ${count} | ${m.ratio.toFixed(2)}:1 | ${m.need}:1 | ` +
        `${node.text ? `“${node.text}”` : "—"} on ${node.screen}, ` +
        `${node.color} on ${rgb(m.bg)} |`
      );
    });
  return [
    "axe returns an element as incomplete when it cannot work the background out",
    "from the CSS — a gradient, a pseudo-element, an image, an overlap. The painted",
    "pixels are not ambiguous, so this audit reads those: it makes the element's own",
    "glyphs transparent, captures the box, and takes the worst contrast against every",
    "colour covering 2% or more of it. A gradient is therefore judged at its least",
    "legible end rather than its average.",
    "",
    "| Why axe could not decide | Elements | Worst measured | Needs | Worst element |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    [
      `${measured.length} text elements measured`,
      marks.length > 0 ? `${marks.length} decorative marks measured` : null,
      skipped.length > 0
        ? `${skipped.length} not measurable (${tally(skipped.map((n) => n.measured.skipped))})`
        : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  ].join("\n");
}

/** "12 covered by the drawer, 3 off screen" — a count per distinct reason. */
function tally(reasons) {
  const counts = new Map();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${n} ${reason}`)
    .join("; ");
}

/**
 * 1.4.3 is about text. A mark that is `aria-hidden` and made of no letters or
 * digits — the arrow on a button, the ✓ ~ ? ! in the quadrant grid — carries
 * nothing that the label beside it does not already say, and the audit hides
 * glyphs to sample the background, which leaves such a box holding only
 * background. Measured and reported, but not counted as a failure. An
 * aria-hidden element with actual words in it is not exempt: sighted readers
 * still read it.
 */
function exempt(node) {
  return Boolean(node.decorative) && !/[\p{L}\p{N}]/u.test(node.text ?? "");
}

/** Anything that fails once measured is a real failure and is named as one. */
function shortfalls(results) {
  const failing = flatten(results).filter(
    (n) => n.measured?.ratio && n.measured.ratio < n.measured.need,
  );
  const short = failing.filter((n) => !exempt(n));
  const marks = failing.filter(exempt);
  const note =
    marks.length === 0
      ? ""
      : `\n\n${marks.length} decorative aria-hidden mark${marks.length === 1 ? "" : "s"} ` +
        `also measured below threshold (${[...new Set(marks.map((n) => `“${n.text}”`))].join(", ")}). ` +
        "They hold no letters or digits and sit beside the label that carries their meaning, " +
        "so 1.4.3 does not apply to them.";
  if (short.length === 0) {
    return (
      "Every element axe left undecided meets its threshold when measured." + note
    );
  }
  return (
    short
      .map(
        (n) =>
          `- ${n.measured.ratio.toFixed(2)}:1 against ${n.measured.need}:1 — ` +
          `${n.text ? `“${n.text}”` : n.target} on ${n.screen}, ` +
          `${n.color} on ${rgb(n.measured.bg)} (\`${n.target}\`)`,
      )
      .join("\n") + note
  );
}

async function main() {
  const chromium = loadChromium();
  const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  const axeVersion = require("axe-core/package.json").version;
  const results = [];
  const noise = [];

  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      await runViewport(browser, viewport, axeSource, results, noise);
    }
  } finally {
    await browser.close();
  }

  const total = results.reduce((n, r) => n + r.violations.length, 0);
  const heaviest = Math.max(...results.map((r) => r.weight.bytes));
  const all = flatten(results);
  const measured = all.filter((n) => n.measured?.ratio && !exempt(n));
  const short = measured.filter((n) => n.measured.ratio < n.measured.need).length;

  // One "worst" number invites the reader to hold it against 4.5:1, which is the
  // wrong threshold for a 30px numeral. Report the worst of each requirement.
  const lowest = (rows) =>
    rows.length === 0 ? null : Math.min(...rows.map((n) => n.measured.ratio));
  const worstSmall = lowest(measured.filter((n) => n.measured.need >= 4.5));
  const worstLarge = lowest(measured.filter((n) => n.measured.need < 4.5));
  const passing = [
    worstSmall === null ? null : `${worstSmall.toFixed(2)}:1 where 4.5:1 is required`,
    worstLarge === null
      ? null
      : `${worstLarge.toFixed(2)}:1 where the text is large enough to owe 3:1`,
  ]
    .filter(Boolean)
    .join(", and ");

  const lines = [
    "# Accessibility audit",
    "",
    `Run ${new Date().toISOString()} against the production build (\`next build\` then \`next start\`) with axe-core ${axeVersion} in headless Chromium, tags ${TAGS.join(", ")}. Every scan waits for the entrance animations to finish first, because a colour sampled mid-fade is the blend of two elements and not what anyone sees.`,
    "",
    "Reproduce with, in two terminals:",
    "",
    "```bash",
    "PORT=3100 npm start",
    "```",
    "",
    "```bash",
    "npm run a11y",
    "```",
    "",
    `**${total} violations across ${results.length} scans.** ${measured.length} elements axe could not decide were measured from the rendered pixels instead; ${short === 0 ? `none falls short of its threshold, the closest being ${passing}` : `${short} fall short of their threshold`}. Heaviest screen: ${(heaviest / 1024).toFixed(0)} KB transferred.`,
    "",
    table(results),
    "",
    "## Violations",
    "",
    detail(results),
    "",
    "## Undecided by axe, measured from pixels",
    "",
    undecidedSection(results),
    "",
    "### Shortfalls",
    "",
    shortfalls(results),
    "",
    "## Console",
    "",
    noise.length === 0
      ? "No console errors or uncaught exceptions during any scan."
      : noise.map((n) => `- \`${n}\``).join("\n"),
    "",
  ];

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, lines.join("\n"), "utf8");
  process.stdout.write(
    `\n${total} violations, ${short} measured shortfalls, closest ${passing}. Written to ${OUT}\n`,
  );
}

await main();
