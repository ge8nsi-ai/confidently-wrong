/**
 * Playwright is not a dependency of this app — a browser download is a lot to add
 * for two scripts nothing in the build or `npm test` calls — so it is used from
 * wherever it happens to be installed.
 */
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

export function loadChromium() {
  const candidates = [
    "playwright",
    path.join(
      homedir(),
      "AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright",
    ),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate).chromium;
    } catch {
      continue;
    }
  }
  throw new Error("playwright not found — npm i -D playwright, or npx playwright");
}
