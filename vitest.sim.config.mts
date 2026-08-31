import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Config for `npm run sim` only.
 *
 * The cohort run is not a test: it writes a report, and its output is a set of numbers
 * rather than a pass. Unlike `npm run eval` it costs nothing and calls nothing, but it
 * is kept out of `npm test` for the same reason. A file that rewrites a report is not
 * something to run on every save. The harness's own assertions live in
 * `sim/learner.test.ts`, which `npm test` does run.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["sim/**/*.sim.ts"],
    testTimeout: 120_000,
  },
  resolve: {
    // Mirrors the "@/*" path in tsconfig, the same way vitest.config.mts does.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
