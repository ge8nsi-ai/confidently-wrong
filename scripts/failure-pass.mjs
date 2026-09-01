/**
 * Drives the four ways this app is meant to fail and records what a visitor sees.
 *
 * "It degrades gracefully" is a claim. A screenshot of the message, with the
 * status code that produced it and the number of requests it took, is evidence,
 * so this writes docs/failure-modes.md and the images beside it.
 *
 * Nothing here spends money. Two of the four guards are client-side and never
 * reach the server, the offline case never leaves the browser, and the rate-limit
 * case fills the limiter with bodies the route rejects before it calls a model.
 *
 * Usage: PORT=3100 npm start, then `npm run failures`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadChromium } from "./lib/chromium.mjs";

const BASE = process.env.AUDIT_BASE ?? "http://localhost:3100";
const OUT = path.join(process.cwd(), "docs", "failure-modes.md");
const SHOTS = path.join(process.cwd(), "docs", "failures");
const VIEWPORT = { width: 390, height: 844 };
const CARD = "section.glass";
const LIVE = 'p[aria-live="polite"]';

/** Over the 200-character floor, so the button is live and the request is real. */
const NOTES = [
  "Natural selection is not the only process that changes gene frequencies.",
  "Drift moves them at random, and in a small population it can fix a variant",
  "that selection would otherwise have removed. Selection acts on variation it",
  "did not create, and it cannot look ahead to a trait that would pay off later.",
].join(" ");

/**
 * Screenshots the card, then re-encodes it as WebP through the browser's own
 * canvas: four PNGs of this page came to 460KB, which is more than the whole of
 * public/, and these are documentation rather than pixel evidence of a colour.
 */
async function shot(page, name) {
  const png = await page.locator(CARD).first().screenshot({ animations: "disabled" });
  const webp = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    const url = canvas.toDataURL("image/webp", 0.9);
    return url.slice(url.indexOf(",") + 1);
  }, png.toString("base64"));
  await writeFile(path.join(SHOTS, `${name}.webp`), Buffer.from(webp, "base64"));
  return `failures/${name}.webp`;
}

async function fresh(page) {
  await page.goto(`${BASE}/packs/new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
}

/** Three words pasted: the guard is the disabled button, not an error. */
async function tooShort(page, calls) {
  await fresh(page);
  await page.fill("#material-text", "photosynthesis is hard");
  await page.waitForTimeout(150);
  const button = page.getByRole("button", { name: /Generate the pack/ });
  const counter = await page.getByText(/characters\./).first().innerText();
  return {
    name: "Three words pasted",
    trigger: 'The word count is under the 200-character floor ("photosynthesis is hard")',
    seen: `${counter.replace(/\s+/g, " ")} The button is disabled${
      (await button.isDisabled()) ? "" : ", but IT IS NOT, which is a bug"
    }.`,
    calls: calls.length,
    status: "no request",
    file: await shot(page, "three-words-pasted"),
  };
}

/** 9MB attached: rejected in the browser, so the upload never starts. */
async function oversized(page, calls) {
  await fresh(page);
  await page.setInputFiles("#material-file", {
    name: "lecture-notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(9 * 1024 * 1024, 0x20),
  });
  await page.getByText(/is over 8MB/).waitFor();
  return {
    name: "PDF over the size cap",
    trigger: "A 9MB PDF attached, against an 8MB cap",
    seen: (await page.locator(LIVE).innerText()).replace(/\s+/g, " "),
    calls: calls.length,
    status: "no request",
    file: await shot(page, "pdf-over-cap"),
  };
}

/** Network down: the fetch throws, and the catch has to say something useful. */
async function offline(page, context, calls) {
  await fresh(page);
  await page.fill("#material-text", NOTES);
  await context.setOffline(true);
  await page.getByRole("button", { name: /Generate the pack/ }).click();
  await page.getByText(/Check your connection/).waitFor({ timeout: 20_000 });
  const record = {
    name: "Offline",
    trigger: "The browser is offline when Generate is pressed",
    seen: (await page.locator(LIVE).innerText()).replace(/\s+/g, " "),
    calls: calls.length,
    status: "request never left the browser",
    file: await shot(page, "offline"),
  };
  await context.setOffline(false);
  return record;
}

/**
 * The limiter is 5 requests a minute per IP on this route. Five `{}` bodies fill
 * it (the route rejects each at 422 for having no material in it, which happens
 * before any model call), and the sixth request is the one a visitor makes.
 */
async function rateLimited(page, calls) {
  await fresh(page);
  const filling = await page.evaluate(async () => {
    const codes = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await fetch("/api/generate-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      codes.push(res.status);
    }
    return codes;
  });
  await page.fill("#material-text", NOTES);
  await page.getByRole("button", { name: /Generate the pack/ }).click();
  await page.getByText(/Too many requests/).waitFor({ timeout: 20_000 });
  const real = calls.at(-1);
  return {
    name: "Rate limited",
    trigger: `The limiter's 5 requests a minute are already spent (${filling.join(", ")})`,
    seen: (await page.locator(LIVE).innerText()).replace(/\s+/g, " "),
    calls: calls.length,
    status: `${real.status}, Retry-After: ${real.retryAfter ?? "none"}`,
    file: await shot(page, "rate-limited"),
  };
}

function report(records) {
  const lines = [
    "# Failure modes",
    "",
    `Run ${new Date().toISOString()} against the production build at ${VIEWPORT.width}x${VIEWPORT.height}, by \`npm run failures\`. Each row is a state the app was pushed into on purpose; the screenshot is of the card as it looked when the message appeared.`,
    "",
    "| Failure | Trigger | What the visitor sees | Requests | Server |",
    "| --- | --- | --- | --- | --- |",
    ...records.map(
      (r) =>
        `| [${r.name}](${r.file}) | ${r.trigger} | ${r.seen} | ${r.calls} | ${r.status} |`,
    ),
    "",
    "Two of the four never reach the network: the character floor and the size cap",
    "are checked in the browser, so a visitor who pastes too little or attaches too",
    "much spends nothing and waits for nothing. The offline case is the `catch` on",
    "the same `fetch`, which is why its message names the connection rather than the",
    "server. The rate limit is the only one the server decides, and it answers before",
    "it reads the body, so a client hammering the endpoint cannot spend money by",
    "sending large ones.",
    "",
    "The limiter is in-memory and per instance, which makes it a cost guard rather",
    "than a security control: the comment above each route handler says so, and says",
    "that the handler is public and unauthenticated.",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const chromium = await loadChromium();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  const calls = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/generate-pack")) {
      calls.push({ status: res.status(), retryAfter: res.headers()["retry-after"] });
    }
  });

  await mkdir(SHOTS, { recursive: true });
  const records = [];
  for (const step of [
    (p) => tooShort(p, calls),
    (p) => oversized(p, calls),
    (p) => offline(p, context, calls),
    (p) => rateLimited(p, calls),
  ]) {
    calls.length = 0;
    const record = await step(page);
    records.push(record);
    process.stdout.write(
      `${record.name.padEnd(24)} ${record.calls} request(s), ${record.status}\n`,
    );
  }

  await writeFile(OUT, report(records), "utf8");
  await context.close();
  await browser.close();
  process.stdout.write(`\nWritten to ${OUT}\n`);
}

await main();
