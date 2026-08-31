import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors the "@/*" path in tsconfig, so a component test imports the same
    // specifiers the component itself does.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "components/**/*.test.tsx",
      // The cohort harness's own arithmetic. The cohort run itself is not here: it
      // writes a report rather than asserting, and lives behind `npm run sim`.
      "sim/**/*.test.ts",
    ],
  },
});
