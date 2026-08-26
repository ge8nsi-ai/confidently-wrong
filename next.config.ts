import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack does not walk up past the repo.
  turbopack: { root: path.resolve(import.meta.dirname) },

  // Dev only: let phones on the LAN load /_next/static chunks. Without this the
  // page ships its server HTML, never hydrates, and sits on the loading state.
  allowedDevOrigins: ["192.168.10.34", "*.local"],
};

export default nextConfig;
