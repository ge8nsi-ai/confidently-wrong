/**
 * Devpost gallery shots: every screen of the study flow at a 3:2 viewport.
 *
 * Devpost wants 3:2 images, up to 15 of them, under 5MB each. So this drives the
 * real app in a 1500x1000 window at 2x and writes viewport-clipped JPEGs, which
 * come out 3000x2000 and a few hundred KB. Nothing is composed or retouched: a
 * shot here is what the browser painted.
 *
 * One run costs money. Reaching the repair screen asks /api/refute for a
 * refutation per confidently-wrong answer, the same as the accessibility pass.
 *
 *   PORT=3100 npm start        (in another terminal)
 *   node scripts/shots.mjs
 */
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { loadChromium } from "./lib/chromium.mjs";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3100";
const OUT = path.join(process.cwd(), "shots");
const VIEWPORT = { width: 1200, height: 800 };

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

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const chromium = await loadChromium();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  let n = 0;
  /**
   * One frame. `focus` is a selector to centre first, for screens whose
   * interesting part sits below the fold at this height.
   */
  const shot = async (name, focus) => {
    if (focus) {
      await page
        .locator(focus)
        .first()
        .evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForTimeout(250);
    }
    n += 1;
    const file = path.join(OUT, `${String(n).padStart(2, "0")}-${name}.jpg`);
    // Hovers left over from a click paint a state nobody chose. Park the cursor
    // in a corner before every frame so the shots are of the page, not the mouse.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(120);
    await page.screenshot({ path: file, type: "jpeg", quality: 92 });
    console.log(path.relative(process.cwd(), file));
  };

  const visit = async (url) => {
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
  };

  await visit("/");
  await shot("home");

  await visit("/packs/new");
  await shot("new-pack");

  await visit("/explain");
  await shot("explain-out-loud");

  // Play the seasons pack the way a confidently wrong learner does: first option
  // every time, certainty 3. That is what fills the repair round.
  await visit("/study/seasons");
  await page.waitForSelector('[role="radiogroup"][aria-label="Answer options"]');
  await shot("probe-question");

  await page
    .locator('[role="radiogroup"][aria-label="Answer options"] [role="radio"]')
    .first()
    .click();
  await page
    .locator('[role="radiogroup"][aria-label="How sure are you?"] [role="radio"]')
    .nth(2)
    .click();
  await shot("probe-certainty");

  await page.getByRole("button", { name: /Next question|Finish round/ }).click();
  await page.waitForTimeout(200);
  await answerRound(page, 3);
  await page.getByRole("button", { name: /Repair|Nothing to repair/ }).waitFor();
  await shot("reveal-quadrants");
  await shot("reveal-calibration", "svg.recharts-surface");

  await page.getByRole("button", { name: /Repair|Nothing to repair/ }).click();
  // Until the refutations land, each beat is a pulsing skeleton with no text in
  // it. "Read this aloud" exists only with a refutation behind it, so it is the
  // thing to wait for: a fixed wait photographs skeletons on some runs.
  await page
    .getByRole("button", { name: "Read this aloud" })
    .first()
    .waitFor({ timeout: 40_000 });
  await page.waitForTimeout(500);
  await shot("repair-refutation");

  for (let guard = 0; guard < 12; guard += 1) {
    const next = page.getByRole("button", { name: "Next", exact: true });
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(400);
    // The second beat, photographed after the click rather than before it, or the
    // frame is byte-for-byte the one above.
    if (guard === 0) {
      await page
        .getByRole("button", { name: "Read this aloud" })
        .first()
        .waitFor({ timeout: 40_000 });
      await shot("repair-second-belief");
    }
  }
  await page.getByRole("button", { name: /Recheck \d|^Finish$|^Continue$/ }).click();
  await page.waitForTimeout(500);
  await shot("recheck-question");

  await answerRound(page, 2);
  await page.waitForTimeout(800);
  await shot("recheck-summary");
  await shot("recheck-curves", "svg.recharts-surface");

  await visit("/dashboard");
  await shot("dashboard");
  await shot("dashboard-weak-topics", "svg.recharts-surface");

  await context.close();
  await browser.close();
  console.log(
    `\n${n} shots in ${path.relative(process.cwd(), OUT)}, ` +
      `${VIEWPORT.width * 2}x${VIEWPORT.height * 2} each.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
