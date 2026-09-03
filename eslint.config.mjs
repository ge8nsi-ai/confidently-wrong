import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local working directories, none of them committed: recording scripts, video
    // projects with vendored tarballs unpacked inside them, and generated images.
    // `npm run lint` is a bare `eslint`, so without these it walks whatever a
    // previous session happened to leave on disk and reports on someone else's code.
    "demo/**",
    "videos/**",
    "shots/**",
    "submission/**",
  ]),
]);

export default eslintConfig;
