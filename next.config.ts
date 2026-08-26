import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack does not walk up past the repo.
  turbopack: { root: path.resolve(import.meta.dirname) },
};

export default nextConfig;
