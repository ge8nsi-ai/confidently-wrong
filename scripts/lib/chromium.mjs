/**
 * Playwright is not a dependency of this app. See scripts/lib/borrowed.mjs for why,
 * and where it is looked for.
 */
import { borrow } from "./borrowed.mjs";

export async function loadChromium() {
  const playwright = await borrow("playwright");
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) throw new Error("playwright loaded but exports no chromium");
  return chromium;
}
