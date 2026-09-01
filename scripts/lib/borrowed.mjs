/**
 * Resolves a package that is not a dependency of this app.
 *
 * Playwright and Lighthouse both drive a real browser, which is a lot to add to a
 * repo whose own public/ directory is 99 KB, for scripts that nothing in the build
 * or `npm test` calls. So they are used from wherever they happen to be installed:
 * a devDependency if someone added one, otherwise whatever npx left in its cache
 * the first time the script ran. The cache directory names are content hashes, so
 * they are read rather than hardcoded.
 */
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

function candidates(name) {
  const cache = path.join(homedir(), "AppData/Local/npm-cache/_npx");
  let hashes = [];
  try {
    hashes = readdirSync(cache);
  } catch {
    hashes = [];
  }
  return [name, ...hashes.map((h) => path.join(cache, h, "node_modules", name))];
}

/**
 * Imports by resolved entry path rather than by `require`, so an ESM-only package
 * loads the same way a CommonJS one does. A CommonJS module arrives as `default`.
 *
 * @param {string} name package to load, e.g. "playwright"
 * @returns {Promise<Record<string, unknown>>} the module namespace
 */
export async function borrow(name) {
  for (const candidate of candidates(name)) {
    let entry;
    try {
      entry = require.resolve(candidate);
    } catch {
      continue;
    }
    return await import(pathToFileURL(entry).href);
  }
  throw new Error(`${name} not found: npm i -D ${name}, or run it once with npx`);
}
