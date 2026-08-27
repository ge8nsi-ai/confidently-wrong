import { defineConfig } from "vitest/config";

/**
 * Config for `npm run eval` only.
 *
 * The eval is not a test: it calls a paid API, it is slow, and its result is a
 * number rather than a pass. Keeping it out of the default include means `npm test`
 * stays free and offline.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
