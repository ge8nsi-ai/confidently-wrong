/**
 * Devpost gallery shots: every screen of the study flow at a 3:2 viewport.
 *
 * Devpost wants 3:2 images, up to 15 of them, under 5MB each. So this drives the
 * real app in a 1500x1000 window at 2x and writes viewport-clipped JPEGs, which
 * come out 3000x2000 and a few hundred KB. Nothing is composed or retouched: a
 * shot here is what the browser painted.
 *
 * One run costs money. Reaching the repair screen asks /api/refute for a
 * refutation per confidently-wrong answer, the same as the accessibility pass, and
 * the escalation shot asks for one more in a second style.
 *
 * The dashboard is the one screen a single run cannot fill: a plan built from
 * history, a trend across sessions and a weak-topic ranking all need more than one
 * session to say anything. So before /dashboard is visited, localStorage is replaced
 * with one simulated learner's runs from sim/sessions.json, timestamps rebased onto
 * the weeks before the shot. The records are the sim's real output in the shape the
 * store writes, not hand-authored JSON, and the app derives every number on that
 * page itself.
 *
 * The run just played is dropped rather than merged, which is deliberate. It answers
 * the first option every time at maximum certainty, so its belief notes are the
 * freshest and strongest in the store and take both repair slots in the plan, dated
 * "earlier today". That buries the thing the plan exists to show, which is a belief
 * still being carried weeks later, under an artefact of how this script clicks.
 *
 *   PORT=3100 npm start        (in another terminal)
 *   node scripts/shots.mjs
 */
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { loadChromium } from "./lib/chromium.mjs";

const BASE = process.env.SHOTS_BASE ?? "http://localhost:3100";
const OUT = path.resolve(process.cwd(), process.env.SHOTS_OUT ?? "shots");
const VIEWPORT = { width: 1200, height: 800 };
// 2x for the submission gallery, where a frame is inspected full-screen. Pass
// SHOTS_SCALE=1 for README images, which render at a few hundred pixels wide and
// are cloned with the repo, so a retina copy is bytes nobody looks at.
const SCALE = Number(process.env.SHOTS_SCALE ?? 2);

/** Where the store keeps history, and the version its migration expects. */
const STORE_KEY = "confidently-wrong.v1";
const STORE_VERSION = 2;

/**
 * Which simulated learner's history to seed, out of the twelve in sim/sessions.json.
 *
 * Marcus, because a dashboard is only worth reading when the learner is plausible.
 * He answers 67% correctly with certainty running 13 points ahead of that, which is
 * a competent person with a calibration problem: enough of a gap to clear the plan's
 * threshold and be worth acting on, and nothing like the caricature the most
 * overconfident persona in the cohort would paint.
 */
const HISTORY_LEARNER = "marcus";

/**
 * Days before the shot for each seeded run, oldest first.
 *
 * Spread rather than stacked so the page has something to say about time: the plan
 * dates a carried belief in weeks, the trend chart needs more than one x value, and
 * a belief from four weeks back is worth visibly less than one from Monday.
 */
const HISTORY_AGES_DAYS = [26, 12, 2];

const DAY_MS = 86_400_000;

/**
 * One learner's sessions from the sim, rebased onto the day this runs.
 *
 * The sim dates every run to one fixed instant, which is what keeps its fixture
 * deterministic and also what would make a screenshot claim the learner did three
 * packs in nine minutes and nothing since. Rebasing moves the dates and touches
 * nothing else: the answers, the certainties and the belief notes are the sim's.
 */
function seededHistory(now) {
  const file = path.resolve(process.cwd(), "sim/sessions.json");
  const all = JSON.parse(readFileSync(file, "utf8"));
  const mine = all.filter((s) => s.id.startsWith(`sim-${HISTORY_LEARNER}-`));
  if (mine.length === 0) {
    throw new Error(`no sessions for ${HISTORY_LEARNER} in sim/sessions.json`);
  }
  return mine.slice(0, HISTORY_AGES_DAYS.length).map((session, i) => {
    const startedAt = now - HISTORY_AGES_DAYS[i] * DAY_MS;
    return {
      ...session,
      startedAt,
      updatedAt: startedAt + (session.updatedAt - session.startedAt),
    };
  });
}

/**
 * Put the seeded runs in the store, as the only history there is, then reload.
 *
 * Written straight rather than merged into what the study run left behind, for the
 * reason at the top of this file. Only `sessions` is touched: a custom pack or a
 * cached refutation in there is not history and has nothing to do with this page.
 */
async function seedHistory(page, records) {
  await page.evaluate(
    ([key, version, seeded]) => {
      const raw = window.localStorage.getItem(key);
      const envelope = raw ? JSON.parse(raw) : { state: {}, version };
      const state = { ...(envelope.state ?? {}), sessions: seeded };
      window.localStorage.setItem(
        key,
        JSON.stringify({ ...envelope, state, version }),
      );
    },
    [STORE_KEY, STORE_VERSION, records],
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

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
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  let n = 0;
  /**
   * One frame. `focus` scrolls something into view first, for screens whose
   * interesting part sits below the fold at this height: a CSS selector or a
   * locator, centred by default, or aligned to the top with `block` when the
   * section is taller than the viewport and its opening is the part that matters.
   */
  const shot = async (name, focus, block = "center") => {
    if (focus) {
      const target = typeof focus === "string" ? page.locator(focus) : focus;
      await target
        .first()
        .evaluate((el, how) => el.scrollIntoView({ block: how, behavior: "instant" }), block);
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

  // Beliefs that came back after being explained. Present only when one did, and
  // this run does not control that, so the shots are skipped rather than forced.
  const survived = page.locator('section[aria-labelledby="survived-heading"]');
  if ((await survived.count()) > 0) {
    await shot("escalation-survived", survived);
    const again = page.getByRole("button", {
      name: /Explain this one|Explain this a different way/,
    });
    if ((await again.count()) > 0) {
      await again.first().click();
      await survived
        .getByRole("button", { name: "Read this aloud" })
        .first()
        .waitFor({ timeout: 40_000 });
      await page.waitForTimeout(500);
      // From the top of the survivor, so the frame opens on the style being named
      // and the reason for switching, which is the point of the second attempt.
      const attempt = survived.locator("li").filter({
        has: page.getByRole("button", { name: "Read this aloud" }),
      });
      await shot("escalation-second-style", attempt, "start");
      const handoff = survived.getByText("This one needs a person.");
      if ((await handoff.count()) > 0) {
        await shot("escalation-handoff", handoff);
      }
    }
  } else {
    console.log("no belief survived this run, skipping the escalation shots");
  }

  await visit("/dashboard");
  await seedHistory(page, seededHistory(Date.now()));
  await shot("dashboard");
  await shot("dashboard-study-plan", 'section[aria-labelledby="plan-heading"]');
  await shot("dashboard-weak-topics", 'section[aria-labelledby="weak-heading"]');
  await shot(
    "dashboard-calibration",
    'section[aria-labelledby="calibration-heading"]',
  );

  await context.close();
  await browser.close();
  console.log(
    `\n${n} shots in ${path.relative(process.cwd(), OUT)}, ` +
      `${VIEWPORT.width * SCALE}x${VIEWPORT.height * SCALE} each.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
